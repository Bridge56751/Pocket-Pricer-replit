export const FREE_SCAN_LIMIT = 10;

export function hasReachedFreeScanLimit(scansUsed: number): boolean {
  return scansUsed >= FREE_SCAN_LIMIT;
}
