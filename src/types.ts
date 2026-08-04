export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
};

export type GroupMember = {
  id: string;
  group_id: string;
  email: string;
  profile_id: string | null;
  status: "pending" | "active";
  joined_at: string | null;
  // joined client-side from profiles
  display_name?: string | null;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  // joined client-side
  members?: GroupMember[];
};

export type EditEntry = {
  id: string;
  expense_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
};

export type Expense = {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  paid_by: string;
  split_among: string[];
  custom_splits?: Record<string, number> | null;
  status: "confirmed" | "disputed";
  added_by: string;
  created_at: string;
  updated_at: string | null;
  // joined client-side
  editHistory?: EditEntry[];
};

export type Settlement = {
  from: string;
  to: string;
  amount: number;
  status: "pending" | "paid";
  paidAt?: number;
};

export type Tab = "expenses" | "settle" | "reminders";
