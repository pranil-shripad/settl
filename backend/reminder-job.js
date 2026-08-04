import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { computeBalances, settleDebts } from "./src/settlement/calculator.js";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const webhookUrl = process.env.WEBHOOK_URL;
const cooldownHours = Number(process.env.REMINDER_COOLDOWN_HOURS || 24);

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(JSON.stringify({
    level: "error",
    time: new Date().toISOString(),
    message: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable",
  }));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runReminderJob() {
  const now = new Date();
  console.log(JSON.stringify({
    level: "info",
    time: now.toISOString(),
    message: "Starting scheduled Settl reminder job execution...",
  }));

  // 1. Fetch all groups
  const { data: groups, error: groupErr } = await supabase
    .from("groups")
    .select("id, name, last_reminded_at");

  if (groupErr) {
    console.error(JSON.stringify({
      level: "error",
      time: new Date().toISOString(),
      error: groupErr.message,
      message: "Failed to fetch groups for reminder job",
    }));
    process.exit(1);
  }

  let remindersSent = 0;
  let groupsSkipped = 0;

  for (const group of groups || []) {
    // 2. Cooldown check
    if (group.last_reminded_at) {
      const lastReminded = new Date(group.last_reminded_at);
      const hoursSince = (now.getTime() - lastReminded.getTime()) / (1000 * 60 * 60);

      if (hoursSince < cooldownHours) {
        groupsSkipped++;
        console.log(JSON.stringify({
          level: "debug",
          time: new Date().toISOString(),
          groupId: group.id,
          groupName: group.name,
          hoursSinceLastReminder: hoursSince.toFixed(2),
          cooldownHours,
          message: "Skipping group reminder due to cooldown",
        }));
        continue;
      }
    }

    // 3. Fetch active members, expenses, and paid settlements
    const [memRes, expRes, setRes] = await Promise.all([
      supabase.from("group_members").select("profile_id, email").eq("group_id", group.id).eq("status", "active"),
      supabase.from("expenses").select("*").eq("group_id", group.id),
      supabase.from("settlements").select("*").eq("group_id", group.id).eq("status", "paid"),
    ]);

    const memberIds = (memRes.data || []).map((m) => m.profile_id).filter(Boolean);
    if (memberIds.length === 0) continue;

    const balances = computeBalances(expRes.data || [], memberIds, setRes.data || []);
    const transactions = settleDebts(balances);

    if (transactions.length === 0) {
      console.log(JSON.stringify({
        level: "debug",
        time: new Date().toISOString(),
        groupId: group.id,
        groupName: group.name,
        message: "No unsettled balances found for group",
      }));
      continue;
    }

    // Unsettled debts exist! Prepare reminder details
    const reminderSummary = {
      groupId: group.id,
      groupName: group.name,
      unsettledTransactionsCount: transactions.length,
      transactions: transactions.map((t) => ({
        from: t.from,
        to: t.to,
        amount: t.amount,
      })),
      timestamp: now.toISOString(),
    };

    console.log(JSON.stringify({
      level: "info",
      time: now.toISOString(),
      groupId: group.id,
      groupName: group.name,
      message: `[REMINDER] Group '${group.name}' has ${transactions.length} pending settlement transaction(s)`,
      details: reminderSummary,
    }));

    // Send webhook if configured
    if (webhookUrl) {
      try {
        const textMessage = `🔔 *Settl Payment Reminder for ${group.name}*\n` +
          `There are ${transactions.length} pending settlement(s):\n` +
          transactions.map((t) => `- User (${t.from}) owes User (${t.to}): ₹${t.amount}`).join("\n");

        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: textMessage }),
        });
      } catch (webhookErr) {
        console.error(JSON.stringify({
          level: "error",
          time: new Date().toISOString(),
          groupId: group.id,
          error: webhookErr.message,
          message: "Failed to post reminder to WEBHOOK_URL",
        }));
      }
    }

    // 4. Update last_reminded_at timestamp
    const { error: updateErr } = await supabase
      .from("groups")
      .update({ last_reminded_at: now.toISOString() })
      .eq("id", group.id);

    if (updateErr) {
      console.error(JSON.stringify({
        level: "error",
        time: new Date().toISOString(),
        groupId: group.id,
        error: updateErr.message,
        message: "Failed to update last_reminded_at timestamp",
      }));
    } else {
      remindersSent++;
    }
  }

  console.log(JSON.stringify({
    level: "info",
    time: new Date().toISOString(),
    remindersSent,
    groupsSkipped,
    message: "Completed scheduled Settl reminder job execution.",
  }));
}

runReminderJob().catch((err) => {
  console.error(JSON.stringify({
    level: "fatal",
    time: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    message: "Uncaught error during reminder job",
  }));
  process.exit(1);
});
