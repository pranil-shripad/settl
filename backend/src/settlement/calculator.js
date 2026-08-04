const EPSILON = 0.01;

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compute net balance for each member in a group based on:
 * 1. Confirmed expenses (payer credited, split members debited)
 * 2. Paid settlement transactions (payer credited, receiver debited)
 *
 * Net positive => member is owed money (creditor)
 * Net negative => member owes money (debtor)
 */
export function computeBalances(expenses, memberIds, paidSettlements = []) {
  const balances = new Map();
  for (const id of memberIds) {
    balances.set(id, 0);
  }

  // 1. Process confirmed expenses
  for (const e of expenses) {
    if (e.status !== "confirmed") continue;

    const total = Number(e.amount);
    let shares = {};

    if (e.custom_splits && Object.keys(e.custom_splits).length > 0) {
      for (const [id, val] of Object.entries(e.custom_splits)) {
        shares[id] = Number(val);
      }
    } else {
      const splitList = Array.isArray(e.split_among) && e.split_among.length > 0
        ? e.split_among
        : [e.paid_by];
      const per = total / splitList.length;
      for (const id of splitList) {
        shares[id] = per;
      }
    }

    // Payer credited total amount
    const currentPayerBal = balances.get(e.paid_by) ?? 0;
    balances.set(e.paid_by, currentPayerBal + total);

    // Split members debited their share
    for (const [id, share] of Object.entries(shares)) {
      const currentMemberBal = balances.get(id) ?? 0;
      balances.set(id, currentMemberBal - share);
    }
  }

  // 2. Adjust for paid settlement transactions
  for (const s of paidSettlements) {
    const amt = Number(s.amount);
    const fromId = s.from_profile_id || s.from;
    const toId = s.to_profile_id || s.to;

    if (fromId) {
      const fromBal = balances.get(fromId) ?? 0;
      balances.set(fromId, fromBal + amt);
    }
    if (toId) {
      const toBal = balances.get(toId) ?? 0;
      balances.set(toId, toBal - amt);
    }
  }

  return memberIds.map((id) => ({
    memberId: id,
    net: round2(balances.get(id) ?? 0),
  }));
}

/**
 * Min-cash-flow greedy debt settlement algorithm.
 * Pairs largest debtor with largest creditor to minimize number of transactions.
 */
export function settleDebts(balances) {
  const creditors = balances
    .filter((b) => b.net > EPSILON)
    .map((b) => ({ id: b.memberId, amount: b.net }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter((b) => b.net < -EPSILON)
    .map((b) => ({ id: b.memberId, amount: -b.net }))
    .sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const paid = Math.min(debtor.amount, creditor.amount);

    if (paid > EPSILON) {
      settlements.push({
        from: debtor.id,
        to: creditor.id,
        amount: round2(paid),
      });
    }

    debtor.amount -= paid;
    creditor.amount -= paid;

    if (debtor.amount < EPSILON) i++;
    if (creditor.amount < EPSILON) j++;
  }

  return settlements;
}
