/*
# Backend Settlements and Reminders Schema Additions

1. New Tables
   - `settlements`: Stores record of completed/paid settlement transactions between group members.
     - `id` (uuid, PK)
     - `group_id` (uuid, FK to groups, cascade delete)
     - `from_profile_id` (uuid, FK to auth.users, cascade delete)
     - `to_profile_id` (uuid, FK to auth.users, cascade delete)
     - `amount` (numeric(12,2), not null check > 0)
     - `status` (text: 'paid', default 'paid')
     - `paid_at` (timestamptz, default now())
     - `created_at` (timestamptz, default now())

2. Table Alterations
   - Add `last_reminded_at` timestamptz column to `public.groups` table.

3. RLS Policies for `settlements`
   - Active group members can read settlements in their groups.
   - Active group members can insert settlements for their groups.
*/

-- 1. Create settlements table
CREATE TABLE IF NOT EXISTS public.settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  from_profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid')),
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 2. Add last_reminded_at to groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

-- 3. Enable RLS on settlements
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- 4. Settlements RLS Policies
DROP POLICY IF EXISTS "read_group_settlements" ON public.settlements;
CREATE POLICY "read_group_settlements" ON public.settlements
  FOR SELECT TO authenticated
  USING (public.is_active_member(group_id));

DROP POLICY IF EXISTS "insert_group_settlements" ON public.settlements;
CREATE POLICY "insert_group_settlements" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member(group_id));

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON public.settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from_profile ON public.settlements(from_profile_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to_profile ON public.settlements(to_profile_id);
