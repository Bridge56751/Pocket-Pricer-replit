/**
 * server/revenuecat.ts — Group C Part B / P0-1
 *
 * Server-side Pro entitlement verification via the RevenueCat REST API.
 *
 * Background:
 *   Until this file existed, the server determined Pro status by reading
 *   the X-Is-Pro request header. That header is set by the client and
 *   trusted blindly, so any caller with curl + 30 seconds could send
 *   `X-Is-Pro: true` and unlock every Pro-gated endpoint for free.
 *   Documented in SECURITY_REVIEW.md P0-1.
 *
 * What this module does:
 *   Looks up a device_id in RevenueCat's REST API and returns whether
 *   that subscriber has the "Pocket Pricer Pro" entitlement currently
 *   active (i.e. expires_date in the future). This becomes the source
 *   of truth for Pro status, NOT the client header.
 *
 * Required setup before this module is useful:
 *   1. PR #2 (Group C Part A) must be live and adopted by ~80% of active
 *      users. That release added Purchases.logIn(deviceId) on app launch,
 *      which aliases each user's anonymous RevenueCat subscriber record
 *      to their device_id. Without that alias, the lookup below returns
 *      404 for every existing Pro subscriber → they all appear free →
 *      bricked. See docs/CHANGELOG_GROUP_C_CLIENT.md.
 *   2. REVENUECAT_REST_SECRET env var set on Replit Secrets. Get it from
 *      RevenueCat dashboard → Project Settings → API keys → Secret keys.
 *   3. VERIFY_PRO_VIA_RC=true env var set to actually flip the routes
 *      over to using this module. Default OFF for safe rollout — see
 *      server/routes.ts:getIsPro.
 *
 * Caching:
 *   Pro status changes infrequently (a subscription cancellation or
 *   refund propagates through Apple/Google → RC in seconds, then
 *   webhooks update the entitlement). 5-minute LRU cache here protects
 *   us from hitting RC's REST API on every backend request, which would
 *   add ~100-300ms per request and could rate-limit us at scale.
 *
 * Failure modes:
 *   - REVENUECAT_REST_SECRET unset → log + return false (fail closed,
 *     don't unlock Pro features)
 *   - RC API timeout (3s) → return false, cache for 30s so we recover
 *     fast when RC comes back
 *   - RC HTTP 404 (unknown subscriber) → return false (legitimate free
 *     user OR a holdout who hasn't updated past PR #2 yet — both should
 *     get free-tier behavior; the holdout will get told to update via
 *     in-app paywall)
 *   - RC HTTP 5xx → return false, cache for 30s
 *   - Network error → return false, cache for 30s
 *
 * Known limitation (NOT fixed by this module):
 *   An attacker who somehow obtains a real Pro user's device_id (e.g.
 *   from a friend who shares it) can still impersonate them by sending
 *   that device_id in the X-Device-Id header. The proper fix is JWT
 *   auth (SECURITY_REVIEW.md P0-2), queued as Phase 3. This module
 *   strictly closes the X-Is-Pro header trust loophole and nothing more.
 */
import { LRUCache } from "lru-cache";

const PRO_ENTITLEMENT_KEY = "Pocket Pricer Pro";
const RC_API_BASE = "https://api.revenuecat.com/v1";
const RC_TIMEOUT_MS = 3000;
const POSITIVE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — Pro status changes infrequently
const NEGATIVE_CACHE_TTL_MS = 30 * 1000; // 30 sec — recover fast from RC outages

const cache = new LRUCache<string, boolean>({
  max: 10_000,
  ttl: POSITIVE_CACHE_TTL_MS,
});

/**
 * Lookup the given device_id in RevenueCat and return whether it has
 * an active "Pocket Pricer Pro" entitlement.
 *
 * Cached for 5 minutes on success. Returns false (and caches for 30s)
 * on any failure mode — never throws to the caller.
 */
export async function verifyProViaRevenueCat(
  deviceId: string,
): Promise<boolean> {
  const cached = cache.get(deviceId);
  if (cached !== undefined) return cached;

  const apiKey = process.env.REVENUECAT_REST_SECRET;
  if (!apiKey) {
    // Misconfigured Replit Secrets. Log loudly so the operator notices,
    // and fail closed (don't grant Pro). Don't cache — we want to retry
    // (and re-log) once the env var is fixed.
    console.error(
      "[rc] REVENUECAT_REST_SECRET not set — falling back to false (Pro disabled)",
    );
    return false;
  }

  try {
    const response = await fetch(
      `${RC_API_BASE}/subscribers/${encodeURIComponent(deviceId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(RC_TIMEOUT_MS),
      },
    );

    if (response.status === 404) {
      // Unknown subscriber. Either a real free user (correct) OR a Pro
      // holdout who hasn't updated past PR #2 yet (will be told to
      // update via in-app paywall flow). Either way: not Pro right now.
      cache.set(deviceId, false);
      return false;
    }

    if (!response.ok) {
      // RC API trouble (5xx, rate limit, etc.). Fail closed but cache
      // for only 30s so we recover quickly when RC comes back.
      console.warn(
        `[rc] HTTP ${response.status} for ${deviceId.slice(0, 12)}…`,
      );
      cache.set(deviceId, false, { ttl: NEGATIVE_CACHE_TTL_MS });
      return false;
    }

    const data = (await response.json()) as {
      subscriber?: {
        entitlements?: Record<
          string,
          { expires_date?: string | null } | undefined
        >;
      };
    };
    const proEntitlement =
      data?.subscriber?.entitlements?.[PRO_ENTITLEMENT_KEY];
    let isPro = false;
    if (proEntitlement) {
      const expiresAt = proEntitlement.expires_date
        ? Date.parse(proEntitlement.expires_date)
        : null;
      // Lifetime entitlements (no expiry) are valid. Otherwise check the
      // future date. NaN guard — if RC returns a malformed date, treat
      // as not-Pro rather than panicking.
      isPro =
        expiresAt === null ||
        (Number.isFinite(expiresAt) && expiresAt > Date.now());
    }

    cache.set(deviceId, isPro);
    return isPro;
  } catch (err) {
    // Network error, timeout, or JSON parse error. Fail closed but
    // cache for only 30s so we recover quickly.
    console.warn(`[rc] lookup failed for ${deviceId.slice(0, 12)}…:`, err);
    cache.set(deviceId, false, { ttl: NEGATIVE_CACHE_TTL_MS });
    return false;
  }
}

/**
 * Test-only: clear the cache so unit tests can isolate.
 */
export function __clearProCache(): void {
  cache.clear();
}
