import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  GetAdminStatsResponse,
  GetAdminInternalSnapshotResponse,
  GetAdminProductionSnapshotResponse,
  GetAdminUsersQueryParams,
  GetAdminUsersResponse,
  ToggleAdminUserWhitelistParams,
  ToggleAdminUserWhitelistResponse,
  GrantAdminUserPremiumParams,
  GrantAdminUserPremiumResponse,
} from "@workspace/api-zod";
import type { AppUser } from "../types/app-user";

const router: IRouter = Router();
const DEFAULT_PRODUCTION_API_URL = "https://from-text-to-bpmn-api.onrender.com";
const PRODUCTION_SNAPSHOT_TIMEOUT_MS = 60_000;

function getSearchTerm(value: string | undefined): string | null {
  return value?.trim() || null;
}

async function loadStats() {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS "totalUsers",
       COUNT(*) FILTER (
         WHERE is_premium IS TRUE AND premium_until > NOW()
       )::int AS "activePremiumSubscriptions",
       COALESCE(
         SUM(CASE
           WHEN COALESCE(NULLIF(to_jsonb(users)->>'total_generations', '')::int, 0) > 0
             THEN COALESCE(NULLIF(to_jsonb(users)->>'total_generations', '')::int, 0)
           ELSE GREATEST(0, 3 - free_generations_left) +
                GREATEST(0, premium_generations_used)
         END),
         0
       )::int AS "totalGenerations"
     FROM users`,
  );
  const row = result.rows[0] as Record<string, unknown>;
  return GetAdminStatsResponse.parse({
    totalUsers: Number(row.totalUsers),
    activePremiumSubscriptions: Number(row.activePremiumSubscriptions),
    totalGenerations: Number(row.totalGenerations),
  });
}

async function loadUsers(search: string | null) {
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
  return GetAdminUsersResponse.parse({
    users: result.rows.map((row) => ({
      ...(row as Record<string, unknown>),
      id: Number((row as Record<string, unknown>).id),
      freeGenerationsLeft: Number(
        (row as Record<string, unknown>).freeGenerationsLeft,
      ),
    })),
  });
}

async function loadSnapshot(search: string | null) {
  const [stats, users] = await Promise.all([loadStats(), loadUsers(search)]);
  return GetAdminInternalSnapshotResponse.parse({ stats, users: users.users });
}

function matchesSyncToken(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    expectedBytes.length > 0 &&
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

// This endpoint is used only by the Replit API proxy. Keep it before the
// browser-session middleware and require a shared server-side bearer token.
router.get("/internal/snapshot", async (req, res): Promise<void> => {
  const expectedToken = process.env.ADMIN_SYNC_TOKEN;
  if (!expectedToken) {
    res.status(503).json({ error: "Production snapshot access is not configured." });
    return;
  }
  const providedToken = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!matchesSyncToken(providedToken, expectedToken)) {
    res.status(401).json({ error: "Invalid server-to-server token." });
    return;
  }

  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid email search query." });
    return;
  }

  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await loadSnapshot(getSearchTerm(query.data.email)));
  } catch (error) {
    req.log.error({ error }, "Could not load internal administrator snapshot");
    res.status(500).json({ error: "Production snapshot could not be loaded." });
  }
});

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

router.get("/production-snapshot", async (req, res): Promise<void> => {
  const query = GetAdminUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid email search query." });
    return;
  }

  const syncToken = process.env.ADMIN_SYNC_TOKEN;
  if (!syncToken) {
    res.status(503).json({ error: "Production data connection is not configured." });
    return;
  }

  try {
    const apiUrl = new URL(
      process.env.PRODUCTION_API_URL?.trim() || DEFAULT_PRODUCTION_API_URL,
    );
    if (apiUrl.protocol !== "https:" || apiUrl.username || apiUrl.password) {
      res.status(503).json({ error: "Production API URL must use HTTPS." });
      return;
    }
    if (req.hostname.toLowerCase() === apiUrl.hostname.toLowerCase()) {
      const localSnapshot = await loadSnapshot(getSearchTerm(query.data.email));
      res.setHeader("Cache-Control", "no-store");
      res.json(GetAdminProductionSnapshotResponse.parse(localSnapshot));
      return;
    }

    const snapshotUrl = new URL("/api/admin/internal/snapshot", apiUrl);
    const search = getSearchTerm(query.data.email);
    if (search) snapshotUrl.searchParams.set("email", search);

    const response = await fetch(snapshotUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${syncToken}`,
      },
      signal: AbortSignal.timeout(PRODUCTION_SNAPSHOT_TIMEOUT_MS),
    });
    if (!response.ok) {
      req.log.warn(
        { statusCode: response.status },
        "Production API rejected or failed the administrator snapshot request",
      );
      res.status(502).json({ error: "Could not retrieve the production snapshot." });
      return;
    }

    const snapshot = GetAdminProductionSnapshotResponse.safeParse(await response.json());
    if (!snapshot.success) {
      req.log.error(
        { errors: snapshot.error.flatten() },
        "Production API returned an invalid administrator snapshot",
      );
      res.status(502).json({ error: "Production API returned invalid dashboard data." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(snapshot.data);
  } catch (error) {
    req.log.error({ error }, "Could not contact the production administrator API");
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "Production API did not respond in time."
        : "Production API is unavailable.",
    });
  }
});

router.get("/stats", async (req, res): Promise<void> => {
  try {
    res.json(await loadStats());
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
    res.json(await loadUsers(getSearchTerm(query.data.email)));
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
