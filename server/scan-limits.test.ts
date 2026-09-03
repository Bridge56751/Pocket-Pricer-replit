import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_SCAN_LIMIT,
  hasReachedFreeScanLimit,
} from "../shared/scan-limits";

test("server allows the final free scan", () => {
  assert.equal(hasReachedFreeScanLimit(FREE_SCAN_LIMIT - 1), false);
});

test("server blocks scan and sold-search requests at the shared limit", () => {
  const protectedEndpoints = [
    "/api/scan-with-lens",
    "/api/ebay-sold-search",
  ] as const;

  for (const endpoint of protectedEndpoints) {
    assert.equal(
      hasReachedFreeScanLimit(FREE_SCAN_LIMIT),
      true,
      `${endpoint} should block at the shared free scan limit`,
    );
    assert.equal(
      hasReachedFreeScanLimit(FREE_SCAN_LIMIT + 1),
      true,
      `${endpoint} should remain blocked above the shared free scan limit`,
    );
  }
});
