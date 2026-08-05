import { Router } from "express";
import { supabase } from "../db.js";
import { requireAuth, requireGroupMember } from "../middleware/auth.js";
import { computeBalances, settleDebts } from "../settlement/calculator.js";
import { logger } from "../logger.js";

const router = Router();

// GET /groups/:id/settlement — compute and return minimum transaction settlement
router.get("/groups/:id/settlement", requireAuth, requireGroupMember, async (req, res) => {
  try {
    const groupId = req.params.id;

    // 1. Fetch active group members
    const { data: members, error: memErr } = await supabase
      .from("group_members")
      .select("profile_id")
      .eq("group_id", groupId)
      .eq("status", "active");

    if (memErr) {
      logger.error({ err: memErr, groupId }, "Error fetching group members for settlement");
      return res.status(500).json({ error: "Failed to calculate settlement" });
    }

    const memberIds = (members || []).map((m) => m.profile_id).filter(Boolean);

    // 2. Fetch expenses for group
    const { data: expenses, error: expErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("group_id", groupId);

    if (expErr) {
      logger.error({ err: expErr, groupId }, "Error fetching expenses for settlement");
      return res.status(500).json({ error: "Failed to calculate settlement" });
    }

    // 3. Fetch paid settlements for group
    const { data: paidSettlements, error: setErr } = await supabase
      .from("settlements")
      .select("*")
      .eq("group_id", groupId)
      .eq("status", "paid");

    if (setErr) {
      logger.warn({ err: setErr, groupId }, "Error fetching settlements; defaulting to empty");
    }

    // 4. Compute member net balances using confirmed expenses and paid settlements
    const balances = computeBalances(expenses || [], memberIds, paidSettlements || []);

    // 5. Run min-cash-flow greedy algorithm
    const transactions = settleDebts(balances);

    return res.status(200).json({
      group_id: groupId,
      balances,
      transactions,
      paid_settlements: paidSettlements || [],
    });
  } catch (err) {
    logger.error({ err }, "Exception in GET /groups/:id/settlement");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /settlements/:id/mark-paid or POST /settlements/mark-paid
const markPaidHandler = async (req, res) => {
  try {
    const groupId = req.body.group_id || req.body.groupId;
    const fromId = req.body.from_profile_id || req.body.from;
    const toId = req.body.to_profile_id || req.body.to;
    const amount = Number(req.body.amount);

    if (!groupId || !fromId || !toId || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Required fields: group_id, from (or from_profile_id), to (or to_profile_id), and positive amount",
      });
    }

    // Auth check: Requester must be active member of group
    const userId = req.user.id;
    const { data: member } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .or(`profile_id.eq.${userId},email.eq.${req.user.email}`)
      .eq("status", "active")
      .maybeSingle();

    if (!member) {
      return res.status(403).json({ error: "Forbidden: Not an active member of this group" });
    }

    // Authorization rule: Only the member who owes the money (fromId) can mark it as paid
    if (userId !== fromId) {
      return res.status(403).json({ error: "Forbidden: Only the member who owes this payment can mark it as paid" });
    }

    // Insert into settlements table
    const { data: settlement, error } = await supabase
      .from("settlements")
      .insert({
        group_id: groupId,
        from_profile_id: fromId,
        to_profile_id: toId,
        amount,
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      logger.error({ err: error, groupId }, "Error marking settlement paid");
      return res.status(500).json({ error: "Failed to record paid settlement" });
    }

    return res.status(201).json(settlement);
  } catch (err) {
    logger.error({ err }, "Exception in POST mark-paid");
    return res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/settlements/:id/mark-paid", requireAuth, markPaidHandler);
router.post("/settlements/mark-paid", requireAuth, markPaidHandler);

export default router;
