# Google sign-in, quotas, and OpenRouter

## Environment variables

Configure credentials in Replit Secrets, not in a committed `.env` file:

- `SESSION_SECRET` — a long, random value used to sign login sessions.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — OAuth credentials for a Google
  OAuth 2.0 Web application.
- `OPENROUTER_API_KEY` — key used by the BPMN XML generation route.

Optional configuration:

- `MY_DEVELOPER_EMAIL` — verified Google email that receives permanent
  whitelist access.
- `GOOGLE_CALLBACK_URL` — overrides the callback URI derived from the Replit
  domain. Register the exact value in the Google OAuth client.
- `OPENROUTER_MODEL` — defaults to `openrouter/free`, which routes to an available free model.
- `FRONTEND_URL` and `CORS_ORIGIN` — frontend origin(s), comma-separated for
  `CORS_ORIGIN`, when the frontend is hosted separately.
- `SESSION_COOKIE_SAME_SITE=none` — use only for a cross-site frontend/API
  deployment; HTTPS is required.

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
