import { PRODUCTION_FRONTEND_ORIGIN } from "./cross-origin-auth";

function getDefaultReturnTo(): string {
  return process.env.NODE_ENV === "production"
    ? `${PRODUCTION_FRONTEND_ORIGIN}/`
    : "/";
}

export function getSafeReturnTo(value: unknown): string {
  const fallback = getDefaultReturnTo();
  const isProduction = process.env.NODE_ENV === "production";

  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }

  const candidate = value.trim();
  if (
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\")
  ) {
    return isProduction
      ? new URL(candidate, PRODUCTION_FRONTEND_ORIGIN).toString()
      : candidate;
  }

  const configuredOrigins = (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => {
      try {
        const url = new URL(origin.trim());
        return url.protocol === "https:" ? url.origin : null;
      } catch {
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    ...(isProduction ? [PRODUCTION_FRONTEND_ORIGIN] : []),
  ]);

  try {
    const url = new URL(candidate);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      allowedOrigins.has(url.origin)
    ) {
      return url.toString();
    }
  } catch {
    // Reject malformed or untrusted redirect targets.
  }

  return fallback;
}
