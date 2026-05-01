-- P0-8: per-Pro-customer monthly call counter for paid third-party providers.
--
-- Tracks how many times each (customer_key, provider) pair has called a paid
-- outbound API in a given calendar month. The server consults this table
-- before every paid call and refuses if the per-Pro-customer monthly cap
-- would be exceeded.
--
-- Today, customer_key is the device ID. After P0-1 lands (server-side
-- RevenueCat verification), customer_key becomes the verified RevenueCat
-- user ID, with no schema change required — the rate limiter just starts
-- writing a different string into the same column.
--
-- Free users are NOT counted here — they're already bounded by the
-- FREE_LIFETIME_SEARCHES = 3 cap in routes.ts. This table only exists to
-- prevent a single Pro subscriber from draining the entire monthly plan
-- budget for a paid provider.
--
-- See:
--  - server/provider-budget.ts (the helper that reads/writes this table)
--  - SECURITY_REVIEW.md P0-8 (the original finding)
--  - EXECUTIVE_BRIEF.md "Problem 3" (the cost-amplification scenario)

CREATE TABLE IF NOT EXISTS provider_usage (
    -- Today: device_id. After P0-1: revenuecat_user_id.
    customer_key text NOT NULL,
    -- 'searchapi' | 'serpapi' | 'scrapingdog' | 'gemini'
    provider text NOT NULL,
    -- 'YYYY-MM' so calendar-month rollover happens automatically.
    year_month text NOT NULL,
    call_count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_key, provider, year_month)
);

-- Atomic increment-and-return helper. Used by the server before each paid
-- outbound call:
--   1. UPSERT increments the row (or creates it with count=1)
--   2. RETURNING gives us the post-increment count
--   3. The caller compares against the configured cap and decides whether
--      to proceed with the actual fetch() or short-circuit with a "service
--      temporarily unavailable" response.
--
-- Doing this atomically (instead of SELECT-then-UPDATE) avoids the same
-- TOCTOU race that bites the existing incrementGuestScan helper.
CREATE OR REPLACE FUNCTION increment_provider_usage(
    p_customer_key text,
    p_provider text,
    p_year_month text
) RETURNS integer
LANGUAGE sql
AS $$
    INSERT INTO provider_usage (customer_key, provider, year_month, call_count, updated_at)
    VALUES (p_customer_key, p_provider, p_year_month, 1, now())
    ON CONFLICT (customer_key, provider, year_month)
    DO UPDATE SET
        call_count = provider_usage.call_count + 1,
        updated_at = now()
    RETURNING call_count;
$$;

-- RLS hygiene: this table is service-role only. It tracks per-customer
-- usage and shouldn't be readable by anon or authenticated clients.
ALTER TABLE provider_usage ENABLE ROW LEVEL SECURITY;
-- (No policies created → default deny for anon + authenticated.
-- Service role bypasses RLS by design, so the server keeps working.)
