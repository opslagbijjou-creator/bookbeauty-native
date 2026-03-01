import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { getUserRole, logout, subscribeAuth } from "../lib/authRepo";
import { auth } from "../lib/firebase";
import type { AppRole } from "../lib/roles";
import { COLORS } from "../lib/ui";

type AccountAction = {
  key: string;
  label: string;
  subtitle: string;
  href?: string;
  destructive?: boolean;
};

function normalizeRole(role: AppRole | null | undefined): AppRole | null {
  if (role === "company" || role === "employee" || role === "influencer" || role === "admin") return role;
  if (role === "customer") return role;
  return null;
}

export default function PublicAccountScreen() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    return subscribeAuth((user) => {
      setUid(user?.uid ?? null);
      if (!user?.uid) {
        setRole(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    getUserRole(uid)
      .then((nextRole) => {
        setRole(normalizeRole(nextRole) ?? "customer");
      })
      .catch(() => {
        setRole("customer");
      });
  }, [uid]);

  const actions = useMemo<AccountAction[]>(() => {
    if (!uid) {
      return [
        {
          key: "login",
          label: "Inloggen of account maken",
          subtitle: "Log in voor likes, favorieten en boekingen met statusupdates.",
          href: "/(auth)/login",
        },
        {
          key: "register-salon",
          label: "Meld je salon gratis aan",
          subtitle: "Maak direct een salonprofiel aan en sta meteen live in discover.",
          href: "/(auth)/register",
        },
      ];
    }

    if (!role) {
      return [];
    }

    if (role === "company" || role === "employee") {
      return [
        {
          key: "company-home",
          label: "Open salondashboard",
          subtitle: "Beheer je salonprofiel, team en beschikbaarheid.",
          href: "/(company)/(tabs)/home",
        },
        {
          key: "company-bookings",
          label: "Bekijk aanvragen",
          subtitle: "Accepteer, weiger of stel een nieuw tijdstip voor.",
          href: "/(company)/(tabs)/bookings",
        },
        {
          key: "logout",
          label: "Uitloggen",
          subtitle: "Sluit deze sessie veilig af op dit apparaat.",
          destructive: true,
        },
      ];
    }

    if (role === "admin") {
      return [
        {
          key: "admin",
          label: "Open admin",
          subtitle: "Beheer platformdata, profielen en support.",
          href: "/(admin)/(tabs)/index",
        },
        {
          key: "logout",
          label: "Uitloggen",
          subtitle: "Sluit deze sessie veilig af op dit apparaat.",
          destructive: true,
        },
      ];
    }

    return [
      {
        key: "customer-bookings",
        label: "Mijn boekingen",
        subtitle: "Bekijk de status van je lopende beauty-aanvragen.",
        href: "/account-bookings",
      },
      {
        key: "customer-profile",
        label: "Mijn profiel",
        subtitle: "Beheer favorieten, instellingen en je accountgegevens.",
        href: "/account-profile",
      },
      {
        key: "logout",
        label: "Uitloggen",
        subtitle: "Sluit deze sessie veilig af op dit apparaat.",
        destructive: true,
      },
    ];
  }, [role, uid]);

  async function onPressAction(action: AccountAction) {
    if (action.destructive) {
      try {
        await logout();
      } catch (error: any) {
        Alert.alert("Uitloggen mislukt", error?.message ?? "Probeer het opnieuw.");
      }
      return;
    }
    if (!action.href) return;
    router.push(action.href as never);
  }

  return (
    <MarketplaceShell scroll={false}>
      <MarketplaceSeo
        title="Account | BookBeauty"
        description="Log in, beheer je boekingen of open je salondashboard."
        pathname="/account"
      />

      <View style={styles.screen}>
        <Text style={styles.kicker}>{uid ? "Je account" : "Welkom"}</Text>
        <Text style={styles.title}>
          {uid ? "Alles op een plek, zonder terug te springen uit de marketplace." : "Log in wanneer je iets wilt doen."}
        </Text>
        <Text style={styles.subtitle}>
          {uid
            ? "De publieke ervaring blijft leidend. Vanaf hier open je alleen bewust je profiel of dashboard."
            : "Browsen blijft publiek. Login is alleen nodig voor likes, favorieten, boekingen of salonbeheer."}
        </Text>

        <View style={styles.list}>
          {actions.length ? (
            actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => onPressAction(action).catch(() => null)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, action.destructive && styles.rowTitleDestructive]}>
                    {action.label}
                  </Text>
                  <Text style={styles.rowSubtitle}>{action.subtitle}</Text>
                </View>
                <Ionicons
                  name={action.destructive ? "log-out-outline" : "arrow-forward"}
                  size={18}
                  color={action.destructive ? "#b42318" : COLORS.text}
                />
              </Pressable>
            ))
          ) : (
            <View style={styles.loadingRow}>
              <Text style={styles.rowSubtitle}>Account wordt geladen...</Text>
            </View>
          )}
        </View>
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 24,
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  title: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -0.9,
    maxWidth: 700,
  },
  subtitle: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 720,
  },
  list: {
    marginTop: 26,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: "#ffffff",
  },
  row: {
    minHeight: 88,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  rowCopy: {
    flex: 1,
    gap: 5,
  },
  loadingRow: {
    minHeight: 88,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  rowTitleDestructive: {
    color: "#b42318",
  },
  rowSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
});
