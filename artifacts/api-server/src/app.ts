import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { registerPingRoutes } from "./lib/ping";
import { configureAuth } from "./lib/auth";
import { getCorsAllowedOrigins } from "./lib/cross-origin-auth";

const app: Express = express();
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

registerPingRoutes(app);

const allowedOrigins = getCorsAllowedOrigins();
app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes(origin)
    ) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(
  "/api/payment/webhook-lemonsqueezy",
  express.raw({ type: "application/json", limit: "1mb" }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="google-site-verification" content="5WV2E2zk-L1P_yBloFSUHpQ3G1Fzd7bY4GbLvW4Hco8" />
    <title>Text-to-BPMN API</title>
  </head>
  <body>
    <main><h1>Text-to-BPMN API</h1></main>
  </body>
</html>`);
});

configureAuth(app);
app.use("/api", router);

const handleBodyError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: "Описание слишком большое: запрос должен быть не больше 1 МБ. Разделите процесс на части." });
    return;
  }
  next(error);
};
app.use(handleBodyError);

export default app;
