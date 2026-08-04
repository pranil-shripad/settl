import { useMemo, useState } from "react";
import type { Expense, GroupMember, Profile } from "../types";
import { formatMoney, round2 } from "../settlement";
import { Avatar } from "./Avatar";
import { addExpense as dbAddExpense } from "../data";
import { useToast } from "./Toast";

export function AddExpenseModal({
  members,
  profiles,
  currentUserId,
  onClose,
  onAdd,
}: {
  members: GroupMember[];
  profiles: Map<string, Profile>;
  currentUserId: string;
  onClose: () => void;
  onAdd: (e: Expense) => void;
}) {
  const { push } = useToast();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitAmong, setSplitAmong] = useState<string[]>(
    members.filter((m) => m.status === "active").map((m) => m.profile_id!).filter(Boolean)
  );
  const [customMode, setCustomMode] = useState(false);
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const activeMembers = members.filter((m) => m.status === "active" && m.profile_id);
  const nameOf = (id: string) =>
    profiles.get(id)?.display_name ?? profiles.get(id)?.email ?? "Unknown";

  const numericAmount = parseFloat(amount) || 0;

  const toggleMember = (id: string) => {
    setSplitAmong((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const customTotal = useMemo(
    () =>
      round2(
        Object.values(customSplits).reduce(
          (sum, v) => sum + (parseFloat(v) || 0),
          0
        )
      ),
    [customSplits]
  );

  const customValid = !customMode || Math.abs(customTotal - numericAmount) < 0.02;
  const canSave =
    description.trim().length > 0 &&
    numericAmount > 0 &&
    splitAmong.length >= 1 &&
    customValid &&
    !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let splits: Record<string, number> | null = null;
      if (customMode) {
        splits = {};
        for (const id of splitAmong) {
          splits[id] = parseFloat(customSplits[id] ?? "0") || 0;
        }
      }
      const created = await dbAddExpense("", {
        description: description.trim(),
        amount: round2(numericAmount),
        paid_by: paidBy,
        split_among: splitAmong,
        custom_splits: splits,
        added_by: currentUserId,
      });
      onAdd(created);
      push("Expense added", "success");
    } catch (e: any) {
      push(e.message, "warn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-overlay/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-slide-up relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink-900">Add expense</h2>
          <button
            className="btn-ghost h-8 w-8 p-0"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-ink-700">
              What was it for?
            </label>
            <input
              className="input"
              placeholder="e.g. Dinner at Tito's"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-ink-700">
              Amount
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-lg font-bold text-ink-400">
                ₹
              </span>
              <input
                className="input font-mono text-lg font-bold pl-9"
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-ink-700">
              Paid by
            </label>
            <div className="flex flex-wrap gap-2">
              {activeMembers.map((m) => {
                const sel = paidBy === m.profile_id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setPaidBy(m.profile_id!)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
                      sel
                        ? "bg-brand-500/15 text-brand-700 ring-brand-500/30"
                        : "bg-surface text-ink-700 ring-ink-200 hover:bg-surface-subtle"
                    }`}
                  >
                    <Avatar name={nameOf(m.profile_id!)} id={m.profile_id!} size="sm" />
                    {nameOf(m.profile_id!)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-ink-700">Split among</label>
            <div className="flex rounded-lg bg-surface-subtle p-0.5 text-xs font-bold">
              <button
                className={`rounded-md px-3 py-1.5 transition ${
                  !customMode ? "bg-surface text-brand-700 shadow-sm" : "text-ink-500"
                }`}
                onClick={() => setCustomMode(false)}
              >
                Equal
              </button>
              <button
                className={`rounded-md px-3 py-1.5 transition ${
                  customMode ? "bg-surface text-brand-700 shadow-sm" : "text-ink-500"
                }`}
                onClick={() => setCustomMode(true)}
              >
                Custom
              </button>
            </div>
          </div>

          {!customMode ? (
            <div className="flex flex-wrap gap-2">
              {activeMembers.map((m) => {
                const sel = splitAmong.includes(m.profile_id!);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMember(m.profile_id!)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
                      sel
                        ? "bg-brand-500/15 text-brand-700 ring-brand-500/30"
                        : "bg-surface text-ink-400 ring-ink-200 hover:bg-surface-subtle"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                        sel ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-400"
                      }`}
                    >
                      {sel ? "✓" : ""}
                    </span>
                    {nameOf(m.profile_id!)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {activeMembers.map((m) => {
                const active = splitAmong.includes(m.profile_id!);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 rounded-xl p-2 ring-1 transition ${
                      active ? "ring-brand-500/30 bg-brand-500/10" : "ring-ink-200"
                    }`}
                  >
                    <button
                      onClick={() => toggleMember(m.profile_id!)}
                      className={`flex h-5 w-5 items-center justify-center rounded-md text-[11px] ${
                        active ? "bg-brand-600 text-white" : "bg-ink-200"
                      }`}
                    >
                      {active ? "✓" : ""}
                    </button>
                    <Avatar name={nameOf(m.profile_id!)} id={m.profile_id!} size="sm" />
                    <span className="flex-1 text-sm font-semibold text-ink-700">
                      {nameOf(m.profile_id!)}
                    </span>
                    {active && (
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-sm text-ink-400">
                          ₹
                        </span>
                        <input
                          className="w-full rounded-lg bg-surface-subtle py-1.5 pl-6 pr-2 text-right font-mono text-sm font-bold ring-1 ring-inset ring-ink-200 focus:ring-2 focus:ring-brand-500"
                          type="number"
                          inputMode="decimal"
                          placeholder="0"
                          value={customSplits[m.profile_id!] ?? ""}
                          onChange={(e) =>
                            setCustomSplits((s) => ({
                              ...s,
                              [m.profile_id!]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <div
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold ${
                  customValid
                    ? "bg-brand-500/15 text-brand-700"
                    : "bg-rose-500/15 text-rose-600"
                }`}
              >
                <span>Total entered</span>
                <span className="font-mono">
                  {formatMoney(customTotal)} / {formatMoney(numericAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button className="btn-ghost flex-1 py-3 ring-1 ring-ink-200" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary flex-[1.5] py-3"
            disabled={!canSave}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Add expense"}
          </button>
        </div>
      </div>
    </div>
  );
}
