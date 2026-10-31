export const PRODUCTION_FRONTEND_ORIGIN =
  "https://from-text-to-bpmn.vercel.app";

type AuthRuntimeEnv = {
  NODE_ENV?: string;
  CORS_ORIGIN?: string;
  FRONTEND_URL?: string;
  SESSION_COOKIE_SAME_SITE?: string;
};

export function getCorsAllowedOrigins(
  env: AuthRuntimeEnv = process.env,
): string[] {
  if (env.NODE_ENV === "production") return [PRODUCTION_FRONTEND_ORIGIN];

  return [...new Set(
    [env.CORS_ORIGIN, env.FRONTEND_URL]
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )];
}

export function getSessionCookieOptions(
  env: AuthRuntimeEnv = process.env,
): { secure: boolean; sameSite: "lax" | "none"; maxAge: number } {
  const isProduction = env.NODE_ENV === "production";
  const sameSite = isProduction
    ? "none"
    : env.SESSION_COOKIE_SAME_SITE === "none"
      ? "none"
      : "lax";

  return {
    secure: isProduction || sameSite === "none",
    sameSite,
    maxAge: 24 * 60 * 60 * 1000,
  };
}
