import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
const envLocal = resolve(process.cwd(), ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal, override: false });
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  // Catch every test prefix from this session
  const prefixes = ["probe_caphit", "probe_capboth", "probe_smoke", "probe_localtest"];
  for (const p of prefixes) {
    const { error, count } = await supabase
      .from("provider_usage")
      .delete({ count: "exact" })
      .like("customer_key", `${p}%`);
    if (error) console.error(`${p}% delete error:`, error.message);
    else console.log(`Deleted ${count ?? "?"} ${p}% rows from provider_usage`);
  }
}
main().catch((e) => console.error(e));
