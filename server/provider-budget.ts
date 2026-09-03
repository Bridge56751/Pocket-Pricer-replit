/**
 * P0-8: per-Pro-customer monthly budget cap for paid third-party providers.
 *
 * Why this exists
 * ---------------
 * Without a per-Pro-customer monthly cap, a single Pro subscriber can drain
 * the whole plan budget for SearchAPI / SerpAPI / ScrapingDog / Gemini in a
 * day or two — by accident (a runaway client) or on purpose (rotating
 * device IDs after P0-1 ships). Worst-case math is in EXECUTIVE_BRIEF.md
 * "Problem 3" / ARCHITECTURE_RECOMMENDATIONS.md Section 1.
 *
 * Free users are bounded by the shared lifetime scan allowance in routes.ts, so
 * this module deliberately doesn't enforce per-Free caps — the lifetime cap
 * already does that job, and counting free-tier calls in this table would
 * just be noise.
 *
 * Customer identity
 * -----------------
 * Today the "customer key" passed in is the device ID. That's deliberately
 * weak as defense-in-depth: a determined attacker can rotate device IDs to
 * evade. The reason we ship it now anyway is:
 *   - it caps real Pro users from accidentally running away with the budget
 *   - the architecture doesn't change when P0-1 lands; we just start passing
 *     the verified RevenueCat user ID instead of the device ID.
 *
 * The function signatures and Postgres schema are agnostic to which string
 * we put in `customer_key`. See migrations/002_provider_usage.sql.
 *
 * Wiring
 * ------
 * Each outbound paid call site does:
 *
 *     const ok = await checkProviderBudget("searchapi", deviceId, isPro);
 *     if (!ok) return { ok: false, reason: "budget_cap_searchapi" };
 *     // ...do the fetch()...
 *
 * checkProviderBudget() always returns true for free users (their lifetime
 * cap protects them). For Pro users it increments the counter atomically
 * via the increment_provider_usage Postgres function and returns false if
 * the post-increment count exceeds the configured cap.
 *
 * Failure handling
 * ----------------
 * If the database call itself fails (Supabase down, network blip), we fail
 * OPEN — the request proceeds. Reasoning: a transient analytics-table outage
 * shouldn't degrade the user-facing product. The downside (a few extra paid
 * calls during an incident) is much smaller than the upside (the app keeps
 * working). If you'd rather fail closed, flip the `failOpen` constant below.
 */

import { supabase } from "./supabase";

export type ProviderName = "searchapi" | "serpapi" | "scrapingdog" | "gemini";

// Per-Pro-customer monthly call caps. From the project owner's spec
// (2026-04-30): 1000 SearchAPI, 100 SerpAPI, 1000 ScrapingDog per Pro
// customer per month. Gemini cap is a safety guard — query cleaning is cheap
// (~$0.001/call) so a generous limit is fine, but unbounded would still let
// one customer eat thousands of dollars in tokens.
//
// All of these are env-overridable so the owner can tune in prod without a
// code change. Defaults match the spec.
const DEFAULT_PER_PRO_CAPS: Record<ProviderName, number> = {
  searchapi: 1000,
  serpapi: 100,
  scrapingdog: 1000,
  gemini: 1000,
};

// Static env-var map so eslint's no-process-env-dynamic-access rule is happy
// AND so it's grep-able which env vars exist.
const ENV_OVERRIDES: Record<ProviderName, string | undefined> = {
  searchapi: process.env.PRO_CAP_SEARCHAPI,
  serpapi: process.env.PRO_CAP_SERPAPI,
  scrapingdog: process.env.PRO_CAP_SCRAPINGDOG,
  gemini: process.env.PRO_CAP_GEMINI,
};

function getCap(provider: ProviderName): number {
  const raw = ENV_OVERRIDES[provider];
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.warn(
      `[provider-budget] Invalid PRO_CAP_${provider.toUpperCase()}="${raw}", falling back to default ${DEFAULT_PER_PRO_CAPS[provider]}`,
    );
  }
  return DEFAULT_PER_PRO_CAPS[provider];
}

function currentYearMonth(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

const failOpen = true;

/**
 * Atomically increments the (customer, provider, month) counter and returns
 * `true` if the call should proceed, `false` if the cap is exceeded.
 *
 * Free users always return `true` — they're bounded elsewhere by the shared
 * lifetime scan allowance.
 *
 * On infrastructure failure: returns `true` (fail-open). See module-level
 * docstring for the rationale.
 */
export async function checkProviderBudget(
  provider: ProviderName,
  customerKey: string,
  isPro: boolean,
): Promise<boolean> {
  // Free users: don't count, don't cap. The shared lifetime scan limit in
  // /api/scan-with-lens + /api/ebay-sold-search already bounds them.
  if (!isPro) return true;

  // Defensive: the rest of the server requires a non-empty deviceId before
  // reaching paid-call sites, but if a refactor changes that, fail open
  // rather than throw.
  if (!customerKey) {
    console.warn(
      `[provider-budget] Empty customerKey for ${provider}; allowing through`,
    );
    return true;
  }

  if (!supabase) {
    // Analytics disabled — don't pretend to enforce limits we can't track.
    return true;
  }

  const cap = getCap(provider);
  const yearMonth = currentYearMonth();

  try {
    // Cast to any to dodge the supabase-js generic-parameter inference issue
    // that types every RPC call as never (SECURITY_REVIEW.md P1-9). This is
    // the same workaround the rest of server/* uses for table queries.
    const { data, error } = await (supabase.rpc as any)(
      "increment_provider_usage",
      {
        p_customer_key: customerKey,
        p_provider: provider,
        p_year_month: yearMonth,
      },
    );

    if (error) {
      console.error(
        `[provider-budget] RPC error for ${provider}/${customerKey.slice(0, 12)}…/${yearMonth}: ${error.message}`,
      );
      return failOpen;
    }

    const count = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(count)) {
      console.error(
        `[provider-budget] Unexpected RPC return for ${provider}: ${JSON.stringify(data)}`,
      );
      return failOpen;
    }

    if (count > cap) {
      console.warn(
        `[provider-budget] CAP EXCEEDED ${provider} customer=${customerKey.slice(0, 12)}… month=${yearMonth} count=${count} cap=${cap}`,
      );
      return false;
    }

    // Light heads-up logging at 80% so the owner can see usage hot spots
    // before they hit a wall.
    if (count >= Math.floor(cap * 0.8) && count <= cap) {
      console.log(
        `[provider-budget] ${provider} customer=${customerKey.slice(0, 12)}… month=${yearMonth} count=${count}/${cap}`,
      );
    }

    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[provider-budget] Unhandled error for ${provider}: ${msg}`);
    return failOpen;
  }
}
