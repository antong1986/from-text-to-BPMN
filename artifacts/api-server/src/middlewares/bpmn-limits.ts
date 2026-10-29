import type { RequestHandler, Response } from "express";
import { pool } from "@workspace/db";
import type { AppUser } from "../types/app-user";

const PAYMENT_REQUIRED_MESSAGE =
  "Бесплатные генерации закончились. Войдите в аккаунт с подпиской или обратитесь к администратору.";

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
  if (req.bpmnLimitMode !== "free") return true;
  if (!req.user) return false;

  const user = req.user as AppUser;
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

export function sendPaymentRequired(res: Response): void {
  res.status(402).json({ error: PAYMENT_REQUIRED_MESSAGE });
}
