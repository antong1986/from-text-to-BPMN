export function isDeveloperEmail(
  email: string,
  configuredEmails = process.env.MY_DEVELOPER_EMAIL,
): boolean {
  const allowlist = (configuredEmails ?? "")
    .split(",")
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.trim().toLowerCase());
}
