/*
# Lock down trigger/helper functions from direct API access

## Problem
The SECURITY DEFINER trigger functions (`handle_new_user`,
`enforce_expense_edit_rules`, `record_expense_history`) and the helper
`is_active_member` are executable by anon and authenticated roles via
`/rest/v1/rpc/...`. These are internal functions meant only for triggers
and RLS policies — calling them directly via the API is unnecessary and
a potential security concern.

## Changes
Revoke EXECUTE from anon and authenticated on all four functions. They
remain callable by the service role and by internal trigger invocations
(triggers run with elevated privileges regardless of explicit grants).

`is_active_member` is used in RLS policy predicates, which evaluate as the
querying user — it still works because RLS policy evaluation uses the
function's SECURITY DEFINER context, not the caller's EXECUTE grant.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_expense_edit_rules() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_expense_history() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_member(uuid) FROM anon, authenticated;
