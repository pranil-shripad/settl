import { useState } from "react";
import type { Expense, GroupMember, Profile } from "../types";
import { ExpenseCard } from "./ExpenseCard";
import { AddExpenseModal } from "./AddExpenseModal";
import { formatMoney } from "../settlement";

export function ExpenseFeed({
  expenses,
  members,
  profiles,
  currentUserId,
  onAdd,
  onConfirm,
  onDispute,
}: {
  expenses: Expense[];
  members: GroupMember[];
  profiles: Map<string, Profile>;
  currentUserId: string;
  onAdd: (e: Expense) => void;
  onConfirm: (id: string) => void;
  onDispute: (id: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const confirmed = expenses.filter((e) => e.status === "confirmed");
  const disputed = expenses.filter((e) => e.status === "disputed");
  const totalConfirmed = confirmed.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4 pb-28">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total spend" value={formatMoney(totalConfirmed)} />
        <Stat label="Expenses" value={String(confirmed.length)} />
        <Stat
          label="Disputed"
          value={String(disputed.length)}
          tone={disputed.length > 0 ? "warn" : "default"}
        />
      </div>

      {/* List */}
      <div className="space-y-3">
        {expenses.map((e) => (
          <ExpenseCard
            key={e.id}
            expense={e}
            profiles={profiles}
            currentUserId={currentUserId}
            onConfirm={onConfirm}
            onDispute={onDispute}
          />
        ))}
        {expenses.length === 0 && (
          <div className="card p-10 text-center text-ink-500">
            <p className="font-semibold">No expenses yet</p>
            <p className="text-sm">Tap the button below to add the first one.</p>
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setModalOpen(true)}
        className="btn-primary fixed bottom-5 right-5 z-20 h-14 rounded-2xl px-5 text-base shadow-cardHover sm:bottom-6 sm:right-6"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        Add Expense
      </button>

      {modalOpen && (
        <AddExpenseModal
          members={members}
          profiles={profiles}
          currentUserId={currentUserId}
          onClose={() => setModalOpen(false)}
          onAdd={(e) => {
            onAdd(e);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="card p-3">
      <div className="text-xs font-semibold text-ink-400">{label}</div>
      <div
        className={`mt-0.5 font-mono text-lg font-extrabold ${
          tone === "warn" ? "text-amber-600" : "text-ink-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
