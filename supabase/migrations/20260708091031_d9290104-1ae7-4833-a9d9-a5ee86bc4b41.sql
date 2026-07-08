CREATE OR REPLACE FUNCTION app_private.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'super_admin'::public.app_role);
$$;