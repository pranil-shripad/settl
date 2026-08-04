import { useMemo, useState } from "react";
import type { Expense, GroupMember, Profile } from "../types";
import {
  computeBalances,
  formatMoney,
  round2,
  settleDebts,
} from "../settlement";
import { Avatar } from "./Avatar";
import { useToast } from "./Toast";

export function RemindersPanel({
  members,
  profiles,
  expenses,
}: {
  group: { id: string; name: string };
  members: GroupMember[];
  profiles: Map<string, Profile>;
  expenses: Expense[];
}) {
  const { push } = useToast();
  const [hoursLeft, setHoursLeft] = useState(6);

  const activeMemberIds = members
    .filter((m) => m.status === "active" && m.profile_id)
    .map((m) => m.profile_id!);

  const balances = useMemo(
    () => computeBalances(expenses, activeMemberIds),
    [expenses, activeMemberIds]
  );
  const settlements = useMemo(() => settleDebts(balances), [balances]);

  const nameOf = (id: string) =>
    profiles.get(id)?.display_name ?? profiles.get(id)?.email ?? "Unknown";

  const byDebtor = useMemo(() => {
    const map = new Map<string, { to: string; amount: number }[]>();
    for (const s of settlements) {
      if (!map.has(s.from)) map.set(s.from, []);
      map.get(s.from)!.push({ to: s.to, amount: s.amount });
    }
    return map;
  }, [settlements]);

  const debtors = Array.from(byDebtor.keys());

  const sendReminder = (debtorId: string) => {
    const total = byDebtor.get(debtorId)!.reduce((s, x) => s + x.amount, 0);
    push(`Reminder sent to ${nameOf(debtorId)} for ${formatMoney(round2(total))}`, "success");
    setHoursLeft(6);
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="card flex items-center gap-3 bg-brand-500/10 p-4 ring-brand-500/30">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink-800">Auto-reminder scheduled</p>
          <p className="text-xs text-ink-500">
            Next automatic nudge in{" "}
            <span className="font-mono font-bold text-brand-700">{hoursLeft}h</span>{" "}
            — the backend job will ping anyone still owing.
          </p>
        </div>
      </div>

      {debtors.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15 text-brand-700">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="font-bold text-ink-800">Nothing to chase</p>
          <p className="text-sm text-ink-500">Everyone's even — no reminders needed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {debtors.map((debtorId) => {
            const owes = byDebtor.get(debtorId)!;
            const total = round2(owes.reduce((s, x) => s + x.amount, 0));
            return (
              <div key={debtorId} className="card p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={nameOf(debtorId)} id={debtorId} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-800">
                      {nameOf(debtorId)} owes{" "}
                      <span className="font-mono text-ink-900">{formatMoney(total)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      to {owes.map((o) => `${nameOf(o.to)} (${formatMoney(o.amount)})`).join(", ")}
                    </p>
                  </div>
                  <button
                    className="btn-soft px-3.5 py-2.5 text-sm"
                    onClick={() => sendReminder(debtorId)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path
                        d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Send Reminder
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="px-2 text-center text-xs text-ink-400">
        Reminders are a demo — no real messages are sent. The scheduled-job timer is mocked client-side.
      </p>
    </div>
  );
}
