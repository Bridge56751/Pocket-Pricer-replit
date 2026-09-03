import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_SCAN_LIMIT,
  canUseFreeScan,
  getFreeScansRemaining,
  getProfileAllowanceText,
  getScanButtonAllowanceText,
} from "./scan-limits";

test("a new free user receives the full shared allowance", () => {
  assert.equal(FREE_SCAN_LIMIT, 10);
  assert.equal(canUseFreeScan(0, false), true);
  assert.equal(getFreeScansRemaining(0), FREE_SCAN_LIMIT);
  assert.equal(getScanButtonAllowanceText(0), "10 scans left");
  assert.equal(getProfileAllowanceText(0), "10 free scans remaining");
});

test("a partially used free allowance gates and messages consistently", () => {
  const scansUsed = 4;

  assert.equal(canUseFreeScan(scansUsed, false), true);
  assert.equal(getFreeScansRemaining(scansUsed), 6);
  assert.equal(getScanButtonAllowanceText(scansUsed), "6 scans left");
  assert.equal(getProfileAllowanceText(scansUsed), "6 free scans remaining");
});

test("camera and library entry paths use the same boundary", () => {
  const entryPaths = ["camera", "library"] as const;

  for (const source of entryPaths) {
    assert.equal(
      canUseFreeScan(FREE_SCAN_LIMIT - 1, false),
      true,
      `${source} should allow the final free scan`,
    );
    assert.equal(
      canUseFreeScan(FREE_SCAN_LIMIT, false),
      false,
      `${source} should block at the free limit`,
    );
  }
});

test("the 10-scan boundary shows no remaining scans", () => {
  assert.equal(getFreeScansRemaining(FREE_SCAN_LIMIT), 0);
  assert.equal(getScanButtonAllowanceText(FREE_SCAN_LIMIT), "0 scans left");
  assert.equal(
    getProfileAllowanceText(FREE_SCAN_LIMIT),
    "You've used all your free scans",
  );
});

test("a Pro user is never blocked by the free allowance", () => {
  assert.equal(canUseFreeScan(0, true), true);
  assert.equal(canUseFreeScan(FREE_SCAN_LIMIT, true), true);
  assert.equal(canUseFreeScan(FREE_SCAN_LIMIT + 100, true), true);
});
