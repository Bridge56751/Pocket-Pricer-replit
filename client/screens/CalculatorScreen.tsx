import React, { useMemo, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
  Modal,
} from "react-native";
import { KeyboardToolbar } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated from "react-native-reanimated";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { useTabBarFadeOnScroll } from "@/hooks/useTabBarFadeOnScroll";

type FeeBreakdown = {
  platformFee: number;
  paymentFee: number;
  perOrderFee: number;
  totalFees: number;
};

type ShippingModel = "both" | "label-only" | "neither" | "flat-tier";

type ShippingTier = { label: string; cost: number };

type Marketplace = {
  id: string;
  name: string;
  short: string;
  accent: string;
  feeNote: string;
  shipping: ShippingModel;
  shippingNote: string;
  shippingTiers?: ShippingTier[];
  calculate: (sale: number, shippingCharged: number) => FeeBreakdown;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(value: number): string {
  if (!isFinite(value)) return "$0.00";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toFixed(2)}`;
}

const MARKETPLACES: Marketplace[] = [
  {
    id: "ebay",
    name: "eBay",
    short: "eBay",
    accent: "#0064D2",
    feeNote: "13.25% of item + shipping, plus $0.40 per order. Most categories.",
    shipping: "both",
    shippingNote: "You set the shipping price. eBay labels are usually discounted.",
    calculate: (sale, shipping) => {
      const base = sale + shipping;
      const platformFee = round2(base * 0.1325);
      const perOrderFee = sale > 0 ? 0.4 : 0;
      const paymentFee = 0;
      return {
        platformFee,
        paymentFee,
        perOrderFee,
        totalFees: round2(platformFee + paymentFee + perOrderFee),
      };
    },
  },
  {
    id: "mercari",
    name: "Mercari",
    short: "Mercari",
    accent: "#FF5B5B",
    feeNote: "10% on item, plus 2.9% + $0.50 payment processing.",
    shipping: "neither",
    shippingNote: "Mercari shipping varies by label and category. Enter just the sale price — handle shipping separately.",
    calculate: (sale, shipping) => {
      const platformFee = round2(sale * 0.1);
      const paymentFee = sale > 0 ? round2((sale + shipping) * 0.029 + 0.5) : 0;
      return {
        platformFee,
        paymentFee,
        perOrderFee: 0,
        totalFees: round2(platformFee + paymentFee),
      };
    },
  },
  {
    id: "poshmark",
    name: "Poshmark",
    short: "Posh",
    accent: "#7B2D8E",
    feeNote: "Flat $2.95 under $15. 20% on $15 and up. Buyer pays shipping label.",
    shipping: "neither",
    shippingNote: "Buyer pays Poshmark's flat-rate label directly. You don't pay or charge for shipping.",
    calculate: (sale) => {
      const platformFee = sale <= 0 ? 0 : sale < 15 ? 2.95 : round2(sale * 0.2);
      return {
        platformFee,
        paymentFee: 0,
        perOrderFee: 0,
        totalFees: platformFee,
      };
    },
  },
  {
    id: "depop",
    name: "Depop",
    short: "Depop",
    accent: "#FF2300",
    feeNote: "10% selling fee on item + shipping, plus 3.3% + $0.45 payment processing.",
    shipping: "both",
    shippingNote: "You can use a Depop label (buyer pays at checkout) or arrange your own.",
    calculate: (sale, shipping) => {
      const base = sale + shipping;
      const platformFee = round2(base * 0.1);
      const paymentFee = sale > 0 ? round2(base * 0.033 + 0.45) : 0;
      return {
        platformFee,
        paymentFee,
        perOrderFee: 0,
        totalFees: round2(platformFee + paymentFee),
      };
    },
  },
  {
    id: "etsy",
    name: "Etsy",
    short: "Etsy",
    accent: "#F1641E",
    feeNote: "6.5% transaction on item + shipping, $0.20 listing, plus 3% + $0.25 payment processing.",
    shipping: "both",
    shippingNote: "You set shipping. Fees apply to item + shipping combined.",
    calculate: (sale, shipping) => {
      const base = sale + shipping;
      const platformFee = round2(base * 0.065);
      const perOrderFee = sale > 0 ? 0.2 : 0;
      const paymentFee = sale > 0 ? round2(base * 0.03 + 0.25) : 0;
      return {
        platformFee,
        paymentFee,
        perOrderFee,
        totalFees: round2(platformFee + paymentFee + perOrderFee),
      };
    },
  },
  {
    id: "whatnot",
    name: "Whatnot",
    short: "Whatnot",
    accent: "#FFCB05",
    feeNote: "8% commission, plus 2.9% + $0.30 payment processing.",
    shipping: "flat-tier",
    shippingNote: "Whatnot generates flat-rate labels by weight. Buyer usually pays at checkout — exact rates vary by category.",
    shippingTiers: [
      { label: "Up to 4 oz", cost: 4.49 },
      { label: "Up to 8 oz", cost: 5.49 },
      { label: "Up to 1 lb", cost: 7.49 },
      { label: "Up to 3 lb", cost: 10.99 },
      { label: "Up to 7 lb", cost: 15.99 },
    ],
    calculate: (sale, shipping) => {
      const base = sale + shipping;
      const platformFee = round2(sale * 0.08);
      const paymentFee = sale > 0 ? round2(base * 0.029 + 0.3) : 0;
      return {
        platformFee,
        paymentFee,
        perOrderFee: 0,
        totalFees: round2(platformFee + paymentFee),
      };
    },
  },
  {
    id: "stockx",
    name: "StockX",
    short: "StockX",
    accent: "#006340",
    feeNote: "9% transaction + 3% payment processing. Buyer pays shipping.",
    shipping: "label-only",
    shippingNote: "You ship to StockX using their discounted label. Buyer pays shipping separately at checkout.",
    calculate: (sale) => {
      const platformFee = round2(sale * 0.09);
      const paymentFee = round2(sale * 0.03);
      return {
        platformFee,
        paymentFee,
        perOrderFee: 0,
        totalFees: round2(platformFee + paymentFee),
      };
    },
  },
  {
    id: "facebook",
    name: "Facebook",
    short: "FB Mktpl",
    accent: "#1877F2",
    feeNote: "10% selling fee on shipped orders, with a $0.40 minimum. Local pickup is free.",
    shipping: "both",
    shippingNote: "Local pickup has no shipping. For shipped orders you set the rate and pay the label.",
    calculate: (sale, shipping) => {
      if (sale <= 0) return { platformFee: 0, paymentFee: 0, perOrderFee: 0, totalFees: 0 };
      const base = sale + shipping;
      const platformFee = Math.max(round2(base * 0.1), 0.4);
      return {
        platformFee,
        paymentFee: 0,
        perOrderFee: 0,
        totalFees: platformFee,
      };
    },
  },
  {
    id: "amazon",
    name: "Amazon",
    short: "Amazon",
    accent: "#FF9900",
    feeNote: "15% referral fee on item + shipping. Varies by category — defaulting to the most common.",
    shipping: "both",
    shippingNote: "Merchant-fulfilled: you pay the label. Referral fee applies to item + shipping.",
    calculate: (sale, shipping) => {
      const base = sale + shipping;
      const platformFee = round2(base * 0.15);
      return {
        platformFee,
        paymentFee: 0,
        perOrderFee: 0,
        totalFees: platformFee,
      };
    },
  },
];

function parseMoney(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace(/[^0-9.]/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) && n > 0 ? n : 0;
}

export default function CalculatorScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useDesignTokens();
  const tabBarFadeHandler = useTabBarFadeOnScroll();
  const scrollRef = useRef<any>(null);

  useFocusEffect(
    useCallback(() => {
      const id = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo?.({ y: 0, animated: false });
      });
      return () => cancelAnimationFrame(id);
    }, []),
  );

  const [marketplaceId, setMarketplaceId] = useState<string>("ebay");
  const [salePrice, setSalePrice] = useState("");
  const [itemCost, setItemCost] = useState("");
  const [shippingCharged, setShippingCharged] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [tierIdx, setTierIdx] = useState<number>(0);
  const [tierPayer, setTierPayer] = useState<"buyer" | "seller">("buyer");
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const [marketplacePickerOpen, setMarketplacePickerOpen] = useState(false);

  const marketplace = useMemo(
    () => MARKETPLACES.find(m => m.id === marketplaceId) || MARKETPLACES[0],
    [marketplaceId]
  );

  const result = useMemo(() => {
    const sale = parseMoney(salePrice);
    const cost = parseMoney(itemCost);
    const shipChargedRaw = parseMoney(shippingCharged);
    const shipPaidRaw = parseMoney(shippingCost);

    // Clamp shipping inputs to what this marketplace actually allows.
    let shipCharged: number;
    let shipPaid: number;
    if (marketplace.shipping === "flat-tier") {
      const tiers = marketplace.shippingTiers || [];
      const tier = tiers[tierIdx] || tiers[0];
      const tierCost = tier ? tier.cost : 0;
      shipCharged = tierPayer === "buyer" ? tierCost : 0;
      shipPaid = tierCost;
    } else {
      shipCharged = marketplace.shipping === "both" ? shipChargedRaw : 0;
      shipPaid = marketplace.shipping === "neither" ? 0 : shipPaidRaw;
    }

    const fees = marketplace.calculate(sale, shipCharged);
    const gross = sale + shipCharged;
    const netPayout = round2(gross - fees.totalFees);
    const profit = round2(netPayout - cost - shipPaid);
    const margin = sale > 0 ? (profit / sale) * 100 : 0;
    const roi = cost > 0 ? (profit / cost) * 100 : 0;

    return {
      sale,
      cost,
      shipCharged,
      shipPaid,
      gross,
      fees,
      netPayout,
      profit,
      margin,
      roi,
      hasInputs: sale > 0,
    };
  }, [salePrice, itemCost, shippingCharged, shippingCost, marketplace, tierIdx, tierPayer]);

  const profitColor = result.profit >= 0 ? "#047857" : "#DC2626";

  const handleSelectMarketplace = (id: string) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    setMarketplaceId(id);
    const next = MARKETPLACES.find(m => m.id === id);
    if (next) {
      if (next.shipping !== "both") setShippingCharged("");
      if (next.shipping === "neither") setShippingCost("");
      if (next.shipping === "flat-tier") {
        setTierIdx(0);
        setTierPayer("buyer");
      }
    }
  };

  const handleReset = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSalePrice("");
    setItemCost("");
    setShippingCharged("");
    setShippingCost("");
    setTierIdx(0);
    setTierPayer("buyer");
  };

  return (
    <View style={[styles.container, { backgroundColor: "#F3F4F6" }]}>
      <View style={[styles.heroTopFill, { height: insets.top + 200 }]} />
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: tabBarHeight + 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={tabBarFadeHandler}
        scrollEventThrottle={16}
      >
        <LinearGradient
          colors={["#0A3622", "#0A3622", "#14532D", "#1A6B3C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.heroCard, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Feather name="percent" size={20} color="#FFFFFF" />
              <Text style={styles.appName}>Profit Calculator</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Know your margin</Text>
          <Text style={styles.heroDescription}>
            Pick a marketplace and we'll do the fee math for you.
          </Text>

          <Pressable
            onPress={() => setMarketplacePickerOpen(true)}
            style={({ pressed }) => [
              styles.marketplaceSelectButton,
              { opacity: pressed ? 0.85 : 1 },
            ]}
            testID="button-open-marketplace-picker"
          >
            <View style={[styles.marketplaceDot, { backgroundColor: marketplace.accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.marketplaceSelectLabel}>SELLING ON</Text>
              <Text style={styles.marketplaceSelectName}>{marketplace.name}</Text>
            </View>
            <Feather name="chevron-down" size={20} color="#0A3622" />
          </Pressable>
        </LinearGradient>

        <View style={styles.belowHero}>
          <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: theme.colors.foreground }]}>
                {marketplace.name}
              </Text>
              <Pressable
                onPress={() => setFeeInfoOpen(true)}
                hitSlop={8}
                style={styles.infoBtn}
                testID="button-fee-info"
              >
                <Feather name="info" size={16} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.cardSub, { color: theme.colors.mutedForeground }]}>
              {marketplace.feeNote}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, marginTop: 12 }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
              SALE
            </Text>
            {marketplace.shipping === "both" ? (
              <View style={styles.inputsRow}>
                <View style={styles.inputCell}>
                  <MoneyInput
                    label="Sale price"
                    value={salePrice}
                    onChangeText={setSalePrice}
                    placeholder="0.00"
                    theme={theme}
                    testID="input-sale-price"
                  />
                </View>
                <View style={styles.inputCell}>
                  <MoneyInput
                    label="Shipping charged"
                    value={shippingCharged}
                    onChangeText={setShippingCharged}
                    placeholder="0.00"
                    theme={theme}
                    testID="input-shipping-charged"
                  />
                </View>
              </View>
            ) : (
              <MoneyInput
                label="Sale price"
                value={salePrice}
                onChangeText={setSalePrice}
                placeholder="0.00"
                theme={theme}
                testID="input-sale-price"
              />
            )}

            <View style={styles.shippingNoteRow}>
              <Feather name="truck" size={12} color="#047857" />
              <Text style={[styles.shippingNoteText, { color: theme.colors.mutedForeground }]}>
                {marketplace.shippingNote}
              </Text>
            </View>

            {marketplace.shipping === "flat-tier" && marketplace.shippingTiers ? (
              <View style={styles.tierBlock}>
                <Text style={[styles.tinyLabel, { color: theme.colors.mutedForeground }]}>
                  WHO PAYS SHIPPING
                </Text>
                <View style={styles.payerToggleRow}>
                  {(["buyer", "seller"] as const).map((p) => {
                    const active = tierPayer === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.selectionAsync();
                          setTierPayer(p);
                        }}
                        style={[
                          styles.payerToggleBtn,
                          {
                            backgroundColor: active ? "#047857" : theme.colors.muted,
                            borderColor: active ? "#047857" : "rgba(0,0,0,0.06)",
                          },
                        ]}
                        testID={`button-payer-${p}`}
                      >
                        <Text
                          style={[
                            styles.payerToggleText,
                            { color: active ? "#FFFFFF" : theme.colors.foreground },
                          ]}
                        >
                          {p === "buyer" ? "Buyer pays" : "I cover it"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.tinyLabel, { color: theme.colors.mutedForeground, marginTop: 12 }]}>
                  LABEL TIER
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tierChipsRow}
                >
                  {marketplace.shippingTiers.map((tier, idx) => {
                    const active = tierIdx === idx;
                    return (
                      <Pressable
                        key={tier.label}
                        onPress={() => {
                          if (Platform.OS !== "web") Haptics.selectionAsync();
                          setTierIdx(idx);
                        }}
                        style={[
                          styles.tierChip,
                          {
                            backgroundColor: active ? "#ECFDF5" : theme.colors.muted,
                            borderColor: active ? "#047857" : "rgba(0,0,0,0.06)",
                          },
                        ]}
                        testID={`chip-tier-${idx}`}
                      >
                        <Text
                          style={[
                            styles.tierChipLabel,
                            { color: active ? "#047857" : theme.colors.foreground },
                          ]}
                        >
                          {tier.label}
                        </Text>
                        <Text
                          style={[
                            styles.tierChipCost,
                            { color: active ? "#047857" : theme.colors.mutedForeground },
                          ]}
                        >
                          {fmt(tier.cost)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground, marginTop: 8 }]}>
              YOUR COSTS
            </Text>
            {marketplace.shipping === "neither" || marketplace.shipping === "flat-tier" ? (
              <MoneyInput
                label="Item cost"
                value={itemCost}
                onChangeText={setItemCost}
                placeholder="0.00"
                theme={theme}
                testID="input-item-cost"
              />
            ) : (
              <View style={styles.inputsRow}>
                <View style={styles.inputCell}>
                  <MoneyInput
                    label="Item cost"
                    value={itemCost}
                    onChangeText={setItemCost}
                    placeholder="0.00"
                    theme={theme}
                    testID="input-item-cost"
                  />
                </View>
                <View style={styles.inputCell}>
                  <MoneyInput
                    label="Shipping you pay"
                    value={shippingCost}
                    onChangeText={setShippingCost}
                    placeholder="0.00"
                    theme={theme}
                    testID="input-shipping-cost"
                  />
                </View>
              </View>
            )}

            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [
                styles.resetButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              testID="button-reset"
            >
              <Feather name="rotate-ccw" size={14} color="#DC2626" />
              <Text style={[styles.resetText, { color: "#DC2626" }]}>
                Reset
              </Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: theme.colors.card, marginTop: 12 }]}>
            <Text style={[styles.sectionLabel, { color: theme.colors.mutedForeground }]}>
              BREAKDOWN
            </Text>

            <Row label="Sale price" value={fmt(result.sale)} theme={theme} />
            {result.shipCharged > 0 ? (
              <Row label="Shipping charged" value={fmt(result.shipCharged)} theme={theme} />
            ) : null}
            <Row
              label="Gross"
              value={fmt(result.gross)}
              theme={theme}
              bold
            />

            <View style={styles.divider} />

            {result.fees.platformFee > 0 ? (
              <Row
                label={`${marketplace.name} fee`}
                value={`-${fmt(result.fees.platformFee)}`}
                theme={theme}
                negative
              />
            ) : null}
            {result.fees.paymentFee > 0 ? (
              <Row
                label="Payment processing"
                value={`-${fmt(result.fees.paymentFee)}`}
                theme={theme}
                negative
              />
            ) : null}
            {result.fees.perOrderFee > 0 ? (
              <Row
                label="Per-order fee"
                value={`-${fmt(result.fees.perOrderFee)}`}
                theme={theme}
                negative
              />
            ) : null}
            <Row
              label="Net payout"
              value={fmt(result.netPayout)}
              theme={theme}
              bold
            />

            <View style={styles.divider} />

            {result.cost > 0 ? (
              <Row label="Item cost" value={`-${fmt(result.cost)}`} theme={theme} negative />
            ) : null}
            {result.shipPaid > 0 ? (
              <Row label="Shipping you pay" value={`-${fmt(result.shipPaid)}`} theme={theme} negative />
            ) : null}

            <View style={styles.profitRow}>
              <Text style={[styles.profitLabel, { color: theme.colors.foreground }]}>Profit</Text>
              <Text style={[styles.profitValue, { color: profitColor }]} testID="text-profit">
                {fmt(result.profit)}
              </Text>
            </View>

            {result.hasInputs ? (
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={[styles.metaPillLabel, { color: theme.colors.mutedForeground }]}>
                    Margin
                  </Text>
                  <Text style={[styles.metaPillValue, { color: theme.colors.foreground }]}>
                    {result.margin.toFixed(1)}%
                  </Text>
                </View>
                {result.cost > 0 ? (
                  <View style={styles.metaPill}>
                    <Text style={[styles.metaPillLabel, { color: theme.colors.mutedForeground }]}>
                      ROI
                    </Text>
                    <Text style={[styles.metaPillValue, { color: theme.colors.foreground }]}>
                      {result.roi.toFixed(1)}%
                    </Text>
                  </View>
                ) : null}
                <View style={styles.metaPill}>
                  <Text style={[styles.metaPillLabel, { color: theme.colors.mutedForeground }]}>
                    Total fees
                  </Text>
                  <Text style={[styles.metaPillValue, { color: theme.colors.foreground }]}>
                    {fmt(result.fees.totalFees)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.emptyHint, { color: theme.colors.mutedForeground }]}>
                Enter a sale price to see your profit.
              </Text>
            )}
          </View>

          <Text style={[styles.disclaimer, { color: theme.colors.mutedForeground }]}>
            Estimates only. Fees can vary by category, store subscription, seller level,
            and promoted-listing settings.
          </Text>
        </View>
      </Animated.ScrollView>

      <Modal
        visible={marketplacePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMarketplacePickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMarketplacePickerOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.colors.background, maxHeight: "75%" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>
                Select a marketplace
              </Text>
              <Pressable
                onPress={() => setMarketplacePickerOpen(false)}
                hitSlop={8}
                testID="button-close-marketplace-picker"
              >
                <Feather name="x" size={22} color={theme.colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {MARKETPLACES.map((m) => {
                const active = m.id === marketplace.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => {
                      handleSelectMarketplace(m.id);
                      setMarketplacePickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.marketplaceListRow,
                      {
                        backgroundColor: active
                          ? theme.colors.primary + "15"
                          : pressed
                          ? theme.colors.muted
                          : "transparent",
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                    testID={`marketplace-${m.id}`}
                  >
                    <View style={[styles.marketplaceDot, { backgroundColor: m.accent }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.marketplaceListName, { color: theme.colors.foreground }]}>
                        {m.name}
                      </Text>
                      <Text style={[styles.marketplaceListSub, { color: theme.colors.mutedForeground }]} numberOfLines={1}>
                        {m.feeNote}
                      </Text>
                    </View>
                    {active ? (
                      <Feather name="check" size={20} color={theme.colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={feeInfoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFeeInfoOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFeeInfoOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.colors.background }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Feather name="info" size={18} color={theme.colors.primary} />
              <Text style={[styles.modalTitle, { color: theme.colors.foreground }]}>
                {marketplace.name} fees
              </Text>
            </View>
            <Text style={[styles.modalSub, { color: theme.colors.mutedForeground }]}>
              {marketplace.feeNote}
            </Text>
            <Text style={[styles.modalSub, { color: theme.colors.mutedForeground, marginTop: 12 }]}>
              These are the most common public rates. Your actual fees may differ slightly based
              on category, store subscription, or seller level.
            </Text>
            <Pressable
              onPress={() => setFeeInfoOpen(false)}
              style={({ pressed }) => [
                styles.modalSaveButton,
                { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.modalSaveText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <KeyboardToolbar showArrows={false} doneText="Done" />
    </View>
  );
}

function MoneyInput({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  testID,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder: string;
  theme: any;
  testID?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={[styles.inputLabel, { color: theme.colors.foreground }]}>{label}</Text>
      <View style={[styles.inputWrap, { borderColor: "#047857" }]}>
        <Text style={[styles.dollarPrefix, { color: theme.colors.mutedForeground }]}>$</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.mutedForeground}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.colors.foreground }]}
          testID={testID}
          autoFocus={autoFocus}
          returnKeyType="done"
        />
      </View>
      {hint ? (
        <Text style={[styles.inputHint, { color: theme.colors.mutedForeground }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

function Row({
  label,
  value,
  theme,
  bold,
  negative,
}: {
  label: string;
  value: string;
  theme: any;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.rowLabel,
          { color: theme.colors.mutedForeground },
          bold && { color: theme.colors.foreground, fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.rowValue,
          { color: theme.colors.foreground },
          negative && { color: "#DC2626" },
          bold && { fontWeight: "800" },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  heroTopFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0A3622",
  },
  heroCard: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 8,
    color: "#FFFFFF",
  },
  heroDescription: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 18,
    lineHeight: 20,
  },
  marketplaceSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#047857",
  },
  marketplaceSelectLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#5C7568",
    marginBottom: 2,
  },
  marketplaceSelectName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0A3622",
  },
  marketplaceListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  marketplaceListName: {
    fontSize: 15,
    fontWeight: "700",
  },
  marketplaceListSub: {
    fontSize: 12,
    marginTop: 2,
  },
  marketplaceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  belowHero: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "#F3F4F6",
  },
  shippingNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 2,
  },
  shippingNoteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontStyle: "italic",
  },
  tierBlock: {
    marginTop: 12,
  },
  tinyLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  payerToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  payerToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  payerToggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  tierChipsRow: {
    gap: 8,
    paddingRight: 4,
  },
  tierChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 86,
    alignItems: "center",
  },
  tierChipLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  tierChipCost: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#047857",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  cardSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoBtn: {
    padding: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputBlock: {
    marginBottom: 12,
  },
  inputsRow: {
    flexDirection: "row",
    gap: 10,
  },
  inputCell: {
    flex: 1,
    minWidth: 0,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  dollarPrefix: {
    fontSize: 16,
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  inputHint: {
    fontSize: 11,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginVertical: 10,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 12,
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  resetText: {
    fontSize: 12,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowLabel: {
    fontSize: 14,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  profitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "rgba(4,120,87,0.06)",
    marginTop: 10,
  },
  profitLabel: {
    fontSize: 16,
    fontWeight: "800",
  },
  profitValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  metaPillLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  metaPillValue: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalSub: {
    fontSize: 13,
    lineHeight: 19,
  },
  modalSaveButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalSaveText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
