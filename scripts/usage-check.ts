import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) {
  dotenv.config({ path: envLocal, override: false });
}

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Pull all rows by paginating through Supabase's 1000-row default limit.
async function fetchAllPro(table: "scan_events" | "ebay_search_events", cutoff: string) {
  const PAGE = 1000;
  let from = 0;
  const all: { device_id: string; created_at: string }[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("device_id, created_at")
      .eq("is_pro", true)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data as any[]) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function main() {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Looking at events since ${cutoff} for Pro users...`);

  const scans = await fetchAllPro("scan_events", cutoff);
  const ebay = await fetchAllPro("ebay_search_events", cutoff);
  console.log(`Got ${scans.length} Pro scan_events, ${ebay.length} Pro ebay_search_events`);

  type Bucket = { scans: number; ebays: number };
  const buckets = new Map<string, Bucket>();

  for (const r of scans) {
    const ym = r.created_at.slice(0, 7);
    const key = `${r.device_id}|${ym}`;
    const b = buckets.get(key) || { scans: 0, ebays: 0 };
    b.scans++;
    buckets.set(key, b);
  }
  for (const r of ebay) {
    const ym = r.created_at.slice(0, 7);
    const key = `${r.device_id}|${ym}`;
    const b = buckets.get(key) || { scans: 0, ebays: 0 };
    b.ebays++;
    buckets.set(key, b);
  }

  const rows = Array.from(buckets.entries())
    .map(([key, b]) => {
      const [device, ym] = key.split("|");
      const searchapi = b.scans + b.ebays;
      const serpapi = Math.round(b.ebays * 0.3);
      const gemini = b.ebays;
      return { device: device.slice(0, 22), month: ym, scans: b.scans, ebays: b.ebays, searchapi, serpapi, gemini };
    })
    .sort((a, b) => b.searchapi - a.searchapi);

  console.log("\nTop 15 Pro device-months by estimated SearchAPI usage:");
  console.log("(Caps: SearchAPI 1000/mo, SerpAPI 100/mo, ScrapingDog 1000/mo, Gemini 1000/mo)");
  console.log("---");
  for (const r of rows.slice(0, 15)) {
    const flag =
      r.searchapi > 1000 || r.serpapi > 100 || r.gemini > 1000
        ? "OVER"
        : r.searchapi > 800 || r.serpapi > 80 || r.gemini > 800
          ? "NEAR"
          : "ok";
    console.log(
      `${r.device.padEnd(24)} ${r.month}  scans=${String(r.scans).padStart(4)}  ebays=${String(r.ebays).padStart(4)}  searchapi~${String(r.searchapi).padStart(5)}  serpapi~${String(r.serpapi).padStart(4)}  gemini~${String(r.gemini).padStart(4)}  ${flag}`,
    );
  }

  console.log(`\nTotal distinct Pro device-months in last 60 days: ${rows.length}`);
  const overCap = rows.filter((r) => r.searchapi > 1000 || r.serpapi > 100 || r.gemini > 1000);
  const nearCap = rows.filter(
    (r) =>
      ((r.searchapi > 800 && r.searchapi <= 1000) ||
        (r.serpapi > 80 && r.serpapi <= 100) ||
        (r.gemini > 800 && r.gemini <= 1000)) &&
      !(r.searchapi > 1000 || r.serpapi > 100 || r.gemini > 1000),
  );
  console.log(`Pro device-months OVER cap: ${overCap.length}`);
  console.log(`Pro device-months NEAR cap (80-100%): ${nearCap.length}`);

  if (overCap.length > 0) {
    console.log("\nDevice-months OVER cap:");
    for (const r of overCap) {
      console.log(`  ${r.device} ${r.month}  searchapi~${r.searchapi}  serpapi~${r.serpapi}  gemini~${r.gemini}`);
    }
  }
}

main().catch((err) => {
  console.error("query failed:", err);
  process.exit(1);
});
