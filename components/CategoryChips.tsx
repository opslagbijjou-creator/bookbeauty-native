import React from "react";
import { ScrollView, Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/ui";

type CategoryChipsProps = {
  items: string[];
  active?: string;
  onChange?: (value: string) => void;
  selectedItems?: string[];
  onToggle?: (value: string) => void;
  multi?: boolean;
  style?: ViewStyle;
  iconMap?: Record<string, keyof typeof Ionicons.glyphMap>;
};

export default function CategoryChips({
  items,
  active,
  onChange,
  selectedItems,
  onToggle,
  multi,
  style,
  iconMap,
}: CategoryChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={[styles.row, style]}
    >
      {items.map((item) => {
        const selected = multi ? Boolean(selectedItems?.includes(item)) : item === active;
        const icon = iconMap?.[item];
        return (
          <Pressable
            key={item}
            onPress={() => {
              if (multi) {
                onToggle?.(item);
                return;
              }
              onChange?.(item);
            }}
            style={({ pressed }) => [styles.chip, selected && styles.chipActive, pressed && styles.chipPressed]}
          >
            {icon ? (
              <Ionicons
                name={icon}
                size={14}
                color={selected ? "#fff" : COLORS.primary}
                style={styles.icon}
              />
            ) : null}
            <Text style={[styles.text, selected && styles.textActive]}>{item}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    gap: 10,
    paddingVertical: 4,
    alignItems: "center",
  },
  chip: {
    minHeight: 44,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#182330",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  chipActive: {
    backgroundColor: COLORS.accentSoft,
    borderColor: "rgba(215,138,169,0.25)",
  },
  chipPressed: {
    transform: [{ scale: 0.98 }],
  },
  icon: {
    marginRight: 6,
  },
  text: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  textActive: {
    color: COLORS.text,
  },
});
