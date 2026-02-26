import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/ui";

const APP_MODE = process.env.EXPO_PUBLIC_APP_MODE;

export default function PaymentsRedirectScreen() {
  // 🔒 Public mode → geen payment pagina zichtbaar
  if (APP_MODE === "public") {
    return null;
  }

  const router = useRouter();
  const params = useLocalSearchParams<{ mollie?: string | string[]; reason?: string | string[] }>();

  const { title, message } = useMemo(() => {
    const rawStatus = params.mollie;
    const status =
      typeof rawStatus === "string"
        ? rawStatus.trim().toLowerCase()
        : Array.isArray(rawStatus)
          ? String(rawStatus[0] || "").trim().toLowerCase()
          : "";

    const rawReason = params.reason;
    const reason =
      typeof rawReason === "string"
        ? rawReason.trim()
        : Array.isArray(rawReason)
          ? String(rawReason[0] || "").trim()
          : "";

    if (status === "connected") {
      return {
        title: "Mollie gekoppeld",
        message: "Je account is gekoppeld. Je wordt nu teruggestuurd naar je bedrijfsprofiel.",
      };
    }

    return {
      title: "Mollie koppeling mislukt",
      message: reason ? `Fout: ${reason}` : "Probeer opnieuw vanuit je bedrijfsprofiel.",
    };
  }, [params.mollie, params.reason]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <Pressable
          style={styles.button}
          onPress={() => router.replace("/(company)/(tabs)/home" as never)}
        >
          <Text style={styles.buttonText}>Terug naar bedrijfsprofiel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    padding: 18,
    gap: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  message: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  button: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});