import { supabase } from "./supabase";
import type { Expense, Group, GroupMember, Profile } from "./types";

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", userId)
    .maybeSingle();
  return data as Profile | null;
}

export async function updateDisplayName(
  userId: string,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userId);
  if (error) throw error;
}

export async function fetchUserGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Group[];
}

export async function createGroup(
  name: string,
  creatorId: string
): Promise<Group> {
  const { data, error } = await supabase
    .from("groups")
    .insert({ name, created_by: creatorId })
    .select("id, name, created_by, created_at")
    .single();
  if (error) throw error;
  return data as Group;
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id, group_id, email, profile_id, status, joined_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as GroupMember[];
}

export async function inviteMember(
  groupId: string,
  email: string
): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, email, status: "pending" });
  if (error) throw error;
}

export async function activateMember(
  groupId: string,
  email: string,
  profileId: string
): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .update({ status: "active", profile_id: profileId, joined_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("email", email);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}

export async function fetchGroupProfiles(
  memberIds: string[]
): Promise<Profile[]> {
  if (memberIds.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name")
    .in("id", memberIds);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchExpenses(groupId: string): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select("id, group_id, description, amount, paid_by, split_among, custom_splits, status, added_by, created_at, updated_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Expense[];
}

export async function fetchExpenseHistory(expenseIds: string[]): Promise<Map<string, any[]>> {
  if (expenseIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("expense_history")
    .select("id, expense_id, field, old_value, new_value, changed_by, changed_at")
    .in("expense_id", expenseIds)
    .order("changed_at", { ascending: true });
  if (error) throw error;
  const map = new Map<string, any[]>();
  for (const h of data ?? []) {
    const arr = map.get(h.expense_id) ?? [];
    arr.push(h);
    map.set(h.expense_id, arr);
  }
  return map;
}

export async function addExpense(
  groupId: string,
  data: {
    description: string;
    amount: number;
    paid_by: string;
    split_among: string[];
    custom_splits?: Record<string, number> | null;
    added_by: string;
  }
): Promise<Expense> {
  const { data: row, error } = await supabase
    .from("expenses")
    .insert({
      group_id: groupId,
      description: data.description,
      amount: data.amount,
      paid_by: data.paid_by,
      split_among: data.split_among,
      custom_splits: data.custom_splits ?? null,
      added_by: data.added_by,
    })
    .select("id, group_id, description, amount, paid_by, split_among, custom_splits, status, added_by, created_at, updated_at")
    .single();
  if (error) throw error;
  return row as Expense;
}

export async function updateExpenseStatus(
  expenseId: string,
  status: "confirmed" | "disputed"
): Promise<void> {
  const { error } = await supabase
    .from("expenses")
    .update({ status })
    .eq("id", expenseId);
  if (error) throw error;
}
