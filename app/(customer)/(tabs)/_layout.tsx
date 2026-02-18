import React from "react";
import { Tabs } from "expo-router";
import FloatingCenterTabBar, { TabVisualConfig } from "../../../components/FloatingCenterTabBar";

const customerTabConfig: TabVisualConfig = {
  index: { label: "Discover", activeIcon: "search", inactiveIcon: "search-outline" },
  feed: { label: "Feed", activeIcon: "play", inactiveIcon: "play-outline" },
  bookings: { label: "Bookings", activeIcon: "calendar", inactiveIcon: "calendar-outline" },
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
      <Tabs.Screen name="index" options={{ title: "Discover" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings" }} />
      <Tabs.Screen name="profile" options={{ title: "Profiel" }} />
    </Tabs>
  );
}
