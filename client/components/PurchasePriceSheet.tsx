import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDesignTokens } from "@/hooks/useDesignTokens";
import { INVENTORY_NAME_MAX_LENGTH } from "@/lib/storage";

export type PurchasePriceSheetContentProps = {
  thumbnailUri?: string | null;
  displayTitle: string;
  marketAverageLabel?: string | null;
  name: string;
  onNameChange: (value: string) => void;
  price: string;
  onPriceChange: (value: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  nameMaxLength?: number;
  showSavingSpinner?: boolean;
  nameInputTestID?: string;
  priceInputTestID?: string;
  cancelButtonTestID?: string;
  saveButtonTestID?: string;
};

export function PurchasePriceSheetContent({
  thumbnailUri,
  displayTitle,
  marketAverageLabel,
  name,
  onNameChange,
  price,
  onPriceChange,
  saving,
  onCancel,
  onSave,
  saveLabel = "Add to Inventory",
  nameMaxLength = INVENTORY_NAME_MAX_LENGTH,
  showSavingSpinner = true,
  nameInputTestID = "input-product-name",
  priceInputTestID = "input-purchase-price",
  cancelButtonTestID = "button-cancel-price-prompt",
  saveButtonTestID = "button-save-price-prompt",
}: PurchasePriceSheetContentProps) {
  const { theme } = useDesignTokens();
  const trimmedName = name.trim();
  const trimmedPrice = price.trim();
  const saveDisabled = saving || !trimmedName || !trimmedPrice;
  const trimmedMarketAverage =
    typeof marketAverageLabel === "string" ? marketAverageLabel.trim() : "";
  const showMarketAverage = trimmedMarketAverage.length > 0;

  return (
    <View>
      <View style={[styles.selectedRow, { borderColor: "#E5E7EB" }]}>
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.thumb}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Feather name="package" size={20} color="#9CA3AF" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.selectedTitle, { color: theme.colors.foreground }]}
            numberOfLines={2}
          >
            {trimmedName || displayTitle}
          </Text>
          {showMarketAverage ? (
            <Text
              style={[
                styles.selectedHint,
                { color: theme.colors.mutedForeground },
              ]}
            >
              Market avg: {trimmedMarketAverage}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.label, { color: theme.colors.foreground }]}>
        Product name
      </Text>
      <TextInput
        value={name}
        onChangeText={onNameChange}
        placeholder="Name this item"
        placeholderTextColor={theme.colors.mutedForeground}
        maxLength={nameMaxLength}
        style={[
          styles.input,
          { color: theme.colors.foreground, borderColor: "#E5E7EB" },
        ]}
        testID={nameInputTestID}
      />

      <Text style={[styles.label, { color: theme.colors.foreground }]}>
        Purchase price
      </Text>
      <TextInput
        value={price}
        onChangeText={onPriceChange}
        placeholder="0.00"
        placeholderTextColor={theme.colors.mutedForeground}
        keyboardType="decimal-pad"
        style={[
          styles.input,
          { color: theme.colors.foreground, borderColor: "#E5E7EB" },
        ]}
        testID={priceInputTestID}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            styles.cancelButton,
            { opacity: pressed ? 0.7 : 1, borderColor: "#E5E7EB" },
          ]}
          testID={cancelButtonTestID}
        >
          <Text
            style={[styles.cancelText, { color: theme.colors.foreground }]}
          >
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saveDisabled}
          style={({ pressed }) => [
            styles.saveButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: saveDisabled ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
          testID={saveButtonTestID}
        >
          {saving && showSavingSpinner ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>{saveLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export type PurchasePriceSheetProps = PurchasePriceSheetContentProps & {
  visible: boolean;
  onClose: () => void;
  headerTitle?: string;
  headerSubtitle?: string;
};

export function PurchasePriceSheet({
  visible,
  onClose,
  headerTitle = "Set Purchase Price",
  headerSubtitle = "Enter what you actually paid for this item.",
  ...contentProps
}: PurchasePriceSheetProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useDesignTokens();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.background,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.title, { color: theme.colors.foreground }]}
              >
                {headerTitle}
              </Text>
              <Text
                style={[styles.sub, { color: theme.colors.mutedForeground }]}
              >
                {headerSubtitle}
              </Text>
            </View>
          </View>

          <PurchasePriceSheetContent {...contentProps} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    marginBottom: 4,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  thumbFallback: {
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  selectedHint: {
    fontSize: 12,
    marginTop: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
