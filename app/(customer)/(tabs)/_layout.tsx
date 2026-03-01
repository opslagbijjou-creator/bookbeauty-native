import React from "react";
import { Tabs } from "expo-router";
import FloatingCenterTabBar, { TabVisualConfig } from "../../../components/FloatingCenterTabBar";

const customerTabConfig: TabVisualConfig = {
  index: { label: "Ontdek", activeIcon: "search", inactiveIcon: "search-outline" },
  feed: { label: "Feed", activeIcon: "play", inactiveIcon: "play-outline" },
  bookings: { label: "Boekingen", activeIcon: "calendar", inactiveIcon: "calendar-outline" },
  profile: { label: "Profiel", activeIcon: "person", inactiveIcon: "person-outline" },
};

export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <FloatingCenterTabBar
          {...props}
          centerRouteName="feed"
          leftRouteNames={["index"]}
          rightRouteNames={["bookings", "profile"]}
          config={customerTabConfig}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: "Ontdek" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="bookings" options={{ title: "Boekingen" }} />
      <Tabs.Screen name="profile" options={{ title: "Profiel" }} />
    </Tabs>
  );
}
