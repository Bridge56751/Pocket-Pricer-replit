import assert from "node:assert/strict";
import test from "node:test";
import type { PurchasesPackage } from "react-native-purchases";

import {
  isActiveStoreProduct,
  planKind,
  planPeriod,
  renewalDisclosure,
} from "./paywall-terms";

const makePackage = ({
  identifier,
  packageType,
  productIdentifier = `store.${identifier}`,
  productType = "AUTO_RENEWABLE_SUBSCRIPTION",
  subscriptionPeriod,
  priceString,
  title = identifier,
  description = `${identifier} description`,
}: {
  identifier: string;
  packageType: string;
  productIdentifier?: string;
  productType?: string;
  subscriptionPeriod?: string | null;
  priceString: string;
  title?: string;
  description?: string;
}) =>
  ({
    identifier,
    packageType,
    product: {
      identifier: productIdentifier,
      productType,
      subscriptionPeriod,
      priceString,
      title,
      description,
    },
  }) as PurchasesPackage;

test("weekly, monthly, and annual packages use localized prices unchanged", () => {
  const cases = [
    ["weekly", "WEEKLY", "P1W", "weekly", "week", "1,99 €"],
    ["monthly", "MONTHLY", "P1M", "monthly", "month", "¥1,200"],
    ["annual", "ANNUAL", "P1Y", "yearly", "year", "CHF 39.00"],
  ] as const;

  for (const [
    identifier,
    packageType,
    subscriptionPeriod,
    kind,
    period,
    price,
  ] of cases) {
    const pkg = makePackage({
      identifier,
      packageType,
      subscriptionPeriod,
      priceString: price,
    });
    assert.equal(planKind(pkg), kind);
    assert.equal(planPeriod(pkg), period);
    assert.match(
      renewalDisclosure(pkg, "ios"),
      new RegExp(price.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("lifetime packages are one-time and never promise renewal", () => {
  const pkg = makePackage({
    identifier: "lifetime",
    packageType: "LIFETIME",
    productType: "NON_CONSUMABLE",
    subscriptionPeriod: null,
    priceString: "$99.99",
  });

  assert.equal(planKind(pkg), "lifetime");
  assert.equal(planPeriod(pkg), "one-time");
  assert.doesNotMatch(renewalDisclosure(pkg, "android"), /renews|per /i);
  assert.match(renewalDisclosure(pkg, "android"), /\$99\.99/);
});

test("custom and unknown products do not invent recurring billing terms", () => {
  const custom = makePackage({
    identifier: "custom",
    packageType: "CUSTOM",
    subscriptionPeriod: "P2W",
    priceString: "R$ 17,90",
  });
  const nonRenewingMonthly = makePackage({
    identifier: "prepaid",
    packageType: "MONTHLY",
    productType: "NON_RENEWING_SUBSCRIPTION",
    subscriptionPeriod: "P1M",
    priceString: "£4.49",
  });

  for (const pkg of [custom, nonRenewingMonthly]) {
    assert.equal(planPeriod(pkg), null);
    assert.doesNotMatch(
      renewalDisclosure(pkg, "ios"),
      /renews|per (week|month|year|billing period)/i,
    );
    assert.match(
      renewalDisclosure(pkg, "ios"),
      new RegExp(
        pkg.product.priceString.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      ),
    );
  }
});

test("active plan matching uses the exact store product identifier", () => {
  const pkg = makePackage({
    identifier: "rc-monthly-package",
    packageType: "MONTHLY",
    productIdentifier: "com.pocketpricer.pro.monthly",
    subscriptionPeriod: "P1M",
    priceString: "$8.99",
  });

  assert.equal(
    isActiveStoreProduct(pkg, new Set(["com.pocketpricer.pro.monthly"])),
    true,
  );
  assert.equal(
    isActiveStoreProduct(pkg, new Set(["rc-monthly-package", "monthly"])),
    false,
  );
});
