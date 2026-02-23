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
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          height: 66,
        },
        tabBarIcon: ({ color, size }) => {
          const active = color === COLORS.primary;
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            index: active ? "speedometer" : "speedometer-outline",
            companies: active ? "business" : "business-outline",
            support: active ? "chatbubbles" : "chatbubbles-outline",
            profile: active ? "sparkles" : "sparkles-outline",
          };
          return <Ionicons name={map[route.name] ?? "ellipse-outline"} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="companies" options={{ title: "Bedrijven" }} />
      <Tabs.Screen name="support" options={{ title: "Vragen" }} />
      <Tabs.Screen name="profile" options={{ title: "Profiel" }} />
    </Tabs>
  );
}
