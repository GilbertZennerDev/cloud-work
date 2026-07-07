GRANT USAGE ON SCHEMA app_private TO authenticated, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.current_group_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_group_access(uuid, uuid) TO authenticated;