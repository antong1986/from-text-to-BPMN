import type { Express, RequestHandler } from "express";

const pingHandler: RequestHandler = (_req, res) => {
  res.status(200).type("text/plain").set("Content-Length", "2").send("ok");
};

export function registerPingRoutes(app: Express): void {
  app.get("/ping", pingHandler);
  app.head("/ping", pingHandler);
}
