import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS, RADII } from "../../constants/theme";

type ToastProps = {
  message: string;
  tone?: "default" | "success" | "danger";
};

export default function Toast({ message, tone = "default" }: ToastProps) {
  return (
    <View
      style={[
        styles.base,
        tone === "success" && styles.success,
        tone === "danger" && styles.danger,
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADII.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
  },
  success: {
    backgroundColor: "rgba(21,115,71,0.08)",
  },
  danger: {
    backgroundColor: "rgba(194,65,100,0.08)",
  },
  text: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
});
