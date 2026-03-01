import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { COLORS, RADII } from "../../constants/theme";

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export default function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.base, active && styles.active, pressed && styles.pressed]}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  active: {
    backgroundColor: COLORS.accentSoft,
    borderColor: "rgba(215,138,169,0.28)",
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  labelActive: {
    color: COLORS.text,
  },
});
