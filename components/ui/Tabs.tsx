import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { COLORS, RADII } from "../../constants/theme";

type TabsProps = {
  items: string[];
  active: string;
  onChange: (value: string) => void;
};

export default function Tabs({ items, active, onChange }: TabsProps) {
  return (
    <View style={styles.row}>
      {items.map((item) => {
        const selected = item === active;
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            style={({ pressed }) => [styles.tab, selected && styles.tabActive, pressed && styles.pressed]}
          >
            <Text style={[styles.label, selected && styles.labelActive]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tab: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: COLORS.primary,
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
    color: "#ffffff",
  },
});
