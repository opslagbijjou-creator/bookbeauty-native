import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Container from "./ui/Container";
import Drawer from "./ui/Drawer";
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
  icon: keyof typeof Ionicons.glyphMap;
};

export default function MarketplaceShell({
  children,
  active,
  scroll = true,
  fullBleed = false,
}: MarketplaceShellProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    return subscribeAuth((user) => {
      setHasSession(Boolean(user?.uid));
    });
  }, []);

  const primaryNav = useMemo<MenuItem[]>(
    () => [
      { key: "home", label: "Home", href: "/", icon: "home-outline" },
      { key: "discover", label: "Ontdek", href: "/discover", icon: "search-outline" },
      { key: "feed", label: "Feed", href: "/feed", icon: "play-outline" },
      { key: "register", label: "Aanmelden salon", href: "/(auth)/register", icon: "storefront-outline" },
      { key: "support", label: "Support", href: "/support", icon: "help-circle-outline" },
    ],
    []
  );

  function openRoute(href: string) {
    setMenuOpen(false);
    router.push(href as never);
  }

  const contentNode = (
    <Container
      fullBleed={fullBleed}
      style={desktop ? styles.desktopContent : styles.mobileContent}
      desktopPadding={28}
      mobilePadding={12}
    >
      {children}
    </Container>
  );

  if (desktop) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.screen}>
          <View style={styles.desktopShell}>
            <View style={styles.sidebarColumn}>
              <View style={styles.sidebarSticky}>
                <Pressable onPress={() => openRoute("/")} style={styles.sidebarBrand}>
                  <Image
                    source={require("../assets/logo/logo.png")}
                    style={styles.sidebarLogo}
                    contentFit="contain"
                  />
                </Pressable>

                <Text style={styles.sidebarKicker}>BookBeauty marketplace</Text>

                <View style={styles.sidebarNav}>
                  {primaryNav.map((item) => {
                    const selected = item.key === active;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => openRoute(item.href)}
                        style={({ pressed }) => [
                          styles.sidebarItem,
                          selected && styles.sidebarItemActive,
                          pressed && styles.sidebarItemPressed,
                        ]}
                      >
                        <Ionicons
                          name={item.icon}
                          size={18}
                          color={selected ? "#ffffff" : COLORS.muted}
                        />
                        <Text
                          style={[
                            styles.sidebarItemText,
                            selected && styles.sidebarItemTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.sidebarFooter}>
                  <Pressable onPress={() => openRoute(getDefaultCityPath())} style={styles.sidebarPrimaryCta}>
                    <Text style={styles.sidebarPrimaryCtaText}>Start met zoeken</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openRoute(hasSession ? "/account" : "/(auth)/login")}
                    style={styles.sidebarSecondaryCta}
                  >
                    <Text style={styles.sidebarSecondaryCtaText}>
                      {hasSession ? "Mijn account" : "Inloggen"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.mainColumn}>
              <View style={styles.desktopTopBar}>
                <Container desktopPadding={28}>
                  <View style={styles.desktopTopBarRow}>
                    <Pressable
                      onPress={() => openRoute("/discover")}
                      style={({ pressed }) => [
                        styles.searchDock,
                        styles.searchDockDesktop,
                        pressed && styles.searchDockPressed,
                      ]}
                    >
                      <Ionicons name="search" size={17} color={COLORS.muted} />
                      <Text style={styles.searchDockText}>Zoek salon, stad of behandeling</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => openRoute(hasSession ? "/account" : "/(auth)/login")}
                      style={styles.accountButton}
                    >
                      <Ionicons name={hasSession ? "person" : "person-outline"} size={18} color={COLORS.text} />
                    </Pressable>
                  </View>
                </Container>
              </View>

              {scroll ? (
                <ScrollView
                  style={styles.flex}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {contentNode}
                </ScrollView>
              ) : (
                <View style={styles.flex}>{contentNode}</View>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.screen}>
        <View style={styles.mobileTopBar}>
          <Container mobilePadding={12}>
            <View style={styles.mobileTopBarRow}>
              <Pressable onPress={() => openRoute("/")} style={styles.mobileLogoWrap}>
                <Image
                  source={require("../assets/logo/logo.png")}
                  style={styles.mobileLogo}
                  contentFit="contain"
                />
              </Pressable>

              <Pressable
                onPress={() => openRoute("/discover")}
                style={({ pressed }) => [
                  styles.searchDock,
                  styles.searchDockMobile,
                  pressed && styles.searchDockPressed,
                ]}
              >
                <Ionicons name="search" size={18} color={COLORS.muted} />
                <Text style={[styles.searchDockText, styles.searchDockTextMobile]}>Zoek salon</Text>
              </Pressable>

              <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton}>
                <Ionicons name="menu-outline" size={24} color={COLORS.text} />
              </Pressable>
            </View>
          </Container>
        </View>

        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {contentNode}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{contentNode}</View>
        )}

        <Drawer visible={menuOpen} onClose={() => setMenuOpen(false)}>
          <View style={styles.drawerContent}>
            <Text style={styles.drawerKicker}>Navigatie</Text>
            <Text style={styles.drawerTitle}>BookBeauty</Text>

            <View style={styles.drawerList}>
              {primaryNav.map((item) => {
                const selected = item.key === active;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => openRoute(item.href)}
                    style={[styles.drawerItem, selected && styles.drawerItemActive]}
                  >
                    <View style={styles.drawerItemLeft}>
                      <Ionicons
                        name={item.icon}
                        size={17}
                        color={selected ? COLORS.text : COLORS.muted}
                      />
                      <Text
                        style={[
                          styles.drawerItemText,
                          selected && styles.drawerItemTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                    <Ionicons name="arrow-forward" size={15} color={COLORS.muted} />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => openRoute(hasSession ? "/account" : "/(auth)/login")}
              style={styles.drawerFooterButton}
            >
              <Text style={styles.drawerFooterButtonText}>
                {hasSession ? "Mijn account" : "Inloggen"}
              </Text>
            </Pressable>
          </View>
        </Drawer>
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
  desktopShell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: COLORS.bg,
  },
  sidebarColumn: {
    width: 250,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: "#fcfcfd",
  },
  sidebarSticky: {
    flex: 1,
    position: "sticky" as any,
    top: 18,
  },
  sidebarBrand: {
    minHeight: 40,
    justifyContent: "center",
  },
  sidebarLogo: {
    width: 148,
    height: 32,
  },
  sidebarKicker: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  sidebarNav: {
    marginTop: 24,
    gap: 8,
  },
  sidebarItem: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "transparent",
  },
  sidebarItemActive: {
    backgroundColor: COLORS.text,
  },
  sidebarItemPressed: {
    transform: [{ scale: 0.99 }],
  },
  sidebarItemText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  sidebarItemTextActive: {
    color: "#ffffff",
  },
  sidebarFooter: {
    marginTop: "auto",
    gap: 10,
  },
  sidebarPrimaryCta: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarPrimaryCtaText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  sidebarSecondaryCta: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  sidebarSecondaryCtaText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  mainColumn: {
    flex: 1,
    minWidth: 0,
  },
  desktopTopBar: {
    minHeight: 78,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(17,17,17,0.05)",
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  desktopTopBarRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  mobileTopBar: {
    paddingTop: 2,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(17,17,17,0.05)",
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  mobileTopBarRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobileLogoWrap: {
    width: 122,
    minHeight: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  mobileLogo: {
    width: 148,
    height: 38,
  },
  searchDock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: COLORS.surface,
  },
  searchDockDesktop: {
    flex: 1,
    minHeight: 50,
    borderRadius: 26,
    paddingHorizontal: 16,
    maxWidth: 760,
  },
  searchDockMobile: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
  },
  searchDockPressed: {
    transform: [{ scale: 0.99 }],
  },
  searchDockText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  searchDockTextMobile: {
    fontSize: 13,
  },
  accountButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  mobileContent: {
    flex: 1,
    paddingTop: 6,
    paddingBottom: 22,
  },
  desktopContent: {
    flex: 1,
    paddingTop: 24,
    paddingBottom: 32,
  },
  drawerContent: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
  },
  drawerKicker: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  drawerTitle: {
    marginTop: 8,
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
  },
  drawerList: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  drawerItem: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  drawerItemActive: {
    backgroundColor: COLORS.surface,
  },
  drawerItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  drawerItemText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  drawerItemTextActive: {
    color: COLORS.text,
  },
  drawerFooterButton: {
    marginTop: 20,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerFooterButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});
