import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../../lib/ui";

export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontWeight: "700", fontSize: 12 },
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          height: 66,
        },
        tabBarIcon: ({ color, size }) => {
          const active = color === COLORS.primary;
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            index: active ? "shield-checkmark" : "shield-checkmark-outline",
          };
          return <Ionicons name={map[route.name] ?? "ellipse-outline"} color={color} size={size} />;
        },
      })}
    />
  );
}
