import { Router } from "express";
import { supabase } from "../db.js";
import { requireAuth, requireGroupMember } from "../middleware/auth.js";
import { logger } from "../logger.js";

const router = Router();

// POST /groups — create group (creator becomes first active member)
router.post("/", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const userId = req.user.id;
    const userEmail = req.user.email;

    // 1. Create group
    const { data: group, error: groupErr } = await supabase
      .from("groups")
      .insert({ name: name.trim(), created_by: userId })
      .select("id, name, created_by, created_at")
      .single();

    if (groupErr) {
      logger.error({ err: groupErr }, "Error creating group");
      return res.status(500).json({ error: "Failed to create group" });
    }

    // 2. Add creator as active member
    const { error: memberErr } = await supabase
      .from("group_members")
      .insert({
        group_id: group.id,
        email: userEmail,
        profile_id: userId,
        status: "active",
        joined_at: new Date().toISOString(),
      });

    if (memberErr) {
      logger.error({ err: memberErr, groupId: group.id }, "Error adding creator to group_members");
      // Clean up group if member creation fails
      await supabase.from("groups").delete().eq("id", group.id);
      return res.status(500).json({ error: "Failed to create group membership" });
    }

    return res.status(201).json(group);
  } catch (err) {
    logger.error({ err }, "Exception in POST /groups");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /groups/:id — get group details + members
router.get("/:id", requireAuth, requireGroupMember, async (req, res) => {
  try {
    const groupId = req.params.id;

    const [groupRes, membersRes] = await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).single(),
      supabase.from("group_members").select("*").eq("group_id", groupId).order("joined_at", { ascending: true }),
    ]);

    if (groupRes.error) {
      logger.error({ err: groupRes.error, groupId }, "Error fetching group");
      return res.status(404).json({ error: "Group not found" });
    }

    if (membersRes.error) {
      logger.error({ err: membersRes.error, groupId }, "Error fetching group members");
      return res.status(500).json({ error: "Failed to fetch group members" });
    }

    return res.status(200).json({
      ...groupRes.data,
      members: membersRes.data ?? [],
    });
  } catch (err) {
    logger.error({ err }, "Exception in GET /groups/:id");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /groups/:id/invite — invite by email (creates pending group_member row)
router.post("/:id/invite", requireAuth, requireGroupMember, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { email } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email address is required" });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user with this email already has a profile in profiles table (case-insensitive)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", cleanEmail)
      .maybeSingle();

    const profileId = existingProfile?.id || null;
    const status = profileId ? "active" : "pending";
    const joinedAt = profileId ? new Date().toISOString() : null;

    const { data: member, error } = await supabase
      .from("group_members")
      .insert({
        group_id: groupId,
        email: cleanEmail,
        profile_id: profileId,
        status: status,
        joined_at: joinedAt,
      })
      .select("id, group_id, email, profile_id, status, joined_at")
      .single();

    if (error) {
      if (error.code === "23505") { // unique constraint on (group_id, email)
        return res.status(409).json({ error: "Member already invited or in group" });
      }
      logger.error({ err: error, groupId, email: cleanEmail }, "Error inviting member");
      return res.status(500).json({ error: "Failed to invite member" });
    }

    return res.status(201).json(member);
  } catch (err) {
    logger.error({ err }, "Exception in POST /groups/:id/invite");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
