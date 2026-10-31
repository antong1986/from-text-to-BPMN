export const PREMIUM_GENERATION_LIMIT = 500;
export const PREMIUM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function isPremiumQuotaExceeded(
  used: number,
  windowStartedAt: Date | string | null,
  now = Date.now(),
): boolean {
  if (!windowStartedAt) return false;

  const startedAt = new Date(windowStartedAt).getTime();
  if (!Number.isFinite(startedAt) || now - startedAt >= PREMIUM_WINDOW_MS) {
    return false;
  }

  return used >= PREMIUM_GENERATION_LIMIT;
}
