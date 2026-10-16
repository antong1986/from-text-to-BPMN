# Text-to-BPMN Studio

Turns written business-process descriptions into editable BPMN diagrams and technical specifications.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/text-to-bpmn-studio run dev` — run the BPMN Studio web app
- `pnpm --filter @workspace/text-to-bpmn-studio run typecheck` — check the web app
- `pnpm --filter @workspace/api-server run typecheck` — check the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secret: `AI_API_KEY` — Google Gemini key; store it in Replit Secrets, never in source or `.env`
- Gemini endpoint and model are configured on the API Server artifact; the web app calls it through same-origin `/api` routes.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React, Vite, Tailwind CSS, bpmn-js
- API: Express 5
- Validation: Zod
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/text-to-bpmn-studio` — BPMN Studio frontend
- `artifacts/api-server` — shared backend, including Gemini generation routes
- `lib/api-spec/openapi.yaml` — source of truth for the API contract

## Architecture decisions

- Frontend and API use same-origin `/api` routing so local and published use the same path and do not depend on a hardcoded backend URL.
- Gemini requests and the API key stay server-side.

## Product

- Create BPMN diagrams from process descriptions, edit the diagram, and export BPMN XML, SVG, SQL schema, Markdown, and DOCX.
- Generate a technical specification from the current process graph.

## User preferences

- Preserve the uploaded app's Russian-language interface and existing workflow.

## Gotchas

- Do not copy the uploaded archive's `.env` into the project; it contained a key that must be rotated.
- The Google Gemini OpenAI-compatible base URL is `https://generativelanguage.googleapis.com/v1beta/openai`, not the generic `https://googleapis.com` host.
- The requested Gemini 1.5 Flash model is no longer supported; the API artifact uses the current stable Flash model.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
