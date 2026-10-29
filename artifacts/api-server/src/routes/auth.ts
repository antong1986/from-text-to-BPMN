import { Router, type IRouter } from "express";
import passport from "passport";
import {
  isGoogleOAuthConfigured,
  isSessionSecretConfigured,
  getSafeReturnTo,
} from "../lib/auth";
import type { AppUser } from "../types/app-user";
import { authTestPage } from "../pages/auth-test-page";

const router: IRouter = Router();

function authUnavailable(res: import("express").Response): void {
  res.status(503).json({
    error: "Google OAuth не настроен. Добавьте GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET и SESSION_SECRET.",
  });
}

router.get("/auth/test", (req, res) => {
  if (req.isAuthenticated?.()) {
    res.redirect("/");
    return;
  }

  res.type("html").send(authTestPage);
});

router.get("/auth/google", (req, res, next) => {
  if (!isGoogleOAuthConfigured || !isSessionSecretConfigured()) {
    authUnavailable(res);
    return;
  }

  req.session.oauthReturnTo = getSafeReturnTo(req.query.next);
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
  if (!isGoogleOAuthConfigured || !isSessionSecretConfigured()) {
    authUnavailable(res);
    return;
  }

  passport.authenticate("google", (error: unknown, user: AppUser | false) => {
    if (error || !user) {
      req.log.warn(
        { error: error instanceof Error ? error.message : "Google sign-in denied" },
        "Google OAuth callback failed",
      );
      res.redirect("/api/auth/test?login=failed");
      return;
    }

    req.logIn(user, (loginError) => {
      if (loginError) {
        req.log.error({ error: loginError }, "Could not create authenticated session");
        res.status(500).send("Не удалось создать сессию. Попробуйте войти ещё раз.");
        return;
      }

      const returnTo = getSafeReturnTo(req.session.oauthReturnTo);
      delete req.session.oauthReturnTo;
      req.session.save((saveError) => {
        if (saveError) {
          req.log.error({ error: saveError }, "Could not persist authenticated session");
          res.status(500).send("Не удалось сохранить сессию. Попробуйте войти ещё раз.");
          return;
        }
        res.redirect(returnTo);
      });
    });
  })(req, res, next);
});

router.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.json({ authenticated: false });
    return;
  }

  const user = req.user as AppUser;
  const hasActivePremium =
    user.isPremium &&
    user.premiumUntil !== null &&
    user.premiumUntil.getTime() > Date.now();

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      isPremium: user.isPremium,
      hasActivePremium,
      freeGenerationsLeft: user.freeGenerationsLeft,
      premiumUntil: user.premiumUntil,
      isWhitelisted: user.isWhitelisted,
    },
  });
});

router.post("/auth/logout", (req, res) => {
  req.logout((logoutError) => {
    if (logoutError) {
      req.log.error({ error: logoutError }, "Could not log out user");
      res.status(500).json({ error: "Не удалось завершить сессию." });
      return;
    }

    req.session.destroy((sessionError) => {
      if (sessionError) {
        req.log.error({ error: sessionError }, "Could not destroy user session");
        res.status(500).json({ error: "Не удалось завершить сессию." });
        return;
      }
      res.clearCookie("bpmn.sid", {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.SESSION_COOKIE_SAME_SITE === "none" ? "none" : "lax",
      });
      res.sendStatus(204);
    });
  });
});

export default router;
