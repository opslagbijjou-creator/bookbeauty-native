import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/ui";
import { getDefaultCityPath } from "../lib/marketplace";

type MarketplaceShellProps = {
  active?: "home" | "discover" | "feed";
  children: React.ReactNode;
  scroll?: boolean;
};

const navItems = [
  { key: "home" as const, label: "Home", href: "/" },
  { key: "discover" as const, label: "Ontdek", href: "/discover" },
  { key: "feed" as const, label: "Feed", href: "/feed" },
];

function ShellContent({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: MarketplaceShellProps["active"];
}) {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={styles.navWrap}>
        <View style={styles.navCard}>
          <Pressable onPress={() => router.push("/" as never)} style={styles.brandWrap}>
            <View style={styles.brandDot} />
            <Text style={styles.brandText}>BookBeauty</Text>
          </Pressable>

          <View style={styles.navLinks}>
            {navItems.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => router.push(item.href as never)}
                style={[styles.navLink, active === item.key && styles.navLinkActive]}
              >
                <Text style={[styles.navLinkText, active === item.key && styles.navLinkTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.navCtas}>
            <Pressable
              onPress={() => router.push("/(auth)/register" as never)}
              style={[styles.ctaBtn, styles.secondaryBtn]}
            >
              <Text style={[styles.ctaText, styles.secondaryText]}>Meld je salon gratis aan</Text>
            </Pressable>
            <Pressable onPress={() => router.push(getDefaultCityPath() as never)} style={styles.ctaBtn}>
              <Text style={styles.ctaText}>Ontdek salons</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.body}>{children}</View>
    </View>
  );
}

export default function MarketplaceShell({ children, active, scroll = true }: MarketplaceShellProps) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {scroll ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <ShellContent active={active}>{children}</ShellContent>
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          <ShellContent active={active}>{children}</ShellContent>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  navWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  navCard: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    shadowColor: "#102544",
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  brandText: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  navLinks: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  navLink: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navLinkActive: {
    backgroundColor: COLORS.surface,
  },
  navLinkText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  navLinkTextActive: {
    color: COLORS.text,
  },
  navCtas: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ctaBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtn: {
    backgroundColor: COLORS.primarySoft,
  },
  ctaText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  secondaryText: {
    color: COLORS.primary,
  },
  body: {
    flex: 1,
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
});

