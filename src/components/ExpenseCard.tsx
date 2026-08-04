import { useMemo, useState } from "react";
import type { Expense, Profile } from "../types";
import { formatMoney, round2 } from "../settlement";
import { Avatar, AvatarStack } from "./Avatar";

function timeAgo(ts: string | number): string {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const diff = Date.now() - t;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "just now";
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(t).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

export function ExpenseCard({
  expense,
  profiles,
  currentUserId,
  onConfirm,
  onDispute,
}: {
  expense: Expense;
  profiles: Map<string, Profile>;
  currentUserId: string;
  onConfirm: (id: string) => void;
  onDispute: (id: string) => void;
}) {
  const nameOf = (id: string) =>
    profiles.get(id)?.display_name ?? profiles.get(id)?.email ?? "Unknown";
  const payer = nameOf(expense.paid_by);
  const disputed = expense.status === "disputed";
  const perPerson = useMemo(() => {
    if (expense.custom_splits) return null;
    return round2(expense.amount / (expense.split_among.length || 1));
  }, [expense]);

  const canAct = expense.added_by !== currentUserId;
  const [historyOpen, setHistoryOpen] = useState(false);

  const splitProfiles = expense.split_among
    .map((id) => ({ id, name: nameOf(id) }))
    .filter((m) => m.name !== "Unknown");

  return (
    <div
      className={`card animate-fade-in overflow-hidden transition ${
        disputed
          ? "ring-2 ring-amber-400 bg-amber-500/10"
          : "hover:shadow-cardHover"
      }`}
    >
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <Avatar name={payer} id={expense.paid_by} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold text-ink-900">
                {expense.description}
              </h3>
              <p className="mt-0.5 text-sm text-ink-500">
                <span className="font-semibold text-ink-700">{payer}</span> paid
                · split by{" "}
                {expense.custom_splits
                  ? "custom"
                  : `${expense.split_among.length} way`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`font-mono text-2xl font-extrabold leading-none tracking-tight ${
                  disputed ? "text-amber-600" : "text-ink-900"
                }`}
              >
                {formatMoney(expense.amount)}
              </div>
              {perPerson !== null && (
                <div className="mt-1 text-xs font-medium text-ink-400">
                  {formatMoney(perPerson)}/person
                </div>
              )}
            </div>
          </div>

          {/* Split among */}
          <div className="mt-3 flex items-center gap-2">
            <AvatarStack members={splitProfiles} size="sm" />
            <span className="text-xs text-ink-400">
              {splitProfiles.map((m) => m.name).join(", ")}
            </span>
          </div>

          {/* Footer row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge status={expense.status} />
            <span className="text-xs text-ink-400">
              {timeAgo(expense.created_at)}
            </span>

            {expense.editHistory && expense.editHistory.length > 0 && (
              <button
                className="group inline-flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-ink-500 hover:bg-ink-200"
                onClick={() => setHistoryOpen((v) => !v)}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                edited
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`transition ${historyOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}

            {canAct && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  className="btn-soft h-8 w-8 p-0"
                  onClick={() => onConfirm(expense.id)}
                  title="Confirm"
                  aria-label="Confirm expense"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className={`btn h-8 w-8 p-0 ring-1 ${
                    disputed
                      ? "bg-amber-500 text-white ring-amber-600"
                      : "bg-surface text-amber-600 ring-amber-500/30 hover:bg-amber-500/10"
                  }`}
                  onClick={() => onDispute(expense.id)}
                  title="Dispute"
                  aria-label="Dispute expense"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Edit history */}
          {historyOpen &&
            expense.editHistory &&
            expense.editHistory.length > 0 && (
              <div className="animate-fade-in mt-3 space-y-1.5 rounded-xl bg-surface-subtle p-3 ring-1 ring-ink-200">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                  Edit history
                </p>
                {expense.editHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center gap-2 text-xs text-ink-600"
                  >
                    <span className="font-semibold capitalize text-ink-700">
                      {h.field}
                    </span>
                    <span className="font-mono text-ink-400 line-through">
                      {h.old_value}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12h14M13 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="font-mono font-semibold text-ink-800">
                      {h.new_value}
                    </span>
                    <span className="ml-auto text-ink-400">
                      {nameOf(h.changed_by)} · {timeAgo(h.changed_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Expense["status"] }) {
  if (status === "disputed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-500/30">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Disputed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-500/30">
      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
      Confirmed
    </span>
  );
}
