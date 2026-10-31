import type { RequestHandler, Response } from "express";
import { pool } from "@workspace/db";
import type { AppUser } from "../types/app-user";
import { isPremiumQuotaExceeded, PREMIUM_GENERATION_LIMIT } from "../lib/premium-quota";

const PAYMENT_REQUIRED_MESSAGE =
  "Бесплатные генерации закончились. Войдите в аккаунт с подпиской или обратитесь к администратору.";
const PREMIUM_FAIR_USE_LIMIT_MESSAGE =
  "Генерации временно ограничены правилами использования подписки. Попробуйте позже.";
const PREMIUM_WINDOW_SQL = "INTERVAL '30 days'";

export const checkBPMNLimits: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Для генерации войдите через Google." });
    return;
  }

  const user = req.user as AppUser;
  if (user.isWhitelisted) {
    req.bpmnLimitMode = "whitelisted";
    next();
    return;
  }

  const premiumActive =
    user.isPremium &&
    user.premiumUntil !== null &&
    user.premiumUntil.getTime() > Date.now();
  if (premiumActive) {
    req.bpmnLimitMode = "premium";
    const usageResult = await pool.query(
      `SELECT premium_generations_used AS "premiumGenerationsUsed",
              premium_window_started_at AS "premiumWindowStartedAt"
       FROM users WHERE id = $1 LIMIT 1`,
      [user.id],
    );
    const usage = usageResult.rows[0] as {
      premiumGenerationsUsed: number;
      premiumWindowStartedAt: Date | string | null;
    } | undefined;
    if (!usage) {
      res.status(401).json({ error: "Сессия пользователя больше не действительна. Войдите через Google." });
      return;
    }
    if (isPremiumQuotaExceeded(
      Number(usage.premiumGenerationsUsed),
      usage.premiumWindowStartedAt,
    )) {
      sendPaymentRequired(res, "premium");
      return;
    }
    next();
    return;
  }

  if (user.freeGenerationsLeft <= 0) {
    res.status(402).json({ error: PAYMENT_REQUIRED_MESSAGE });
    return;
  }

  req.bpmnLimitMode = "free";
  next();
};

/**
 * Charge a free generation only after the provider returned a valid result.
 * The conditional update makes the last free credit safe under concurrent calls.
 */
export async function consumeBPMNGeneration(req: Express.Request): Promise<boolean> {
  if (!req.user) return false;

  const user = req.user as AppUser;
  if (req.bpmnLimitMode === "premium") {
    const result = await pool.query(
      `UPDATE users
       SET premium_window_started_at = CASE
             WHEN premium_window_started_at IS NULL
               OR premium_window_started_at <= NOW() - ${PREMIUM_WINDOW_SQL}
             THEN NOW()
             ELSE premium_window_started_at
           END,
           premium_generations_used = CASE
             WHEN premium_window_started_at IS NULL
               OR premium_window_started_at <= NOW() - ${PREMIUM_WINDOW_SQL}
             THEN 1
             ELSE premium_generations_used + 1
           END
       WHERE id = $1
         AND (
           premium_window_started_at IS NULL
           OR premium_window_started_at <= NOW() - ${PREMIUM_WINDOW_SQL}
           OR premium_generations_used < $2
         )
       RETURNING premium_generations_used`,
      [user.id, PREMIUM_GENERATION_LIMIT],
    );
    return Boolean(result.rows[0]);
  }

  if (req.bpmnLimitMode !== "free") return true;

  const result = await pool.query(
    `UPDATE users
     SET free_generations_left = free_generations_left - 1
     WHERE id = $1 AND free_generations_left > 0
     RETURNING free_generations_left`,
    [user.id],
  );

  if (!result.rows[0]) return false;
  user.freeGenerationsLeft = Number(
    (result.rows[0] as { free_generations_left: number }).free_generations_left,
  );
  return true;
}

export function sendPaymentRequired(
  res: Response,
  mode: Express.Request["bpmnLimitMode"] = "free",
): void {
  if (mode === "premium") {
    res.status(429).json({ error: PREMIUM_FAIR_USE_LIMIT_MESSAGE });
    return;
  }
  res.status(402).json({ error: PAYMENT_REQUIRED_MESSAGE });
}
