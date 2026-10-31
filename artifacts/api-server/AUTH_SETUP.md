# Google sign-in, quotas, and OpenRouter

## Environment variables

Configure credentials in Replit Secrets, not in a committed `.env` file:

- `SESSION_SECRET` — a long, random value used to sign login sessions.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — OAuth credentials for a Google
  OAuth 2.0 Web application.
- `OPENROUTER_API_KEY` — key used by the BPMN XML generation route.

The BPMN generation route uses the fixed OpenRouter model
`google/gemini-2.5-flash` (without a `:free` suffix).

Optional configuration:

- `MY_DEVELOPER_EMAIL` — verified Google email that receives permanent
  whitelist access.
- `GOOGLE_CALLBACK_URL` — overrides the callback URI derived from the Replit
  domain. Register the exact value in the Google OAuth client.
- `FRONTEND_URL` and `CORS_ORIGIN` — frontend origin(s), comma-separated for
  `CORS_ORIGIN`, when the frontend is hosted separately.
- `SESSION_COOKIE_SAME_SITE=none` — use only for a cross-site frontend/API
  deployment; HTTPS is required.
- `PRODUCTION_API_URL` — API origin used by the Replit admin panel to read the
  separate production database. Defaults to the Render API used by the Vercel
  frontend.
- `ADMIN_SYNC_TOKEN` — a long random bearer token shared only between Replit
  Secrets and the Render API environment. It protects the production
  read-only snapshot endpoint; never put it in frontend configuration.

The default callback URI is:

`https://<public-project-domain>/api/auth/google/callback`

The studio starts Google sign-in from the canvas and returns users to `/` after
successful authentication. `/api/auth/test` is a minimal sign-in fallback; it
does not accept process text or run test generations.

## Routes

- `GET /api/auth/google` — begins Google OAuth.
- `GET /api/auth/google/callback` — completes sign-in and creates a session.
- `GET /api/auth/me` — returns the authenticated user and quota, or
  `{ "authenticated": false }`.
- `POST /api/auth/logout` — destroys the session.
- `GET /api/admin/production-snapshot` — whitelisted administrators can read a
  read-only snapshot from the production API.
- `GET /api/admin/internal/snapshot` — production API endpoint protected by
  `ADMIN_SYNC_TOKEN`; intended only for the Replit server-to-server proxy.
- `POST /api/bpmn/generate` — accepts `{ "textPrompt": "..." }` and returns
  raw BPMN 2.0 XML from OpenRouter.
- Existing AI-backed routes (`/api/generate`, `/api/upload-document`,
  `/api/refine`, and `/api/generate-spec`) also require sign-in and consume a
  free generation only after successful processing.

## Database schema

User and session tables are defined in the workspace Drizzle schema. Apply the
development schema with:

`pnpm --filter @workspace/db run push`

When publishing to Replit production, review and apply the schema diff through
the Publish flow.
