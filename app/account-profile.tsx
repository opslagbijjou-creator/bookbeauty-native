import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { auth } from "../lib/firebase";
import { COLORS } from "../lib/ui";

export default function AccountProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  return (
    <MarketplaceShell scroll={false}>
      <MarketplaceSeo
        title="Mijn profiel | BookBeauty"
        description="Beheer je profiel zonder uit de marketplace te springen."
        pathname="/account-profile"
      />

      <View style={styles.screen}>
        <Text style={styles.kicker}>Mijn profiel</Text>
        <Text style={styles.title}>Je klantgegevens, rustig en overzichtelijk.</Text>
        <Text style={styles.subtitle}>
          Dit profiel blijft binnen dezelfde marketplace-ervaring, zonder losse oude app-shell.
        </Text>

        {user ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Naam</Text>
              <Text style={styles.value}>{user.displayName || "Nog niet ingesteld"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>E-mail</Text>
              <Text style={styles.value}>{user.email || "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Favorieten</Text>
              <Text style={styles.value}>Volg salons vanuit de feed of profielpagina.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.value}>Log in om je profielgegevens te zien en boekingen te beheren.</Text>
            <Pressable onPress={() => router.push("/(auth)/login" as never)} style={styles.button}>
              <Text style={styles.buttonText}>Inloggen</Text>
            </Pressable>
          </View>
        )}
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 24,
    maxWidth: 760,
  },
  card: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
  },
  row: {
    gap: 4,
  },
  label: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  value: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  button: {
    alignSelf: "flex-start",
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
});
