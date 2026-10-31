export function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f]/.test(value)) {
    return "/";
  }

  const candidate = value.trim();
  if (
    candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.includes("\\")
  ) {
    return candidate;
  }

  const allowedOrigins = (process.env.FRONTEND_URL ?? "")
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

  try {
    const url = new URL(candidate);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      allowedOrigins.includes(url.origin)
    ) {
      return url.toString();
    }
  } catch {
    // Reject malformed or untrusted redirect targets.
  }

  return "/";
}
