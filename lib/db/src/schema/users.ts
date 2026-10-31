import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  googleId: text("google_id").notNull().unique(),
  isPremium: boolean("is_premium").notNull().default(false),
  freeGenerationsLeft: integer("free_generations_left").notNull().default(3),
  premiumUntil: timestamp("premium_until", { withTimezone: true, mode: "date" }),
  premiumGenerationsUsed: integer("premium_generations_used").notNull().default(0),
  premiumWindowStartedAt: timestamp("premium_window_started_at", {
    withTimezone: true,
    mode: "date",
  }),
  isWhitelisted: boolean("is_whitelisted").notNull().default(false),
});

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (table) => [index("sessions_expire_idx").on(table.expire)],
);

export type User = typeof usersTable.$inferSelect;
