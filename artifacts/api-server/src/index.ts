import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { ensureSessionStoreTable } from "./lib/session-store";
import { ensureUsersTable } from "./lib/user-store";
import {
  ensureLemonSqueezyWebhookEventsTable,
  ensurePaymentOrdersTable,
} from "./lib/payment-orders";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    await ensureUsersTable((sql) => pool.query(sql));
    await ensureSessionStoreTable((sql) => pool.query(sql));
    await ensurePaymentOrdersTable((sql) => pool.query(sql));
    await ensureLemonSqueezyWebhookEventsTable((sql) => pool.query(sql));

    const { default: app } = await import("./app");
    const server = app.listen(port, () => {
      logger.info({ port }, "Server listening");
    });
    server.on("error", (err) => {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    });
  } catch (err) {
    logger.error(
      { err },
      "Failed to initialize PostgreSQL tables; server will not start",
    );
    process.exit(1);
  }
}

void startServer();
