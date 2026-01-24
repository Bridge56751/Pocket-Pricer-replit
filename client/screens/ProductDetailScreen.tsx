import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, TextInput, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, RouteProp, useNavigation } from "@react-navigation/native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ProfitBadge } from "@/components/ProfitBadge";
import { ProfitBreakdown } from "@/components/ProfitBreakdown";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";
import { addFavorite, removeFavorite, isFavorite, getUserSettings } from "@/lib/storage";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { UserSettings } from "@/types/product";

type ProductDetailRouteProp = RouteProp<RootStackParamList, "ProductDetail">;

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<ProductDetailRouteProp>();
  const navigation = useNavigation();

  const { product } = route.params;

  const [isFav, setIsFav] = useState(false);
  const [userCost, setUserCost] = useState("0");
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    checkFavorite();
    loadSettings();
  }, []);

  const checkFavorite = async () => {
    const fav = await isFavorite(product.id);
    setIsFav(fav);
  };

  const loadSettings = async () => {
    const data = await getUserSettings();
    setSettings(data);
    setUserCost(data.defaultCost.toString());
  };

  const toggleFavorite = async () => {
    if (isFav) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await removeFavorite(product.id);
      setIsFav(false);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await addFavorite({
        id: product.id,
        product,
        savedAt: new Date().toISOString(),
      });
      setIsFav(true);
    }
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={toggleFavorite}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          hitSlop={8}
        >
          <Feather
            name={isFav ? "star" : "star"}
            size={24}
            color={isFav ? "#FBBF24" : theme.textSecondary}
            style={{ marginRight: Spacing.md }}
          />
        </Pressable>
      ),
    });
  }, [isFav, navigation, theme]);

  const netProfit = product.currentPrice - parseFloat(userCost || "0") - product.ebayFees - product.avgShipping;
  const isProfitable = netProfit > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
        },
      ]}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.detailsContainer}>
        <ThemedText style={styles.title}>{product.title}</ThemedText>

        <View style={styles.priceRow}>
          <View>
            <ThemedText style={[styles.priceLabel, { color: theme.textSecondary }]}>
              Selling For
            </ThemedText>
            <ThemedText style={styles.price}>${product.currentPrice.toFixed(2)}</ThemedText>
          </View>
          <ProfitBadge profit={netProfit} size="large" />
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statItem, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="shopping-bag" size={16} color={theme.primary} />
            <ThemedText style={[styles.statValue, { color: theme.text }]}>
              {product.soldCount}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Sold
            </ThemedText>
          </View>
          <View style={[styles.statItem, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="tag" size={16} color={theme.primary} />
            <ThemedText style={[styles.statValue, { color: theme.text }]}>
              {product.category}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Category
            </ThemedText>
          </View>
          <View style={[styles.statItem, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="box" size={16} color={theme.primary} />
            <ThemedText style={[styles.statValue, { color: theme.text }]}>
              {product.condition}
            </ThemedText>
            <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
              Condition
            </ThemedText>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <View style={[styles.costInputSection, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText style={styles.sectionTitle}>Your Cost</ThemedText>
          <View style={styles.costInputRow}>
            <ThemedText style={styles.dollarSign}>$</ThemedText>
            <TextInput
              style={[styles.costInput, { color: theme.text }]}
              value={userCost}
              onChangeText={setUserCost}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.textSecondary}
              testID="input-user-cost"
            />
          </View>
          <ThemedText style={[styles.costHint, { color: theme.textSecondary }]}>
            Enter what you would pay for this item
          </ThemedText>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)}>
        <ProfitBreakdown product={product} userCost={parseFloat(userCost) || 0} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(400).duration(400)}>
        <Button
          onPress={toggleFavorite}
          style={[
            styles.actionButton,
            {
              backgroundColor: isFav ? theme.backgroundDefault : theme.primary,
            },
          ]}
        >
          {isFav ? "Remove from Favorites" : "Save to Favorites"}
        </Button>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  detailsContainer: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
    marginBottom: Spacing.lg,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: Spacing.lg,
  },
  priceLabel: {
    fontSize: 14,
    marginBottom: Spacing.xs,
  },
  price: {
    fontSize: 36,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.xs,
    marginHorizontal: Spacing.xs,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: Spacing.xs,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  costInputSection: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  costInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dollarSign: {
    fontSize: 32,
    fontWeight: "700",
    marginRight: Spacing.sm,
  },
  costInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: "700",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
    }),
  },
  costHint: {
    fontSize: 12,
    marginTop: Spacing.sm,
  },
  actionButton: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
});
