import { useMemo } from "react";
import type { Expense, GroupMember, Profile, Settlement } from "../types";
import {
  computeBalances,
  formatMoney,
  round2,
  settleDebts,
} from "../settlement";
import { Avatar } from "./Avatar";

export function SettleUpView({
  members,
  profiles,
  expenses,
  paidSettlements,
  onMarkPaid,
}: {
  group: { id: string; name: string };
  members: GroupMember[];
  profiles: Map<string, Profile>;
  expenses: Expense[];
  paidSettlements: Settlement[];
  onMarkPaid: (s: Settlement) => void;
}) {
  const activeMemberIds = members
    .filter((m) => m.status === "active" && m.profile_id)
    .map((m) => m.profile_id!);

  const balances = useMemo(
    () => computeBalances(expenses, activeMemberIds),
    [expenses, activeMemberIds]
  );
  const freshSettlements = useMemo(
    () => settleDebts(balances),
    [balances]
  );

  const paidKeys = new Set(
    paidSettlements.map((s) => `${s.from}>${s.to}>${round2(s.amount)}`)
  );
  const pending = freshSettlements.filter(
    (s) => !paidKeys.has(`${s.from}>${s.to}>${round2(s.amount)}`)
  );

  const nameOf = (id: string) =>
    profiles.get(id)?.display_name ?? profiles.get(id)?.email ?? "Unknown";

  const maxAbs = Math.max(...balances.map((b) => Math.abs(b.net)), 1);
  const totalOwed = round2(
    balances.filter((b) => b.net < 0).reduce((s, b) => s + -b.net, 0)
  );

  return (
    <div className="space-y-6 pb-24">
      {/* Balances summary */}
      <section className="card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">
            Balances
          </h2>
          <span className="text-xs text-ink-400">
            Total in motion:{" "}
            <span className="font-mono font-bold text-ink-700">
              {formatMoney(totalOwed)}
            </span>
          </span>
        </div>

        <div className="space-y-3">
          {balances.map((b) => {
            const name = nameOf(b.memberId);
            const pct = (Math.abs(b.net) / maxAbs) * 100;
            const isOwed = b.net > 0.01;
            const isOwes = b.net < -0.01;
            return (
              <div key={b.memberId} className="flex items-center gap-3">
                <Avatar name={name} id={b.memberId} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between">
                    <span className="truncate text-sm font-bold text-ink-800">
                      {name}
                    </span>
                    <span
                      className={`font-mono text-sm font-extrabold ${
                        isOwed
                          ? "text-brand-700"
                          : isOwes
                          ? "text-rose-600"
                          : "text-ink-400"
                      }`}
                    >
                      {isOwed ? "+" : isOwes ? "−" : ""}
                      {formatMoney(Math.abs(b.net))}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={`h-full origin-left animate-bar-grow rounded-full ${
                        isOwed
                          ? "bg-brand-500"
                          : isOwes
                          ? "bg-rose-400"
                          : "bg-ink-200"
                      }`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Settlements */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">
            Who owes whom
          </h2>
          <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-bold text-brand-700">
            {pending.length} payment{pending.length === 1 ? "" : "s"}
          </span>
        </div>

        {pending.length === 0 ? (
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
            <p className="font-bold text-ink-800">Everyone's settled up!</p>
            <p className="text-sm text-ink-500">No pending payments. Nice work.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((s, i) => (
              <div key={i} className="card animate-fade-in flex items-center gap-3 p-4">
                <Avatar name={nameOf(s.from)} id={s.from} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-ink-800">{nameOf(s.from)}</span>
                    <span className="text-ink-400">owes</span>
                    <span className="font-bold text-ink-800">{nameOf(s.to)}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-xl font-extrabold text-ink-900">
                    {formatMoney(s.amount)}
                  </div>
                </div>
                <Avatar name={nameOf(s.to)} id={s.to} size="md" />
                <button
                  className="btn-soft ml-1 px-3 py-2 text-sm"
                  onClick={() => onMarkPaid(s)}
                >
                  Mark as Paid
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settled history */}
      {paidSettlements.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-400">
            Settled history
          </h2>
          <div className="space-y-2">
            {paidSettlements.map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-surface-subtle px-4 py-2.5"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="flex-1 text-sm text-ink-600">
                  <span className="font-bold text-ink-700">{nameOf(s.from)}</span>{" "}
                  paid <span className="font-bold text-ink-700">{nameOf(s.to)}</span>
                </span>
                <span className="font-mono text-sm font-bold text-ink-500">
                  {formatMoney(s.amount)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
