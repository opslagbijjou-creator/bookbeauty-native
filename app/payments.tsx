import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../lib/ui";

export default function PaymentsPlaceholderScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>Betalen komt later</Text>
        <Text style={styles.text}>
          Phase 1 gebruikt alleen boekingsaanvragen. Online betalingen zijn verwijderd uit deze release.
        </Text>
        <Pressable onPress={() => router.replace("/" as never)} style={styles.btn}>
          <Text style={styles.btnText}>Terug naar home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
    padding: 16,
    justifyContent: "center",
  },
  card: {
    borderRadius: 24,
    backgroundColor: COLORS.card,
    padding: 24,
    gap: 12,
  },
  title: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 28,
  },
  text: {
    color: COLORS.muted,
    lineHeight: 22,
  },
  btn: {
    alignSelf: "flex-start",
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  btnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
});

