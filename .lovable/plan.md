## Root cause

`app_private.is_super_admin(_user_id)` still calls `public.has_role(...)`, but an earlier migration moved `has_role` to the `app_private` schema. Every RLS check on `recordings` runs `has_group_access` → `is_super_admin` → `public.has_role`, which no longer exists — hence the error for both users.

## Fix

One migration, redefine `is_super_admin` to call the moved function:

```sql
CREATE OR REPLACE FUNCTION app_private.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app_private.has_role(_user_id, 'super_admin'::public.app_role);
$$;
```

No application code changes.

## Verification

After the migration, sign in as either user and open Recordings — the 4 READY worker rows load without the "function public.has_role does not exist" error.
