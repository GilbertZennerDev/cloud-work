
-- Clean slate for recordings (empty already, but guarantees consistency)
DELETE FROM public.recordings;

-- ============================================================
-- 1. Roles
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'super_admin'::public.app_role);
$$;

CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Auto-grant super_admin to zennergilbert@gmail.com on confirmed email
CREATE OR REPLACE FUNCTION public.grant_super_admin_for_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'zennergilbert@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_super_admin_for_owner();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_owner
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.grant_super_admin_for_owner();

-- Backfill for existing account, if already confirmed
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'zennergilbert@gmail.com'
  AND email_confirmed_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. Groups + membership
-- ============================================================
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_group_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT group_id FROM public.group_members WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.has_group_access(_user_id uuid, _group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.group_members
        WHERE user_id = _user_id AND group_id = _group_id
      );
$$;

CREATE POLICY "Members read own group" ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR id = public.current_group_id(auth.uid()));
CREATE POLICY "Super admin writes groups" ON public.groups
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Members read own membership" ON public.group_members
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR group_id = public.current_group_id(auth.uid())
  );
CREATE POLICY "Super admin writes memberships" ON public.group_members
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER groups_set_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. Recordings: swap user-based RLS for group-based RLS
-- ============================================================
ALTER TABLE public.recordings ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;
CREATE INDEX recordings_group_id_idx ON public.recordings(group_id);

DROP POLICY IF EXISTS "Users read own recordings" ON public.recordings;
DROP POLICY IF EXISTS "Users insert own recordings" ON public.recordings;
DROP POLICY IF EXISTS "Users update own recordings" ON public.recordings;
DROP POLICY IF EXISTS "Users delete own recordings" ON public.recordings;

CREATE POLICY "Group members read recordings" ON public.recordings
  FOR SELECT TO authenticated
  USING (group_id IS NOT NULL AND public.has_group_access(auth.uid(), group_id));
CREATE POLICY "Group members insert recordings" ON public.recordings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND group_id IS NOT NULL
    AND public.has_group_access(auth.uid(), group_id)
  );
CREATE POLICY "Group members update recordings" ON public.recordings
  FOR UPDATE TO authenticated
  USING (group_id IS NOT NULL AND public.has_group_access(auth.uid(), group_id))
  WITH CHECK (group_id IS NOT NULL AND public.has_group_access(auth.uid(), group_id));
CREATE POLICY "Group members delete recordings" ON public.recordings
  FOR DELETE TO authenticated
  USING (group_id IS NOT NULL AND public.has_group_access(auth.uid(), group_id));

-- Auto-populate group_id from the inserter's membership
CREATE OR REPLACE FUNCTION public.set_recording_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    NEW.group_id := public.current_group_id(NEW.user_id);
  END IF;
  IF NEW.group_id IS NULL THEN
    RAISE EXCEPTION 'User % is not a member of any group', NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS recordings_set_group ON public.recordings;
CREATE TRIGGER recordings_set_group
  BEFORE INSERT ON public.recordings
  FOR EACH ROW EXECUTE FUNCTION public.set_recording_group();

-- ============================================================
-- 4. Storage: broaden bucket access to group members
-- ============================================================
DROP POLICY IF EXISTS "Users read own recording files" ON storage.objects;
DROP POLICY IF EXISTS "Users insert own recording files" ON storage.objects;
DROP POLICY IF EXISTS "Users update own recording files" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own recording files" ON storage.objects;

-- The storage path is `{user_id}/...`. Access is granted to any group member
-- who shares a group with the owner (folder = owner user_id).
CREATE POLICY "Group members read recording files" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'recordings' AND (
      public.is_super_admin(auth.uid())
      OR (
        public.current_group_id(auth.uid()) IS NOT NULL
        AND public.current_group_id(auth.uid()) = public.current_group_id(((storage.foldername(name))[1])::uuid)
      )
    )
  );
CREATE POLICY "Owner writes recording files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_group_id(auth.uid()) IS NOT NULL
  );
CREATE POLICY "Group members update recording files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recordings' AND (
      public.is_super_admin(auth.uid())
      OR (
        public.current_group_id(auth.uid()) IS NOT NULL
        AND public.current_group_id(auth.uid()) = public.current_group_id(((storage.foldername(name))[1])::uuid)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'recordings' AND (
      public.is_super_admin(auth.uid())
      OR (
        public.current_group_id(auth.uid()) IS NOT NULL
        AND public.current_group_id(auth.uid()) = public.current_group_id(((storage.foldername(name))[1])::uuid)
      )
    )
  );
CREATE POLICY "Group members delete recording files" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'recordings' AND (
      public.is_super_admin(auth.uid())
      OR (
        public.current_group_id(auth.uid()) IS NOT NULL
        AND public.current_group_id(auth.uid()) = public.current_group_id(((storage.foldername(name))[1])::uuid)
      )
    )
  );
