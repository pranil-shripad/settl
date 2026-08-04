import { Router } from "express";
import { supabase } from "../db.js";
import { requireAuth, requireGroupMember } from "../middleware/auth.js";
import { logger } from "../logger.js";

const router = Router();

// Helper to fetch active member profile IDs for a group
async function getActiveMemberProfileIds(groupId) {
  const { data, error } = await supabase
    .from("group_members")
    .select("profile_id")
    .eq("group_id", groupId)
    .eq("status", "active");

  if (error || !data) return new Set();
  return new Set(data.map((m) => m.profile_id).filter(Boolean));
}

// POST /groups/:id/expenses — add expense
router.post("/groups/:id/expenses", requireAuth, requireGroupMember, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { description, amount, paid_by, split_among, custom_splits } = req.body;

    // 1. Validate fields
    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Expense description is required" });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Expense amount must be greater than 0" });
    }

    if (!paid_by || typeof paid_by !== "string") {
      return res.status(400).json({ error: "paid_by user ID is required" });
    }

    const splitArray = Array.isArray(split_among) ? split_among : [];
    if (splitArray.length === 0) {
      return res.status(400).json({ error: "split_among must contain at least one member" });
    }

    // 2. Validate paid_by and split_among are active group members
    const activeMemberIds = await getActiveMemberProfileIds(groupId);

    if (!activeMemberIds.has(paid_by)) {
      return res.status(400).json({ error: "Payer (paid_by) must be an active member of this group" });
    }

    for (const memberId of splitArray) {
      if (!activeMemberIds.has(memberId)) {
        return res.status(400).json({ error: `Member ${memberId} in split_among is not an active group member` });
      }
    }

    // 3. Insert expense
    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        description: description.trim(),
        amount: numAmount,
        paid_by,
        split_among: splitArray,
        custom_splits: custom_splits || null,
        status: "confirmed",
        added_by: req.user.id,
      })
      .select("*")
      .single();

    if (error) {
      logger.error({ err: error, groupId }, "Error inserting expense");
      return res.status(500).json({ error: "Failed to create expense" });
    }

    return res.status(201).json(expense);
  } catch (err) {
    logger.error({ err }, "Exception in POST /groups/:id/expenses");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /expenses/:id — edit expense (only allowed if requester is added_by)
router.patch("/expenses/:id", requireAuth, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const userId = req.user.id;

    // Fetch existing expense
    const { data: existing, error: fetchErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: "Expense not found" });
    }

    // Authorization: only added_by can edit fields
    if (existing.added_by !== userId) {
      return res.status(403).json({ error: "Forbidden: Only the member who added this expense can edit it" });
    }

    const { description, amount, paid_by, split_among, custom_splits } = req.body;
    const updates = {};
    const historyEntries = [];

    if (description !== undefined && description !== existing.description) {
      updates.description = String(description).trim();
      historyEntries.push({
        expense_id: expenseId,
        field: "description",
        old_value: existing.description,
        new_value: updates.description,
        changed_by: userId,
      });
    }

    if (amount !== undefined && Number(amount) !== Number(existing.amount)) {
      const numAmt = Number(amount);
      if (isNaN(numAmt) || numAmt <= 0) {
        return res.status(400).json({ error: "Amount must be greater than 0" });
      }
      updates.amount = numAmt;
      historyEntries.push({
        expense_id: expenseId,
        field: "amount",
        old_value: String(existing.amount),
        new_value: String(numAmt),
        changed_by: userId,
      });
    }

    if (paid_by !== undefined && paid_by !== existing.paid_by) {
      const activeMembers = await getActiveMemberProfileIds(existing.group_id);
      if (!activeMembers.has(paid_by)) {
        return res.status(400).json({ error: "paid_by must be an active group member" });
      }
      updates.paid_by = paid_by;
      historyEntries.push({
        expense_id: expenseId,
        field: "paid_by",
        old_value: existing.paid_by,
        new_value: paid_by,
        changed_by: userId,
      });
    }

    if (split_among !== undefined && JSON.stringify(split_among) !== JSON.stringify(existing.split_among)) {
      const activeMembers = await getActiveMemberProfileIds(existing.group_id);
      for (const mId of split_among) {
        if (!activeMembers.has(mId)) {
          return res.status(400).json({ error: `Member ${mId} in split_among is not an active group member` });
        }
      }
      updates.split_among = split_among;
      historyEntries.push({
        expense_id: expenseId,
        field: "split_among",
        old_value: JSON.stringify(existing.split_among),
        new_value: JSON.stringify(split_among),
        changed_by: userId,
      });
    }

    if (custom_splits !== undefined) {
      updates.custom_splits = custom_splits;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(200).json(existing);
    }

    updates.updated_at = new Date().toISOString();

    // Update expense row
    const { data: updated, error: updateErr } = await supabase
      .from("expenses")
      .update(updates)
      .eq("id", expenseId)
      .select("*")
      .single();

    if (updateErr) {
      logger.error({ err: updateErr, expenseId }, "Error updating expense");
      return res.status(500).json({ error: "Failed to update expense" });
    }

    // Insert history records
    if (historyEntries.length > 0) {
      const { error: histErr } = await supabase.from("expense_history").insert(historyEntries);
      if (histErr) {
        logger.warn({ err: histErr, expenseId }, "Failed to write expense history");
      }
    }

    return res.status(200).json(updated);
  } catch (err) {
    logger.error({ err }, "Exception in PATCH /expenses/:id");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Helper for status updates (confirm / dispute)
async function handleStatusUpdate(req, res, targetStatus) {
  const expenseId = req.params.id;
  const userId = req.user.id;

  // 1. Fetch expense
  const { data: expense, error: fetchErr } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", expenseId)
    .single();

  if (fetchErr || !expense) {
    return res.status(404).json({ error: "Expense not found" });
  }

  // 2. Validate requester is active group member
  const activeMembers = await getActiveMemberProfileIds(expense.group_id);
  if (!activeMembers.has(userId)) {
    return res.status(403).json({ error: "Forbidden: You are not an active member of this group" });
  }

  // 3. Rule: requester must NOT be added_by
  if (expense.added_by === userId) {
    return res.status(403).json({ error: `Forbidden: The creator of an expense cannot ${targetStatus} their own expense` });
  }

  // 4. Update status
  const { data: updated, error: updateErr } = await supabase
    .from("expenses")
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq("id", expenseId)
    .select("*")
    .single();

  if (updateErr) {
    logger.error({ err: updateErr, expenseId }, `Error setting expense to ${targetStatus}`);
    return res.status(500).json({ error: `Failed to ${targetStatus} expense` });
  }

  return res.status(200).json(updated);
}

// POST /expenses/:id/confirm — mark confirmed (non-adder active member only)
router.post("/expenses/:id/confirm", requireAuth, async (req, res) => {
  return handleStatusUpdate(req, res, "confirmed");
});

// POST /expenses/:id/dispute — mark disputed (non-adder active member only)
router.post("/expenses/:id/dispute", requireAuth, async (req, res) => {
  return handleStatusUpdate(req, res, "disputed");
});

export default router;
