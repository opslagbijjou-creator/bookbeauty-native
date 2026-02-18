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
            style={[styles.chip, selected && styles.chipActive]}
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
    gap: 8,
    paddingVertical: 2,
    alignItems: "center",
  },
  chip: {
    minHeight: 34,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  textActive: {
    color: "#fff",
  },
});
