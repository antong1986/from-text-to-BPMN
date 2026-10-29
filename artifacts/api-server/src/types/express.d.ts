import type { AppUser } from "./app-user";

declare global {
  namespace Express {
    interface User extends AppUser {}
    interface Request {
      bpmnLimitMode?: "free" | "premium" | "whitelisted";
    }
  }
}

declare module "express-session" {
  interface SessionData {
    oauthReturnTo?: string;
  }
}

export {};
