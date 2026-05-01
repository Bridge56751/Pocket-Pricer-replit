import "../server/env-loader";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await supabase
    .from("provider_usage")
    .select("customer_key, provider, year_month, call_count, updated_at")
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }
  console.log(`provider_usage rows: ${data?.length ?? 0}`);
  data?.forEach((r) =>
    console.log(
      `  ${r.customer_key.padEnd(40)} | ${r.provider.padEnd(12)} | ${r.year_month} | count=${r.call_count} | updated=${r.updated_at}`,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
