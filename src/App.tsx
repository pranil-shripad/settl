import { useCallback, useEffect, useState } from "react";
import type { Expense, Group, GroupMember, Profile, Settlement, Tab } from "./types";
import { AuthProvider, useAuth } from "./auth";
import { AuthScreen } from "./components/AuthScreen";
import { Landing } from "./components/Landing";
import { TopNav } from "./components/TopNav";
import { ExpenseFeed } from "./components/ExpenseFeed";
import { SettleUpView } from "./components/SettleUpView";
import { RemindersPanel } from "./components/RemindersPanel";
import { ToastProvider, useToast } from "./components/Toast";
import { supabase } from "./supabase";
import {
  fetchExpenses,
  fetchExpenseHistory,
  fetchGroupMembers,
  fetchGroupProfiles,
  fetchPaidSettlements,
  markSettlementPaidOnBackend,
  updateExpenseStatus,
} from "./data";

function AppInner() {
  const { push } = useToast();
  const { session, profile, loading } = useAuth();
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState<Tab>("expenses");
  const [paid, setPaid] = useState<Settlement[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const loadGroupData = useCallback(async (group: Group, isInitialLoad = false) => {
    if (isInitialLoad) setGroupLoading(true);
    try {
      const [membs, exps, paidStls] = await Promise.all([
        fetchGroupMembers(group.id),
        fetchExpenses(group.id),
        fetchPaidSettlements(group.id),
      ]);
      setMembers(membs);
      setPaid(paidStls);

      // Fetch profiles for all active member profile_ids
      const profileIds = membs
        .map((m) => m.profile_id)
        .filter((id): id is string => id !== null);
      // Also include profile_ids from expenses (paid_by, split_among, added_by)
      for (const e of exps) {
        profileIds.push(e.paid_by, e.added_by);
        for (const id of e.split_among) profileIds.push(id);
      }
      const uniqueIds = [...new Set(profileIds)];
      const profs = await fetchGroupProfiles(uniqueIds);
      setProfiles(new Map(profs.map((p) => [p.id, p])));

      // Attach edit history
      const history = await fetchExpenseHistory(exps.map((e) => e.id));
      const enriched = exps.map((e) => ({
        ...e,
        editHistory: history.get(e.id) ?? [],
      }));
      setExpenses(enriched);
    } finally {
      if (isInitialLoad) setGroupLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentGroup) return;
    loadGroupData(currentGroup, true);

    // Subscribe to Realtime WebSocket updates for expenses, group_members, and settlements
    const channel = supabase
      .channel(`group-realtime-${currentGroup.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `group_id=eq.${currentGroup.id}`,
        },
        () => {
          loadGroupData(currentGroup, false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${currentGroup.id}`,
        },
        () => {
          loadGroupData(currentGroup, false);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "settlements",
          filter: `group_id=eq.${currentGroup.id}`,
        },
        () => {
          loadGroupData(currentGroup, false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentGroup, loadGroupData]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold text-ink-400">Loading…</span>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  // Onboarding check: has session but no display_name
  if (profile && !profile.display_name) {
    return <AuthScreen />;
  }

  if (!currentGroup) {
    return <Landing onOpenGroup={setCurrentGroup} />;
  }

  const disputedCount = expenses.filter((e) => e.status === "disputed").length;

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--bg)" }}>
      <TopNav
        group={currentGroup}
        members={members}
        active={tab}
        onChange={setTab}
        onLeave={() => setCurrentGroup(null)}
        onMemberAdded={() => loadGroupData(currentGroup, false)}
        badge={{ expenses: disputedCount || undefined }}
      />
      <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
        {groupLoading ? (
          <div className="card p-10 text-center text-ink-500">Loading…</div>
        ) : (
          <>
            {tab === "expenses" && (
              <ExpenseFeed
                groupId={currentGroup.id}
                members={members}
                profiles={profiles}
                expenses={expenses}
                currentUserId={profile.id}
                onAdd={(e) => {
                  setExpenses((prev) => [e, ...prev]);
                }}
                onConfirm={async (id) => {
                  await updateExpenseStatus(id, "confirmed");
                  setExpenses((prev) =>
                    prev.map((e) =>
                      e.id === id ? { ...e, status: "confirmed" } : e
                    )
                  );
                }}
                onDispute={async (id) => {
                  const e = expenses.find((x) => x.id === id);
                  const newStatus =
                    e?.status === "disputed" ? "confirmed" : "disputed";
                  await updateExpenseStatus(id, newStatus);
                  setExpenses((prev) =>
                    prev.map((e) =>
                      e.id === id ? { ...e, status: newStatus } : e
                    )
                  );
                }}
              />
            )}
            {tab === "settle" && (
              <SettleUpView
                group={currentGroup}
                members={members}
                profiles={profiles}
                expenses={expenses}
                paidSettlements={paid}
                currentUserId={profile.id}
                onMarkPaid={async (s) => {
                  try {
                    setPaid((prev) => [
                      ...prev,
                      { ...s, status: "paid", paidAt: Date.now() },
                    ]);
                    await markSettlementPaidOnBackend(currentGroup.id, s.from, s.to, s.amount);
                    push("Payment marked as paid!", "success");
                    await loadGroupData(currentGroup, false);
                  } catch (e: any) {
                    push(e.message || "Failed to mark payment as paid", "warn");
                    await loadGroupData(currentGroup, false);
                  }
                }}
              />
            )}
            {tab === "reminders" && (
              <RemindersPanel
                group={currentGroup}
                members={members}
                profiles={profiles}
                expenses={expenses}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  );
}
