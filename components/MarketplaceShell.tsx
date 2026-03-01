import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { subscribeAuth } from "../lib/authRepo";
import { COLORS } from "../lib/ui";
import { getDefaultCityPath } from "../lib/marketplace";

type MarketplaceShellProps = {
  active?: "home" | "discover" | "feed";
  children: React.ReactNode;
  scroll?: boolean;
  fullBleed?: boolean;
};

type MenuItem = {
  key: string;
  label: string;
  href: string;
};

export default function MarketplaceShell({
  children,
  active,
  scroll = true,
  fullBleed = false,
}: MarketplaceShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const compact = width < 768;
  const wide = width >= 1080;

  useEffect(() => {
    return subscribeAuth((user) => {
      setHasSession(Boolean(user?.uid));
    });
  }, []);

  const menuItems = useMemo<MenuItem[]>(
    () => [
      { key: "home", label: "Home", href: "/" },
      { key: "discover", label: "Ontdek salons", href: "/discover" },
      { key: "feed", label: "Feed", href: "/feed" },
      { key: "register", label: "Meld je salon aan", href: "/(auth)/register" },
      hasSession
        ? { key: "account", label: "Mijn account", href: "/account" }
        : { key: "login", label: "Inloggen", href: "/(auth)/login" },
    ],
    [hasSession]
  );

  function openRoute(href: string) {
    setMenuOpen(false);
    router.push(href as never);
  }

  const content = (
    <View
      style={[
        styles.content,
        compact && styles.contentCompact,
        wide && styles.contentWide,
        fullBleed && styles.contentFullBleed,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.screen}>
        <View style={[styles.topBar, compact && styles.topBarCompact]}>
          <View style={[styles.topBarRow, compact && styles.topBarRowCompact, wide && styles.topBarRowWide]}>
            <Pressable onPress={() => router.push("/" as never)} style={styles.logoWrap}>
              <Image
                source={require("../assets/logo/logo.png")}
                style={[styles.logo, compact && styles.logoCompact, wide && styles.logoWide]}
                contentFit="contain"
              />
            </Pressable>

            <Pressable
              onPress={() => router.push("/discover" as never)}
              style={({ pressed }) => [
                styles.searchDock,
                compact && styles.searchDockCompact,
                wide && styles.searchDockWide,
                pressed && styles.searchDockPressed,
              ]}
            >
              <Ionicons name="search" size={16} color={COLORS.muted} />
              <Text style={[styles.searchDockText, compact && styles.searchDockTextCompact]}>
                {compact ? "Zoek salon" : "Zoek salon of stad"}
              </Text>
            </Pressable>

            <Pressable onPress={() => setMenuOpen(true)} style={[styles.sideButton, compact && styles.sideButtonCompact]}>
              <Ionicons name="menu-outline" size={24} color={COLORS.text} />
            </Pressable>
          </View>
        </View>

        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{content}</View>
        )}

        <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
          <View style={styles.menuRoot}>
            <View style={[styles.menuPanel, compact && styles.menuPanelCompact]}>
              <Text style={styles.menuKicker}>Navigatie</Text>
              <Text style={styles.menuTitle}>BookBeauty marketplace</Text>

              <View style={styles.menuList}>
                {menuItems.map((item) => {
                  const selected = item.key === active;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => openRoute(item.href)}
                      style={[styles.menuItem, selected && styles.menuItemActive]}
                    >
                      <Text style={[styles.menuItemText, selected && styles.menuItemTextActive]}>
                        {item.label}
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={16}
                        color={selected ? COLORS.primary : COLORS.muted}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.menuFooter}>
                <Pressable onPress={() => openRoute(getDefaultCityPath())} style={styles.primaryCta}>
                  <Text style={styles.primaryCtaText}>Start met zoeken</Text>
                </Pressable>
              </View>
            </View>
            <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  topBar: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(232,225,215,0.9)",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  topBarCompact: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
  },
  topBarRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
  },
  topBarRowCompact: {
    minHeight: 48,
    gap: 8,
  },
  topBarRowWide: {
    maxWidth: 1380,
  },
  sideButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,35,48,0.04)",
  },
  sideButtonCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  logoWrap: {
    minHeight: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  logo: {
    width: 130,
    height: 28,
  },
  logoCompact: {
    width: 108,
    height: 24,
  },
  logoWide: {
    width: 142,
    height: 30,
  },
  searchDock: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: "rgba(23,35,48,0.04)",
    borderWidth: 1,
    borderColor: "rgba(232,225,215,0.9)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    shadowColor: "#172330",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  searchDockCompact: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 12,
    gap: 6,
  },
  searchDockWide: {
    maxWidth: 820,
  },
  searchDockPressed: {
    transform: [{ scale: 0.99 }],
  },
  searchDockText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  searchDockTextCompact: {
    fontSize: 13,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 28,
  },
  contentCompact: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 20,
  },
  contentWide: {
    maxWidth: 1380,
    paddingHorizontal: 28,
  },
  contentFullBleed: {
    maxWidth: undefined,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  menuRoot: {
    flex: 1,
    flexDirection: "row-reverse",
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12,20,31,0.38)",
  },
  menuPanel: {
    width: 320,
    maxWidth: "86%",
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 28,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  menuPanelCompact: {
    width: 296,
    maxWidth: "92%",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
  },
  menuKicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  menuTitle: {
    color: COLORS.text,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "900",
    marginTop: 8,
  },
  menuList: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  menuItem: {
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: COLORS.surface,
  },
  menuItemText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  menuItemTextActive: {
    color: COLORS.primary,
  },
  menuFooter: {
    marginTop: 22,
  },
  primaryCta: {
    minHeight: 50,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
});
