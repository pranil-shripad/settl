import { supabase } from "../db.js";
import { logger } from "../logger.js";

/**
 * Middleware to authenticate requests via Supabase JWT.
 * Expects `Authorization: Bearer <token>` header.
 * Returns 401 (Unauthenticated) if missing or invalid.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or malformed Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.debug({ err: error }, "JWT validation failed");
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    req.user = user;
    return next();
  } catch (err) {
    logger.error({ err }, "Unexpected error in requireAuth middleware");
    return res.status(401).json({ error: "Unauthorized: Token verification failed" });
  }
}

/**
 * Middleware to check active group membership for a target group.
 * Group ID can be passed in `req.params.id`, `req.params.groupId`, or `req.body.group_id`.
 * Returns 403 (Forbidden) if user is authenticated but not an active member.
 */
export async function requireGroupMember(req, res, next) {
  try {
    const groupId = req.params.id || req.params.groupId || req.body.group_id;

    if (!groupId) {
      return res.status(400).json({ error: "Group ID parameter required" });
    }

    const userId = req.user?.id;
    const userEmail = req.user?.email;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check group_members table for active membership matching profile_id or email
    const { data: member, error } = await supabase
      .from("group_members")
      .select("id, status, profile_id, email")
      .eq("group_id", groupId)
      .or(`profile_id.eq.${userId},email.eq.${userEmail}`)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      logger.error({ err: error, groupId, userId }, "Error checking group membership");
      return res.status(500).json({ error: "Failed to verify group membership" });
    }

    if (!member) {
      logger.warn({ userId, userEmail, groupId }, "Access denied: Not an active member of group");
      return res.status(403).json({ error: "Forbidden: You are not an active member of this group" });
    }

    req.groupMember = member;
    req.groupId = groupId;
    return next();
  } catch (err) {
    logger.error({ err }, "Unexpected error in requireGroupMember middleware");
    return res.status(500).json({ error: "Internal authorization error" });
  }
}
