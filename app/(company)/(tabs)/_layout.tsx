import React, { useEffect, useMemo, useState } from "react";
import { Tabs } from "expo-router";
import FloatingCenterTabBar, { TabVisualConfig } from "../../../components/FloatingCenterTabBar";
import { getUserRole } from "../../../lib/authRepo";
import { auth } from "../../../lib/firebase";
import type { AppRole } from "../../../lib/roles";

const companyTabConfig: TabVisualConfig = {
  home: { label: "Profiel", activeIcon: "business", inactiveIcon: "business-outline" },
  services: { label: "Diensten", activeIcon: "cut", inactiveIcon: "cut-outline" },
  feed: { label: "Feed", activeIcon: "play", inactiveIcon: "play-outline" },
  studio: { label: "Upload", activeIcon: "add-circle", inactiveIcon: "add-circle-outline" },
  bookings: { label: "Agenda", activeIcon: "calendar", inactiveIcon: "calendar-outline" },
};

const employeeTabConfig: TabVisualConfig = {
  home: { label: "Account", activeIcon: "person", inactiveIcon: "person-outline" },
  bookings: { label: "Agenda", activeIcon: "calendar", inactiveIcon: "calendar-outline" },
};

export default function CompanyTabsLayout() {
  const [role, setRole] = useState<AppRole>("company");

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getUserRole(uid)
      .then((nextRole) => {
        if (nextRole) setRole(nextRole);
      })
      .catch(() => null);
  }, []);

  const isEmployee = role === "employee";
  const tabConfig = useMemo(() => (isEmployee ? employeeTabConfig : companyTabConfig), [isEmployee]);
  const centerRouteName = isEmployee ? "bookings" : "feed";
  const leftRouteNames = isEmployee ? ["home"] : ["home", "services"];
  const rightRouteNames = isEmployee ? [] : ["studio", "bookings"];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
      }}
      tabBar={(props) => (
        <FloatingCenterTabBar
          {...props}
          centerRouteName={centerRouteName}
          leftRouteNames={leftRouteNames}
          rightRouteNames={rightRouteNames}
          config={tabConfig}
        />
      )}
    >
      <Tabs.Screen name="home" options={{ title: isEmployee ? "Account" : "Profiel" }} />
      <Tabs.Screen name="services" options={isEmployee ? { href: null } : { title: "Diensten" }} />
      <Tabs.Screen name="feed" options={isEmployee ? { href: null } : { title: "Feed" }} />
      <Tabs.Screen name="studio" options={isEmployee ? { href: null } : { title: "Upload" }} />
      <Tabs.Screen name="bookings" options={{ title: "Agenda" }} />
    </Tabs>
  );
}
