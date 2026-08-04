/*
# Settl: Auth, groups, members, expenses, and history schema

## Overview
Creates the full database schema for the Settl expense-splitting app with
Supabase Auth (email OTP), group management, expense tracking, and
minimum-transaction settlement support.

## New Tables

### profiles
- id (uuid, PK, matches auth.users.id)
- email (text, not null)
- display_name (text, nullable — set during onboarding)
- created_at (timestamptz)

### groups
- id (uuid, PK)
- name (text, not null)
- created_by (uuid, not null, defaults to auth.uid())
- created_at (timestamptz)

### group_members
- id (uuid, PK)
- group_id (uuid, FK to groups, cascade delete)
- email (text, not null — used for invitation matching)
- profile_id (uuid, FK to auth.users, nullable until user signs up)
- status (text: 'pending' | 'active', default 'pending')
- joined_at (timestamptz, set when activated)
- Unique constraint on (group_id, email)

### expenses
- id (uuid, PK)
- group_id (uuid, FK to groups, cascade delete)
- description (text, not null)
- amount (numeric(12,2), not null)
- paid_by (uuid, FK to auth.users, not null)
- split_among (uuid[], not null, default empty array)
- custom_splits (jsonb, nullable)
- status (text: 'confirmed' | 'disputed', default 'confirmed')
- added_by (uuid, not null, defaults to auth.uid())
- created_at (timestamptz)
- updated_at (timestamptz, set on update via trigger)

### expense_history
- id (uuid, PK)
- expense_id (uuid, FK to expenses, cascade delete)
- field (text, not null)
- old_value (text)
- new_value (text)
- changed_by (uuid, FK to auth.users)
- changed_at (timestamptz)

## Security (RLS)

All tables have RLS enabled. Policies enforce:
- Profiles: users read their own profile + profiles of groupmates; insert own;
  update own only
- Groups: users read groups where they're an active member or creator; create
  with created_by = self; update/delete by creator only
- Group members: active members and group creator can read; active members and
  creator can invite (insert); no client-side updates (trigger handles activation)
- Expenses: active members can read; active members can insert (added_by = self);
  active members can update (trigger enforces adder-only for field edits, others
  can only change status); only adder can delete
- Expense history: active members can read; insert via trigger only

## Triggers

1. on_auth_user_created (AFTER INSERT on auth.users):
   - Creates a profile row with the user's id and email
   - Activates any pending group_members where email matches

2. before_update_expense_rules (BEFORE UPDATE on expenses):
   - If updater is the adder: allow any change, set updated_at
   - If updater is not the adder: only allow status field change, raise
     exception otherwise

3. after_update_expense_history (AFTER UPDATE on expenses):
   - Records changes to description, amount, paid_by, split_among into
     expense_history
   - Does NOT record status changes (confirm/dispute is an action, not an edit)

## Helper Functions
- is_active_member(group_id): returns true if auth.uid() is an active member of
  the group. SECURITY DEFINER to avoid RLS recursion.
*/

-- 1. Tables

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  email text NOT NULL,
  profile_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  joined_at timestamptz,
  UNIQUE(group_id, email)
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  paid_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  split_among uuid[] NOT NULL DEFAULT '{}',
  custom_splits jsonb,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'disputed')),
  added_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.expense_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz DEFAULT now()
);

-- 2. Enable RLS

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;

-- 3. Helper function (needs group_members to exist)

CREATE OR REPLACE FUNCTION public.is_active_member(gid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = gid
    AND profile_id = auth.uid()
    AND status = 'active'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 4. Policies

-- profiles SELECT: own profile or profiles of groupmates
DROP POLICY IF EXISTS "read_own_or_groupmate_profile" ON public.profiles;
CREATE POLICY "read_own_or_groupmate_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.group_members gm1
      JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.profile_id = auth.uid()
      AND gm2.profile_id = public.profiles.id
      AND gm1.status = 'active'
      AND gm2.status = 'active'
    )
  );

-- profiles INSERT: user can insert their own profile (fallback if trigger misses)
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- profiles UPDATE: user can update their own profile (display name onboarding)
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- groups SELECT: active members or creator
DROP POLICY IF EXISTS "read_member_or_creator_groups" ON public.groups;
CREATE POLICY "read_member_or_creator_groups" ON public.groups
  FOR SELECT TO authenticated
  USING (
    public.is_active_member(id)
    OR created_by = auth.uid()
  );

-- groups INSERT: any authenticated user, created_by must be self
DROP POLICY IF EXISTS "insert_own_group" ON public.groups;
CREATE POLICY "insert_own_group" ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- groups UPDATE: creator only
DROP POLICY IF EXISTS "update_own_group" ON public.groups;
CREATE POLICY "update_own_group" ON public.groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- groups DELETE: creator only
DROP POLICY IF EXISTS "delete_own_group" ON public.groups;
CREATE POLICY "delete_own_group" ON public.groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- group_members SELECT: active members or group creator
DROP POLICY IF EXISTS "read_group_members" ON public.group_members;
CREATE POLICY "read_group_members" ON public.group_members
  FOR SELECT TO authenticated
  USING (
    public.is_active_member(group_id)
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
    )
  );

-- group_members INSERT: active members or creator can invite
DROP POLICY IF EXISTS "invite_group_member" ON public.group_members;
CREATE POLICY "invite_group_member" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_member(group_id)
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
      AND g.created_by = auth.uid()
    )
  );

-- expenses SELECT: active members of the group
DROP POLICY IF EXISTS "read_group_expenses" ON public.expenses;
CREATE POLICY "read_group_expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (public.is_active_member(group_id));

-- expenses INSERT: active members, added_by must be self
DROP POLICY IF EXISTS "insert_group_expense" ON public.expenses;
CREATE POLICY "insert_group_expense" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND public.is_active_member(group_id)
  );

-- expenses UPDATE: active members can update (trigger enforces adder-only for
-- field edits; non-adders can only change status)
DROP POLICY IF EXISTS "update_group_expense" ON public.expenses;
CREATE POLICY "update_group_expense" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.is_active_member(group_id))
  WITH CHECK (public.is_active_member(group_id));

-- expenses DELETE: only the adder
DROP POLICY IF EXISTS "delete_own_expense" ON public.expenses;
CREATE POLICY "delete_own_expense" ON public.expenses
  FOR DELETE TO authenticated
  USING (added_by = auth.uid());

-- expense_history SELECT: active members of the expense's group
DROP POLICY IF EXISTS "read_expense_history" ON public.expense_history;
CREATE POLICY "read_expense_history" ON public.expense_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_history.expense_id
      AND public.is_active_member(e.group_id)
    )
  );

-- 5. Trigger functions

-- Auto-create profile + activate pending invitations on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.group_members
  SET status = 'active', profile_id = NEW.id, joined_at = now()
  WHERE email = NEW.email AND status = 'pending';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Enforce: only adder can edit fields; others can only change status
CREATE OR REPLACE FUNCTION public.enforce_expense_edit_rules()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.added_by = auth.uid() THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF NEW.description IS DISTINCT FROM OLD.description
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.split_among IS DISTINCT FROM OLD.split_among
     OR NEW.custom_splits IS DISTINCT FROM OLD.custom_splits
     OR NEW.added_by IS DISTINCT FROM OLD.added_by THEN
    RAISE EXCEPTION 'Only the person who added this expense can edit it';
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Record field changes into expense_history (not status changes)
CREATE OR REPLACE FUNCTION public.record_expense_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    INSERT INTO public.expense_history (expense_id, field, old_value, new_value, changed_by)
    VALUES (OLD.id, 'description', OLD.description, NEW.description, auth.uid());
  END IF;
  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    INSERT INTO public.expense_history (expense_id, field, old_value, new_value, changed_by)
    VALUES (OLD.id, 'amount', OLD.amount::text, NEW.amount::text, auth.uid());
  END IF;
  IF NEW.paid_by IS DISTINCT FROM OLD.paid_by THEN
    INSERT INTO public.expense_history (expense_id, field, old_value, new_value, changed_by)
    VALUES (OLD.id, 'paid_by', OLD.paid_by::text, NEW.paid_by::text, auth.uid());
  END IF;
  IF NEW.split_among IS DISTINCT FROM OLD.split_among THEN
    INSERT INTO public.expense_history (expense_id, field, old_value, new_value, changed_by)
    VALUES (OLD.id, 'split_among', OLD.split_among::text, NEW.split_among::text, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Triggers

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS before_update_expense_rules ON public.expenses;
CREATE TRIGGER before_update_expense_rules
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_edit_rules();

DROP TRIGGER IF EXISTS after_update_expense_history ON public.expenses;
CREATE TRIGGER after_update_expense_history
  AFTER UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.record_expense_history();

-- 7. Indexes

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_profile_id ON public.group_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_group_members_email ON public.group_members(email);
CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON public.expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_added_by ON public.expenses(added_by);
CREATE INDEX IF NOT EXISTS idx_expense_history_expense_id ON public.expense_history(expense_id);
