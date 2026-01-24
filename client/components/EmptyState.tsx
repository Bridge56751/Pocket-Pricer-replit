import React from "react";
import { View, StyleSheet, Image, ImageSourcePropType, Text } from "react-native";
import { useDesignTokens } from "@/hooks/useDesignTokens";

interface EmptyStateProps {
  image?: ImageSourcePropType;
  title: string;
  message: string;
}

export function EmptyState({ image, title, message }: EmptyStateProps) {
  const { theme } = useDesignTokens();

  return (
    <View style={styles.container}>
      {image ? (
        <Image source={image} style={styles.image} resizeMode="contain" />
      ) : null}
      <Text style={[styles.title, { color: theme.colors.foreground }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.colors.mutedForeground }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  image: {
    width: 120,
    height: 120,
    marginBottom: 20,
    opacity: 0.8,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
