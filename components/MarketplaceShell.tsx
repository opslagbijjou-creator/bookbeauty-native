import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../lib/firebase";
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

const MENU_ITEMS: MenuItem[] = [
  { key: "home", label: "Home", href: "/" },
  { key: "discover", label: "Ontdek salons", href: "/discover" },
  { key: "feed", label: "Feed", href: "/feed" },
  { key: "register", label: "Meld je salon gratis aan", href: "/(auth)/register" },
];

export default function MarketplaceShell({
  children,
  active,
  scroll = true,
  fullBleed = false,
}: MarketplaceShellProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSession = Boolean(auth.currentUser?.uid);

  const profileRoute = useMemo(
    () => (hasSession ? "/(customer)/(tabs)/profile" : "/(auth)/login"),
    [hasSession]
  );

  function openRoute(href: string) {
    setMenuOpen(false);
    router.push(href as never);
  }

  const content = (
    <View style={[styles.content, fullBleed && styles.contentFullBleed]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={styles.topBarRow}>
            <Pressable onPress={() => setMenuOpen(true)} style={styles.sideButton}>
              <Ionicons name="menu-outline" size={24} color={COLORS.text} />
            </Pressable>

            <Pressable onPress={() => router.push("/" as never)} style={styles.logoWrap}>
              <View style={styles.logoMark}>
                <View style={styles.logoMarkInner} />
              </View>
              <Text style={styles.logoText}>BookBeauty</Text>
            </Pressable>

            <Pressable onPress={() => router.push(profileRoute as never)} style={styles.sideButton}>
              <Ionicons
                name={hasSession ? "person-circle-outline" : "person-outline"}
                size={24}
                color={COLORS.text}
              />
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
            <View style={styles.menuPanel}>
              <Text style={styles.menuKicker}>Menu</Text>
              <Text style={styles.menuTitle}>BookBeauty marketplace</Text>

              <View style={styles.menuList}>
                {MENU_ITEMS.map((item) => {
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
    borderBottomColor: COLORS.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
  },
  topBarRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sideButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMarkInner: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
  logoText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  content: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
  },
  contentFullBleed: {
    maxWidth: undefined,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  menuRoot: {
    flex: 1,
    flexDirection: "row",
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
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
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
