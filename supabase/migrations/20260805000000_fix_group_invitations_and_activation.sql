-- Fix group member invitations and automatic activation
-- 1. Create SECURITY DEFINER function to activate pending memberships for the logged in user
CREATE OR REPLACE FUNCTION public.activate_my_memberships()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.group_members
    SET status = 'active',
        profile_id = auth.uid(),
        joined_at = COALESCE(joined_at, now())
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
      AND (status = 'pending' OR profile_id IS NULL);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_my_memberships() TO authenticated, anon;

-- 2. Update handle_new_user trigger to handle case-insensitive and trimmed email matching
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, LOWER(TRIM(NEW.email)))
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.group_members
  SET status = 'active',
      profile_id = NEW.id,
      joined_at = COALESCE(joined_at, now())
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))
    AND (status = 'pending' OR profile_id IS NULL);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Allow users to update their own group_members row to activate themselves
DROP POLICY IF EXISTS "update_own_group_member" ON public.group_members;
CREATE POLICY "update_own_group_member" ON public.group_members
  FOR UPDATE TO authenticated
  USING (
    profile_id = auth.uid()
    OR LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
  )
  WITH CHECK (
    profile_id = auth.uid()
    OR LOWER(TRIM(email)) = LOWER(TRIM(auth.jwt() ->> 'email'))
  );
