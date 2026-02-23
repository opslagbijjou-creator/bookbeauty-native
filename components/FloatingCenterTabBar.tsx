import React, { useEffect, useMemo, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../lib/ui";

type IconName = keyof typeof Ionicons.glyphMap;

export type TabVisualConfig = Record<
  string,
  {
    label: string;
    activeIcon: IconName;
    inactiveIcon: IconName;
  }
>;

type FloatingCenterTabBarProps = BottomTabBarProps & {
  centerRouteName: string;
  leftRouteNames: string[];
  rightRouteNames: string[];
  config: TabVisualConfig;
};

function getRouteIndex(routes: BottomTabBarProps["state"]["routes"], routeName: string): number {
  return routes.findIndex((route) => route.name === routeName);
}

function uniqueRouteOrder(routeNames: string[]): string[] {
  return routeNames.filter((name, index) => routeNames.indexOf(name) === index);
}

export default function FloatingCenterTabBar({
  state,
  descriptors,
  navigation,
  insets,
  centerRouteName,
  leftRouteNames,
  rightRouteNames,
  config,
}: FloatingCenterTabBarProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const bottomPadding = Math.max(insets.bottom, 10);
  const topPadding = 6;
  const barHeight = 84 + bottomPadding + topPadding;
  const routeOrder = useMemo(
    () => uniqueRouteOrder([...leftRouteNames, centerRouteName, ...rightRouteNames]),
    [leftRouteNames, centerRouteName, rightRouteNames]
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function onPressRoute(routeName: string) {
    const routeIndex = getRouteIndex(state.routes, routeName);
    if (routeIndex < 0) return;
    const route = state.routes[routeIndex];
    const isFocused = state.index === routeIndex;

    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  }

  function onLongPressRoute(routeName: string) {
    const routeIndex = getRouteIndex(state.routes, routeName);
    if (routeIndex < 0) return;
    const route = state.routes[routeIndex];
    navigation.emit({
      type: "tabLongPress",
      target: route.key,
    });
  }

  if (keyboardVisible) {
    return <View style={{ height: bottomPadding }} />;
  }

  return (
    <View style={[styles.container, { height: barHeight, paddingBottom: bottomPadding, paddingTop: topPadding }]}>
      <View style={styles.row}>
        {routeOrder.map((routeName) => {
          const routeIndex = getRouteIndex(state.routes, routeName);
          if (routeIndex < 0) return <View key={`missing-${routeName}`} style={styles.item} />;

          const route = state.routes[routeIndex];
          const focused = state.index === routeIndex;
          const isCenter = route.name === centerRouteName;
          const routeConfig = config[route.name];
          const options = descriptors[route.key]?.options;
          const label = routeConfig?.label ?? (typeof options?.title === "string" ? options.title : route.name);
          const iconName = focused ? routeConfig?.activeIcon : routeConfig?.inactiveIcon;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => onPressRoute(route.name)}
              onLongPress={() => onLongPressRoute(route.name)}
              style={[
                styles.item,
                isCenter && styles.centerItem,
                focused && !isCenter && styles.itemActive,
                focused && isCenter && styles.centerItemActive,
              ]}
            >
              {isCenter ? (
                <LinearGradient
                  colors={focused ? ["#ff6fb3", "#d94490"] : ["#f0dbe6", "#ebcadb"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.centerIconCircle}
                >
                  <Ionicons
                    name={iconName ?? "ellipse-outline"}
                    size={18}
                    color={focused ? "#fff" : COLORS.primary}
                  />
                </LinearGradient>
              ) : (
                <Ionicons name={iconName ?? "ellipse-outline"} size={20} color={focused ? COLORS.primary : COLORS.muted} />
              )}
              <Text style={[styles.label, focused && styles.labelActive, isCenter && styles.centerLabel]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  item: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  itemActive: {
    backgroundColor: "#fff7fb",
    borderWidth: 1,
    borderColor: "#f3d3e3",
  },
  centerItem: {
    backgroundColor: "#fff4f9",
    borderWidth: 1,
    borderColor: "#efccdd",
  },
  centerItemActive: {
    backgroundColor: "#ffeef7",
    borderColor: "#eab3cf",
  },
  centerIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 10,
  },
  centerLabel: {
    color: COLORS.primary,
    fontWeight: "900",
    fontSize: 11,
  },
  labelActive: {
    color: COLORS.primary,
  },
});
