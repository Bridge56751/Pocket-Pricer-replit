---
name: RevenueCat server-side Pro verification flag
description: Why enabling server-side RC Pro verification can brick all paying users, and the safe rollout order.
---

# VERIFY_PRO_VIA_RC is a footgun — never enable before client device_id aliasing is adopted

The server can verify Pro status two ways, chosen by the `VERIFY_PRO_VIA_RC` env flag:
- flag unset/false → trust the client `X-Is-Pro` header (legacy, what production runs on).
- flag = `"true"` → look up `X-Device-Id` in RevenueCat REST and use that as source of truth.

**Rule:** Do NOT set `VERIFY_PRO_VIA_RC=true` until the client release that calls
`Purchases.logIn(deviceId)` on launch (which aliases each RC subscriber to their device_id)
is adopted by ~all active Pro users.

**Why:** RC lookup is keyed by device_id. Without the aliasing release live, RC returns
404 for existing Pro subscribers. The verify path is **fail-closed**: 404 / timeout / 5xx /
network error all return `false` (not Pro). So flipping the flag early downgrades every
paying user to free → they hit the 3-scan lifetime limit → get paywalled despite paying.
This has happened in practice (flag flipped well before the aliasing release was adopted);
symptom surfaced as "scan failed / try again" and paying-user churn.

**How to recover / apply:** Instant rollback = delete the `VERIFY_PRO_VIA_RC` secret and
redeploy; `getIsPro()` reverts to the header path with no code change. When debugging
"scans broken" emergencies, also rule out test artifacts: a junk/non-product image legitimately
returns 404 after a slow ScrapingDog fallback (SearchAPI returns 0 visual matches), and rapid
automated POSTs from one IP get a plain-HTML 403 from Replit's edge (not the app's JSON 403) —
neither indicates a real scan failure.
