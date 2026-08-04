import type { Expense, Settlement } from "./types";

export type Balance = {
  memberId: string;
  net: number; // positive => owed money, negative => owes money
};

const EPSILON = 0.01;

/**
 * Compute each member's net balance from confirmed expenses only.
 * For an expense of amount A paid by P split among [m1..mn] equally (or by customSplits):
 *   - P is credited A (they fronted it)
 *   - each split member is debited their share
 * Net positive => the group owes this person. Net negative => this person owes the group.
 */
export function computeBalances(
  expenses: Expense[],
  memberIds: string[]
): Balance[] {
  const balances = new Map<string, number>();
  for (const id of memberIds) balances.set(id, 0);

  for (const e of expenses) {
    if (e.status !== "confirmed") continue;
    const total = e.amount;

    // shares
    let shares: Record<string, number>;
    if (e.custom_splits && Object.keys(e.custom_splits).length > 0) {
      shares = { ...e.custom_splits };
    } else {
      const n = e.split_among.length || 1;
      const per = total / n;
      shares = {};
      for (const id of e.split_among) shares[id] = per;
    }

    // payer is credited the full amount
    balances.set(e.paid_by, (balances.get(e.paid_by) ?? 0) + total);

    // each split member is debited their share
    for (const [id, share] of Object.entries(shares)) {
      balances.set(id, (balances.get(id) ?? 0) - share);
    }
  }

  return memberIds.map((id) => ({ memberId: id, net: balances.get(id) ?? 0 }));
}

/**
 * Minimum cash-flow settlement.
 * Greedy: repeatedly settle the largest debtor against the largest creditor.
 * Produces the fewest transactions for the given balances (a well-known
 * heuristic that is optimal for the common case and near-optimal generally).
 */
export function settleDebts(balances: Balance[]): Settlement[] {
  // Separate into creditors (net > 0) and debtors (net < 0), rounded to cents.
  const creditors = balances
    .filter((b) => b.net > EPSILON)
    .map((b) => ({ id: b.memberId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = balances
    .filter((b) => b.net < -EPSILON)
    .map((b) => ({ id: b.memberId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const paid = Math.min(debtor.amount, creditor.amount);

    settlements.push({
      from: debtor.id,
      to: creditor.id,
      amount: round2(paid),
      status: "pending",
    });

    debtor.amount -= paid;
    creditor.amount -= paid;

    if (debtor.amount < EPSILON) i++;
    if (creditor.amount < EPSILON) j++;
  }

  return settlements;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n: number): string {
  const rounded = round2(n);
  return "₹" + rounded.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
