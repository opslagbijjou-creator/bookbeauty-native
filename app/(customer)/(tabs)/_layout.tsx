// FILE: app/(customer)/(tabs)/_layout.tsx
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 86,
          paddingTop: 10,
          paddingBottom: 18,
          borderTopWidth: 0,
          backgroundColor: "#F4D7E3", // soft roze
        },
        tabBarActiveTintColor: "#1A1A1A",
        tabBarInactiveTintColor: "rgba(0,0,0,0.45)",
        tabBarLabelStyle: { fontWeight: "900", fontSize: 12 },
      }}
    >
      {/* Profiel */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profiel",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size ?? 24} color={color} />
          ),
        }}
      />

      {/* Boeken (Home) */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Boeken",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={size ?? 24}
              color={color}
            />
          ),
        }}
      />

      {/* Discover */}
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "compass" : "compass-outline"}
              size={size ?? 24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}