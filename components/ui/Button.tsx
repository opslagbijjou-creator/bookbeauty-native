import React from "react";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { COLORS, RADII } from "../../constants/theme";

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "destructive";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  style,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDestructive = variant === "destructive";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary && styles.primary,
        !isPrimary && !isDestructive && styles.secondary,
        isDestructive && styles.destructive,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          isPrimary && styles.labelPrimary,
          !isPrimary && !isDestructive && styles.labelSecondary,
          isDestructive && styles.labelDestructive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: RADII.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  primary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: "#ffffff",
    borderColor: COLORS.border,
  },
  destructive: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(194,65,100,0.2)",
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 13,
    fontWeight: "800",
  },
  labelPrimary: {
    color: "#ffffff",
  },
  labelSecondary: {
    color: COLORS.text,
  },
  labelDestructive: {
    color: COLORS.danger,
  },
});
