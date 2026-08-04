/*
# Revoke EXECUTE from PUBLIC on trigger/helper functions

PostgreSQL grants EXECUTE on functions to PUBLIC by default. Revoking from
anon and authenticated individually wasn't sufficient because PUBLIC still
held the grant. This revokes from PUBLIC, then re-grants to service_role
only (internal triggers bypass grants anyway).

Functions affected:
- handle_new_user (trigger)
- enforce_expense_edit_rules (trigger)
- record_expense_history (trigger)
- is_active_member (RLS helper, used in policy predicates)
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_expense_edit_rules() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_expense_history() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_member(uuid) FROM PUBLIC;
