const renderGoogleCallbackUrl =
  "https://from-text-to-bpmn-api.onrender.com/api/auth/google/callback";

export function getGoogleCallbackUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  // Render's PORT is internal; never build Google's public callback from it.
  if (env.NODE_ENV === "production") return renderGoogleCallbackUrl;

  const configuredCallback = env.GOOGLE_CALLBACK_URL?.trim();
  if (configuredCallback) return configuredCallback;

  const configuredDomain =
    env.REPLIT_DOMAINS?.split(",")[0]?.trim() || env.REPLIT_DEV_DOMAIN?.trim();
  const origin = configuredDomain
    ? configuredDomain.startsWith("http")
      ? configuredDomain
      : `https://${configuredDomain}`
    : `http://localhost:${env.PORT || "8080"}`;

  return new URL("/api/auth/google/callback", origin).toString();
}
