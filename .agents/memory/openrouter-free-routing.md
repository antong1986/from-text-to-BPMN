---
name: OpenRouter free-model routing
description: The tradeoff behind using OpenRouter's dynamic free-model router in Text-to-BPMN Studio.
---

For OpenRouter free inference, prefer `openrouter/free` when availability across free providers matters more than a fixed model choice. It routes to an available free model, but does not remove key-wide or account-wide usage limits.

**Why:** The pinned `google/gemma-4-31b-it:free` model kept returning HTTP 429 after bounded retries, while the public OpenRouter catalog listed `openrouter/free` as a router over available free models.

**How to apply:** If `openrouter/free` also returns 429 after retries, diagnose the OpenRouter key/account quota or free-tier capacity rather than assuming a single model is down or the application timed out.
