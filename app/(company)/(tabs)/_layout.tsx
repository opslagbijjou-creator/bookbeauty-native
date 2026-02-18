import React from "react";
import { Tabs } from "expo-router";
import FloatingCenterTabBar, { TabVisualConfig } from "../../../components/FloatingCenterTabBar";

const companyTabConfig: TabVisualConfig = {
  home: { label: "Profiel", activeIcon: "business", inactiveIcon: "business-outline" },
  services: { label: "Diensten", activeIcon: "cut", inactiveIcon: "cut-outline" },
  feed: { label: "Feed", activeIcon: "play", inactiveIcon: "play-outline" },
  studio: { label: "Upload", activeIcon: "add-circle", inactiveIcon: "add-circle-outline" },
  bookings: { label: "Agenda", activeIcon: "calendar", inactiveIcon: "calendar-outline" },
};

export default function CompanyTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <FloatingCenterTabBar
          {...props}
          centerRouteName="feed"
          leftRouteNames={["home", "services"]}
          rightRouteNames={["studio", "bookings"]}
          config={companyTabConfig}
        />
      )}
    >
      <Tabs.Screen name="home" options={{ title: "Profiel" }} />
      <Tabs.Screen name="services" options={{ title: "Diensten" }} />
      <Tabs.Screen name="feed" options={{ title: "Feed" }} />
      <Tabs.Screen name="studio" options={{ title: "Upload" }} />
      <Tabs.Screen name="bookings" options={{ title: "Agenda" }} />
    </Tabs>
  );
}
