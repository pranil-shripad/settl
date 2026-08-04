import { describe, expect, test } from "vitest";
import { computeBalances, settleDebts, round2 } from "../src/settlement/calculator.js";

describe("Settlement Algorithm (Min-Cash-Flow)", () => {
  test("returns empty settlements when there are no expenses", () => {
    const memberIds = ["user1", "user2", "user3"];
    const balances = computeBalances([], memberIds);
    const transactions = settleDebts(balances);

    expect(transactions).toEqual([]);
    balances.forEach((b) => expect(b.net).toBe(0));
  });

  test("calculates simple 2-person split correctly", () => {
    const memberIds = ["alice", "bob"];
    const expenses = [
      {
        id: "exp1",
        description: "Dinner",
        amount: 100,
        paid_by: "alice",
        split_among: ["alice", "bob"],
        status: "confirmed",
      },
    ];

    const balances = computeBalances(expenses, memberIds);
    expect(balances).toEqual([
      { memberId: "alice", net: 50 },
      { memberId: "bob", net: -50 },
    ]);

    const transactions = settleDebts(balances);
    expect(transactions).toEqual([
      { from: "bob", to: "alice", amount: 50 },
    ]);
  });

  test("excludes disputed expenses from balance calculation", () => {
    const memberIds = ["alice", "bob"];
    const expenses = [
      {
        id: "exp1",
        description: "Confirmed Lunch",
        amount: 40,
        paid_by: "alice",
        split_among: ["alice", "bob"],
        status: "confirmed",
      },
      {
        id: "exp2",
        description: "Disputed Taxi",
        amount: 200,
        paid_by: "bob",
        split_among: ["alice", "bob"],
        status: "disputed",
      },
    ];

    const balances = computeBalances(expenses, memberIds);
    expect(balances).toEqual([
      { memberId: "alice", net: 20 },
      { memberId: "bob", net: -20 },
    ]);

    const transactions = settleDebts(balances);
    expect(transactions).toEqual([
      { from: "bob", to: "alice", amount: 20 },
    ]);
  });

  test("simplifies 3-way circular debt using min-cash-flow (A->B $10, B->C $10)", () => {
    const memberIds = ["alice", "bob", "charlie"];
    const expenses = [
      {
        id: "exp1",
        description: "Alice paid for Bob",
        amount: 30,
        paid_by: "alice",
        split_among: ["bob"],
        status: "confirmed",
      },
      {
        id: "exp2",
        description: "Bob paid for Charlie",
        amount: 30,
        paid_by: "bob",
        split_among: ["charlie"],
        status: "confirmed",
      },
    ];

    const balances = computeBalances(expenses, memberIds);
    // Alice net: +30
    // Bob net: -30 (for exp1) + 30 (for exp2) = 0
    // Charlie net: -30
    expect(balances).toEqual([
      { memberId: "alice", net: 30 },
      { memberId: "bob", net: 0 },
      { memberId: "charlie", net: -30 },
    ]);

    const transactions = settleDebts(balances);
    // Should result in ONLY 1 transaction: Charlie -> Alice $30 (skipping Bob!)
    expect(transactions).toEqual([
      { from: "charlie", to: "alice", amount: 30 },
    ]);
  });

  test("handles custom splits and paid settlements accurately", () => {
    const memberIds = ["alice", "bob", "charlie"];
    const expenses = [
      {
        id: "exp1",
        description: "Groceries",
        amount: 120,
        paid_by: "alice",
        custom_splits: { alice: 20, bob: 40, charlie: 60 },
        status: "confirmed",
      },
    ];

    // Alice paid 120, her share is 20 => net +100
    // Bob share 40 => net -40
    // Charlie share 60 => net -60
    const initialBalances = computeBalances(expenses, memberIds);
    expect(initialBalances).toEqual([
      { memberId: "alice", net: 100 },
      { memberId: "bob", net: -40 },
      { memberId: "charlie", net: -60 },
    ]);

    // Now suppose Charlie pays Alice $60
    const paidSettlements = [
      { from_profile_id: "charlie", to_profile_id: "alice", amount: 60 },
    ];

    const updatedBalances = computeBalances(expenses, memberIds, paidSettlements);
    expect(updatedBalances).toEqual([
      { memberId: "alice", net: 40 },
      { memberId: "bob", net: -40 },
      { memberId: "charlie", net: 0 },
    ]);

    const transactions = settleDebts(updatedBalances);
    expect(transactions).toEqual([
      { from: "bob", to: "alice", amount: 40 },
    ]);
  });
});
