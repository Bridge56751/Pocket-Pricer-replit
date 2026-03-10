import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function getGuestScanCount(deviceId: string): Promise<number> {
  const { data, error } = await supabase
    .from("guest_scans")
    .select("scan_count")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch guest scan count: ${error.message}`);
  }

  return data?.scan_count || 0;
}

export async function incrementGuestScan(deviceId: string): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("guest_scans")
    .select("scan_count")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to check guest scan: ${fetchError.message}`);
  }

  const now = new Date().toISOString();

  if (existing) {
    const { error } = await supabase
      .from("guest_scans")
      .update({
        scan_count: existing.scan_count + 1,
        last_scan_at: now,
      })
      .eq("device_id", deviceId)
      .eq("scan_count", existing.scan_count);

    if (error) {
      throw new Error(`Failed to increment guest scan: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from("guest_scans")
      .upsert({
        device_id: deviceId,
        scan_count: 1,
        last_scan_at: now,
      }, { onConflict: "device_id" });

    if (error) {
      throw new Error(`Failed to insert guest scan: ${error.message}`);
    }
  }
}
