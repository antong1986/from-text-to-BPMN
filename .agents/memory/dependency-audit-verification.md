---
name: Dependency audit verification
description: Verify pnpm workspace overrides in both the lockfile and installed dependency tree.
---

After changing pnpm workspace overrides, treat the lockfile audit and installed package tree as separate checks. Use `pnpm audit` to inspect locked resolutions and `pnpm why` to confirm what workspace packages actually resolve; synchronize the install when they disagree.

**Why:** During dependency remediation, the audit reflected fixed lockfile versions while the installed tree still resolved vulnerable versions until it was synchronized.

**How to apply:** Recheck package versions with `pnpm why` after applying overrides and reinstalling before declaring the remediation complete.
