import { supabase } from "./supabase";
import type { Expense, Group, GroupMember, Profile, Settlement } from "./types";

const defaultHost = typeof window !== "undefined" && window.location.hostname ? window.location.hostname : "localhost";
const API_BASE_URL = import.meta.env.VITE_API_URL || `http://${defaultHost}:3000`;

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Automatically activate pending memberships for the logged in user
  if (user.email) {
    try {
      await supabase
        .from("group_members")
        .update({
          status: "active",
          profile_id: user.id,
          joined_at: new Date().toISOString(),
        })
        .ilike("email", user.email.trim())
        .or("status.eq.pending,profile_id.is.null");
    } catch {
      // Ignore fallback error
    }
  }

  // Find all groups where the user is creator OR listed in group_members by profile_id or email
  const { data: memberRows } = await supabase
    .from("group_members")
    .select("group_id")
    .or(`profile_id.eq.${user.id},email.ilike.${user.email}`);

  const groupIds = Array.from(new Set((memberRows ?? []).map((m) => m.group_id)));

  let query = supabase
    .from("groups")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: false });

  if (groupIds.length > 0) {
    query = query.or(`created_by.eq.${user.id},id.in.(${groupIds.join(",")})`);
  } else {
    query = query.eq("created_by", user.id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Group[];
}

export async function createGroup(
  name: string,
  creatorId: string
): Promise<Group> {
  try {
    return await apiFetch<Group>("/groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    console.warn("Backend API createGroup failed, using direct Supabase fallback:", err);
    const { data, error } = await supabase
      .from("groups")
      .insert({ name: name.trim(), created_by: creatorId })
      .select("id, name, created_by, created_at")
      .single();
    if (error) throw error;
    return data as Group;
  }
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
  try {
    await apiFetch(`/groups/${groupId}/invite`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  } catch (err) {
    console.warn("Backend API inviteMember failed, using direct Supabase fallback:", err);
    const cleanEmail = email.trim().toLowerCase();
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", cleanEmail)
      .maybeSingle();

    const profileId = existingProfile?.id || null;
    const status = profileId ? "active" : "pending";
    const joinedAt = profileId ? new Date().toISOString() : null;

    const { error } = await supabase.from("group_members").insert({
      group_id: groupId,
      email: cleanEmail,
      profile_id: profileId,
      status: status,
      joined_at: joinedAt,
    });
    if (error && error.code !== "23505") throw error;
  }
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
  try {
    return await apiFetch<Expense>(`/groups/${groupId}/expenses`, {
      method: "POST",
      body: JSON.stringify({
        description: data.description,
        amount: data.amount,
        paid_by: data.paid_by,
        split_among: data.split_among,
        custom_splits: data.custom_splits ?? null,
      }),
    });
  } catch (err) {
    console.warn("Backend API addExpense failed, using direct Supabase fallback:", err);
    const { data: created, error } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        description: data.description.trim(),
        amount: data.amount,
        paid_by: data.paid_by,
        split_among: data.split_among,
        custom_splits: data.custom_splits ?? null,
        status: "confirmed",
        added_by: data.added_by,
      })
      .select("*")
      .single();
    if (error) throw error;
    return created as Expense;
  }
}

export async function updateExpenseStatus(
  expenseId: string,
  status: "confirmed" | "disputed"
): Promise<void> {
  try {
    const action = status === "confirmed" ? "confirm" : "dispute";
    await apiFetch(`/expenses/${expenseId}/${action}`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("Backend API updateExpenseStatus failed, using direct Supabase fallback:", err);
    const { error } = await supabase
      .from("expenses")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", expenseId);
    if (error) throw error;
  }
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
  try {
    await apiFetch("/settlements/mark-paid", {
      method: "POST",
      body: JSON.stringify({
        group_id: groupId,
        from,
        to,
        amount,
      }),
    });
  } catch (err) {
    console.warn("Backend mark-paid API error, using direct Supabase client fallback:", err);
    const { error } = await supabase
      .from("settlements")
      .insert({
        group_id: groupId,
        from_profile_id: from,
        to_profile_id: to,
        amount: amount,
        status: "paid",
        paid_at: new Date().toISOString(),
      });
    if (error) throw error;
  }
}

export async function fetchPaidSettlements(groupId: string): Promise<Settlement[]> {
  try {
    const { data } = await supabase
      .from("settlements")
      .select("from_profile_id, to_profile_id, amount, status, paid_at")
      .eq("group_id", groupId)
      .eq("status", "paid");

    if (!data) return [];
    return data.map((s) => ({
      from: s.from_profile_id,
      to: s.to_profile_id,
      amount: Number(s.amount),
      status: s.status as "paid",
      paidAt: new Date(s.paid_at).getTime(),
    }));
  } catch {
    return [];
  }
}
