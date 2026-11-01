---
name: Validator chat language
description: Product rule for the language used by AI validator messages.
---

AI validator messages must use the language of the user's original process description, independently of the selected interface language. This applies to the initial validator question, refinement replies, and chat-specific fallback messages.

**Why:** The user reported Russian process descriptions and BPMN diagrams receiving English validator messages and asked to fix the mismatch.

**How to apply:** When changing validator chat behavior, derive its language from the process description rather than the UI locale.
