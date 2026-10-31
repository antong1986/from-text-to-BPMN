import connectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import session from "express-session";
import { pool } from "@workspace/db";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { AppUser } from "../types/app-user";
import { isDeveloperEmail } from "./developer-email";
import { logger } from "./logger";

const PgSessionStore = connectPgSimple(session);
const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET must be configured before starting the API server.");
}

const sessionCookieSameSite =
  process.env.SESSION_COOKIE_SAME_SITE === "none" ? "none" : "lax";

function getGoogleCallbackUrl(): string {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;

  const configuredDomain =
    process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() ||
    process.env.REPLIT_DEV_DOMAIN?.trim();
  const origin = configuredDomain
    ? configuredDomain.startsWith("http")
      ? configuredDomain
      : `https://${configuredDomain}`
    : `http://localhost:${process.env.PORT || "8080"}`;

  return new URL("/api/auth/google/callback", origin).toString();
}

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: Number(row.id),
    email: String(row.email),
    googleId: String(row.googleId),
    isPremium: Boolean(row.isPremium),
    freeGenerationsLeft: Number(row.freeGenerationsLeft),
    premiumUntil: row.premiumUntil ? new Date(String(row.premiumUntil)) : null,
    isWhitelisted: Boolean(row.isWhitelisted),
  };
}

export async function findUserById(id: number): Promise<AppUser | null> {
  const result = await pool.query(
    `SELECT id, email, google_id AS "googleId", is_premium AS "isPremium",
            free_generations_left AS "freeGenerationsLeft",
            premium_until AS "premiumUntil", is_whitelisted AS "isWhitelisted"
     FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapUser(result.rows[0] as Record<string, unknown>) : null;
}

async function findOrCreateGoogleUser(
  googleId: string,
  email: string,
): Promise<AppUser> {
  const isDeveloper = isDeveloperEmail(email);
  const result = await pool.query(
    `INSERT INTO users (email, google_id, is_whitelisted)
     VALUES ($1, $2, $3)
     ON CONFLICT (google_id) DO UPDATE
       SET email = EXCLUDED.email,
           is_whitelisted = users.is_whitelisted OR EXCLUDED.is_whitelisted
     RETURNING id, email, google_id AS "googleId", is_premium AS "isPremium",
               free_generations_left AS "freeGenerationsLeft",
               premium_until AS "premiumUntil", is_whitelisted AS "isWhitelisted"`,
    [email.trim().toLowerCase(), googleId, isDeveloper],
  );
  return mapUser(result.rows[0] as Record<string, unknown>);
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
export const isGoogleOAuthConfigured = Boolean(googleClientId && googleClientSecret);

if (isGoogleOAuthConfigured) {
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: googleClientId!,
        clientSecret: googleClientSecret!,
        callbackURL: getGoogleCallbackUrl(),
        state: true,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const verifiedEmail = profile.emails?.find((candidate) => candidate.verified);
          if (!verifiedEmail?.value || !profile.id) {
            done(null, false, { message: "Google did not provide a verified email." });
            return;
          }
          done(null, await findOrCreateGoogleUser(profile.id, verifiedEmail.value));
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

passport.serializeUser((user, done) => {
  done(null, (user as AppUser).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await findUserById(Number(id));
    done(null, user || false);
  } catch (error) {
    done(error as Error);
  }
});

export function configureAuth(app: Express): void {
  app.set("trust proxy", 1);
  app.use(
    session({
      store: new PgSessionStore({
        pool,
        tableName: "sessions",
        createTableIfMissing: false,
        pruneSessionInterval: 15,
      }),
      name: "bpmn.sid",
      secret: sessionSecret || "local-only-session-secret-change-before-deploy",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction || sessionCookieSameSite === "none",
        sameSite: sessionCookieSameSite,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
}

export function isSessionSecretConfigured(): boolean {
  return Boolean(sessionSecret);
}

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

export function createGoogleUser(
  googleId: string,
  email: string,
): Promise<AppUser> {
  return findOrCreateGoogleUser(googleId, email);
}

if (!isProduction && !sessionSecret) {
  logger.warn("SESSION_SECRET is missing; using an insecure local-only session secret.");
}
