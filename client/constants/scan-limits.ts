export const FREE_SCAN_LIMIT = 10;

export function canUseFreeScan(scansUsed: number, isPro: boolean): boolean {
  return isPro || scansUsed < FREE_SCAN_LIMIT;
}

export function getFreeScansRemaining(scansUsed: number): number {
  return Math.max(0, FREE_SCAN_LIMIT - scansUsed);
}

export function getScanButtonAllowanceText(scansUsed: number): string {
  const remaining = getFreeScansRemaining(scansUsed);
  return `${remaining} scan${remaining === 1 ? "" : "s"} left`;
}

export function getProfileAllowanceText(scansUsed: number): string {
  const remaining = getFreeScansRemaining(scansUsed);
  return remaining > 0
    ? `${remaining} free scan${remaining === 1 ? "" : "s"} remaining`
    : "You've used all your free scans";
}
