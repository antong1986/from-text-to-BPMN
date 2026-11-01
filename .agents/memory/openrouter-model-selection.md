---
name: OpenRouter model selection
description: The deliberate model choice for BPMN generation in Text-to-BPMN Studio.
---

Use the exact model ID `google/gemini-2.5-flash` for BPMN generation, without a `:free` suffix or dynamic free-model router. Keep the API key in Replit Secrets and never expose its value.

**Why:** The user added OpenRouter balance and explicitly chose the paid Gemini Flash model after repeated limits and malformed responses from free routing.

**How to apply:** Keep the model pinned in the backend unless the user asks to change it. Do not set a fixed `max_tokens` on the full BPMN XML request; allow the provider/model output limit and instruct the model not to omit or shorten XML. Diagnose API-key, quota, or response-format errors without silently switching to a different model.
