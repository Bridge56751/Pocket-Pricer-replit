import type { PurchasesPackage } from "react-native-purchases";

export type PlanKind =
  | "weekly"
  | "monthly"
  | "yearly"
  | "multiMonth"
  | "lifetime"
  | "other";

export const planKind = (pkg: PurchasesPackage): PlanKind => {
  const period = pkg.product.subscriptionPeriod;
  if (period === "P1W") return "weekly";
  if (period === "P1M") return "monthly";
  if (period === "P1Y") return "yearly";
  if (period && /^P(2|3|6)M$/.test(period)) return "multiMonth";

  if (pkg.packageType === "WEEKLY") return "weekly";
  if (pkg.packageType === "MONTHLY") return "monthly";
  if (pkg.packageType === "ANNUAL") return "yearly";
  if (
    pkg.packageType === "TWO_MONTH" ||
    pkg.packageType === "THREE_MONTH" ||
    pkg.packageType === "SIX_MONTH"
  ) {
    return "multiMonth";
  }
  if (pkg.packageType === "LIFETIME") return "lifetime";
  return "other";
};

const monthCount = (pkg: PurchasesPackage): number | null => {
  const match = pkg.product.subscriptionPeriod?.match(/^P(\d+)M$/);
  return match ? Number(match[1]) : null;
};

export const planName = (pkg: PurchasesPackage, kind = planKind(pkg)) => {
  if (kind === "weekly") return "Weekly";
  if (kind === "monthly") return "Monthly";
  if (kind === "yearly") return "Annual";
  if (kind === "multiMonth") {
    const months = monthCount(pkg);
    return months ? `${months}-Month` : "Multi-month";
  }
  if (kind === "lifetime") return "Lifetime";
  return pkg.product.title || "Pocket Pricer Pro";
};

export const planPeriod = (
  pkg: PurchasesPackage,
  kind = planKind(pkg),
): string | null => {
  if (kind === "lifetime") return "one-time";
  if (pkg.product.productType !== "AUTO_RENEWABLE_SUBSCRIPTION") return null;
  if (kind === "weekly") return "week";
  if (kind === "yearly") return "year";
  if (kind === "monthly") return "month";
  if (kind === "multiMonth") {
    const months = monthCount(pkg);
    return months ? `${months} months` : null;
  }
  return null;
};

export const planDescription = (
  pkg: PurchasesPackage,
  kind = planKind(pkg),
) => {
  if (kind === "yearly") return "Full Pro access for 12 months";
  if (kind === "monthly") return "Full Pro access for 1 month";
  if (kind === "weekly") return "Full Pro access for 7 days";
  if (kind === "multiMonth") {
    const months = monthCount(pkg);
    return months
      ? `Full Pro access for ${months} months`
      : pkg.product.description || "Pocket Pricer Pro access";
  }
  if (kind === "lifetime") return "One-time purchase";
  return pkg.product.description || "Pocket Pricer Pro access";
};

export const isActiveStoreProduct = (
  pkg: PurchasesPackage,
  activeSubscriptionIds: ReadonlySet<string>,
) => activeSubscriptionIds.has(pkg.product.identifier);

export const renewalDisclosure = (
  pkg: PurchasesPackage | undefined,
  platform: "ios" | "android" | "web" | string,
) => {
  const selectedPrice = pkg?.product.priceString;
  if (!pkg || !selectedPrice) {
    return "Subscription details will be shown when plans are available. Manage subscriptions in your device account settings.";
  }

  const kind = planKind(pkg);
  const period = planPeriod(pkg, kind);
  const productName = pkg.product.title || planName(pkg, kind);
  if (pkg.product.productType !== "AUTO_RENEWABLE_SUBSCRIPTION" || !period) {
    return `${productName}: ${selectedPrice}. The App Store or Google Play will show the complete billing terms before you confirm.`;
  }
  if (platform === "ios") {
    return `${productName} renews automatically at ${selectedPrice} per ${period} unless canceled at least 24 hours before the end of the current period. Manage subscriptions in your Apple ID settings.`;
  }
  return `${productName} renews automatically at ${selectedPrice} per ${period} unless canceled in Google Play before renewal. Manage subscriptions in Google Play.`;
};
