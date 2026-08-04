import { supabase } from "./supabase";
import type { Expense, Group, GroupMember, Profile, Settlement } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

async function getAuthHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeader();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

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
  try {
    await supabase.rpc("activate_my_memberships");
  } catch {
    // ignore if RPC doesn't exist yet
  }

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Group[];
}

export async function createGroup(
  name: string,
  _creatorId: string
): Promise<Group> {
  return apiFetch<Group>("/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  try {
    const groupData = await apiFetch<{ members: GroupMember[] }>(`/groups/${groupId}`);
    return groupData.members ?? [];
  } catch {
    // Fallback to direct supabase query if backend is unreachable
    const { data, error } = await supabase
      .from("group_members")
      .select("id, group_id, email, profile_id, status, joined_at")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as GroupMember[];
  }
}

export async function inviteMember(
  groupId: string,
  email: string
): Promise<void> {
  await apiFetch(`/groups/${groupId}/invite`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
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
  return apiFetch<Expense>(`/groups/${groupId}/expenses`, {
    method: "POST",
    body: JSON.stringify({
      description: data.description,
      amount: data.amount,
      paid_by: data.paid_by,
      split_among: data.split_among,
      custom_splits: data.custom_splits ?? null,
    }),
  });
}

export async function updateExpenseStatus(
  expenseId: string,
  status: "confirmed" | "disputed"
): Promise<void> {
  const action = status === "confirmed" ? "confirm" : "dispute";
  await apiFetch(`/expenses/${expenseId}/${action}`, {
    method: "POST",
  });
}

export async function fetchBackendSettlement(groupId: string): Promise<{
  transactions: Settlement[];
  paid_settlements: any[];
}> {
  return apiFetch<{ transactions: Settlement[]; paid_settlements: any[] }>(
    `/groups/${groupId}/settlement`
  );
}

export async function markSettlementPaidOnBackend(
  groupId: string,
  from: string,
  to: string,
  amount: number
): Promise<void> {
  await apiFetch("/settlements/mark-paid", {
    method: "POST",
    body: JSON.stringify({
      group_id: groupId,
      from,
      to,
      amount,
    }),
  });
}
