/*
# Fix: activate creator membership + add group_members DELETE policy

## Problem
When a group creator invites themselves (via their own email), the row is
inserted as `status = 'pending'`. The `handle_new_user` trigger only fires
on new auth.users inserts, so an already-signed-up creator never gets
activated — they can't add expenses because `is_active_member` returns false.

## Changes
1. Add UPDATE policy on group_members: the group creator can update member
   rows (specifically to activate their own membership or manage invites).
   Active members cannot update (the trigger handles auto-activation).
2. Add DELETE policy on group_members: the group creator can remove any
   member row (e.g. cancel a pending invite). Active members can remove
   themselves only.

## Security
- UPDATE: creator only (active members have no need to update; the
  auto-activation trigger runs as SECURITY DEFINER and bypasses RLS)
- DELETE: creator can delete any row; active members can delete their own row
*/

-- UPDATE policy: group creator can update member rows
DROP POLICY IF EXISTS "update_group_members_creator" ON public.group_members;
CREATE POLICY "update_group_members_creator" ON public.group_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
    )
  );

-- DELETE policy: creator can remove any member; members can remove themselves
DROP POLICY IF EXISTS "delete_group_members" ON public.group_members;
CREATE POLICY "delete_group_members" ON public.group_members
  FOR DELETE TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
    )
  );
