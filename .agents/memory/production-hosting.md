---
name: Production hosting
description: The user distinguishes the Vercel production frontend from Replit preview data.
---

The user identifies `https://from-text-to-bpmn.vercel.app/` as the live production frontend. Do not treat data from the Replit preview as production data.
The production API runs on Render and uses Neon PostgreSQL for persistent application data, including login sessions.
Render has its own `MY_DEVELOPER_EMAIL` environment value; Replit shared variables do not automatically propagate to it. Existing accounts are added to the whitelist when the Google OAuth callback runs again.

**Why:** Production analytics, administration, and session storage must use the live service's data source, not the Replit preview database.

**How to apply:** Keep Vercel frontend and Render/Neon backend distinct from Replit preview; production database changes must target the Render-connected Neon database. For a false production whitelist flag, verify the Render email list and have the user sign in through Google again.
