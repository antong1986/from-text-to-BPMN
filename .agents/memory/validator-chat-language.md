---
name: Validator chat language
description: Product rule for the language used by AI validator messages.
---

AI validator messages must use the language of the user's original process description, independently of the selected interface language. This applies to the initial validator question, refinement replies, and chat-specific fallback messages.

Short confirmations and commands such as "yes", "да", or "add this" must be interpreted against the preceding validator message. Send that message with the refinement request so the model has the proposal or step the user is referring to.

**Why:** The user reported a Russian process and diagram receiving English validator messages, and asked that short replies be interpreted against the previous validator proposal.

**How to apply:** When changing validator chat behavior, derive its language from the process description rather than the UI locale, and retain the previous validator message as edit context.
