import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  GetAdminStatsResponse,
  GetAdminUsersQueryParams,
  GetAdminUsersResponse,
  ToggleAdminUserWhitelistParams,
  ToggleAdminUserWhitelistResponse,
  GrantAdminUserPremiumParams,
  GrantAdminUserPremiumResponse,
} from "@workspace/api-zod";
import type { AppUser } from "../types/app-user";

const router: IRouter = Router();

router.use(async (req, res, next): Promise<void> => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(403).json({ error: "Administrator access required." });
    return;
  }

  try {
    const userId = (req.user as AppUser).id;
    const access = await pool.query(
      "SELECT is_whitelisted FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    if (access.rows[0]?.is_whitelisted !== true) {
      res.status(403).json({ error: "Administrator access required." });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ error }, "Could not verify administrator access");
    res.status(500).json({ error: "Administrator access could not be verified." });
  }
});

router.get("/stats", async (req, res): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS "totalUsers",
         COUNT(*) FILTER (
           WHERE is_premium IS TRUE AND premium_until > NOW()
         )::int AS "activePremiumSubscriptions",
         COALESCE(
           SUM(CASE
             WHEN total_generations > 0 THEN total_generations
             ELSE GREATEST(0, 3 - free_generations_left) +
                  GREATEST(0, premium_generations_used)
           END),
           0
         )::int AS "totalGenerations"
       FROM users`,
    );
    const row = result.rows[0] as Record<string, unknown>;
    res.json(GetAdminStatsResponse.parse({
      totalUsers: Number(row.totalUsers),
      activePremiumSubscriptions: Number(row.activePremiumSubscriptions),
      totalGenerations: Number(row.totalGenerations),
    }));
  } catch (error) {
    req.log.error({ error }, "Could not load administrator dashboard statistics");
    res.status(500).json({ error: "Dashboard statistics could not be loaded." });
  }
});

router.get("/users", async (req, res): Promise<void> => {
  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid email search query." });
    return;
  }

  try {
    const search = query.data.email?.trim() || null;
    const result = await pool.query(
      `SELECT id, email, is_premium AS "isPremium",
              premium_until AS "premiumUntil",
              is_whitelisted AS "isWhitelisted",
              free_generations_left AS "freeGenerationsLeft"
       FROM users
       WHERE $1::text IS NULL OR email ILIKE $1
       ORDER BY id DESC`,
      [search === null ? null : `%${search}%`],
    );
    res.json(GetAdminUsersResponse.parse({
      users: result.rows.map((row) => ({
        ...(row as Record<string, unknown>),
        id: Number((row as Record<string, unknown>).id),
        freeGenerationsLeft: Number(
          (row as Record<string, unknown>).freeGenerationsLeft,
        ),
      })),
    }));
  } catch (error) {
    req.log.error({ error }, "Could not load administrator user list");
    res.status(500).json({ error: "Users could not be loaded." });
  }
});

router.post("/users/:id/toggle-whitelist", async (req, res): Promise<void> => {
  const params = ToggleAdminUserWhitelistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET is_whitelisted = NOT is_whitelisted
       WHERE id = $1
       RETURNING id, email, is_premium AS "isPremium",
                 premium_until AS "premiumUntil",
                 is_whitelisted AS "isWhitelisted",
                 free_generations_left AS "freeGenerationsLeft"`,
      [params.data.id],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const row = result.rows[0] as Record<string, unknown>;
    res.json(ToggleAdminUserWhitelistResponse.parse({
      user: {
        ...row,
        id: Number(row.id),
        freeGenerationsLeft: Number(row.freeGenerationsLeft),
      },
    }));
  } catch (error) {
    req.log.error({ error, userId: params.data.id }, "Could not toggle user whitelist");
    res.status(500).json({ error: "User whitelist could not be updated." });
  }
});

router.post("/users/:id/grant-premium", async (req, res): Promise<void> => {
  const params = GrantAdminUserPremiumParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid user ID." });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET is_premium = TRUE,
           premium_until = CASE
             WHEN is_premium IS TRUE AND premium_until > NOW()
               THEN premium_until + INTERVAL '30 days'
             ELSE NOW() + INTERVAL '30 days'
           END
       WHERE id = $1
       RETURNING id, email, is_premium AS "isPremium",
                 premium_until AS "premiumUntil",
                 is_whitelisted AS "isWhitelisted",
                 free_generations_left AS "freeGenerationsLeft"`,
      [params.data.id],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const row = result.rows[0] as Record<string, unknown>;
    res.json(GrantAdminUserPremiumResponse.parse({
      user: {
        ...row,
        id: Number(row.id),
        freeGenerationsLeft: Number(row.freeGenerationsLeft),
      },
    }));
  } catch (error) {
    req.log.error({ error, userId: params.data.id }, "Could not grant premium subscription");
    res.status(500).json({ error: "Premium subscription could not be granted." });
  }
});

export default router;
