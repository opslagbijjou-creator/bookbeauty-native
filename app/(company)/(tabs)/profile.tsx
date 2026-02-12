// FILE: app/(company)/(tabs)/profile.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";

const BG = "#F7E6EE";
const CARD = "#FFFFFF";
const BORDER = "#E9D3DF";
const TEXT = "#1E1E1E";
const MUTED = "#6B6B6B";

export default function CompanyProfile() {
  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>Profiel</Text>

      <View style={styles.card}>
        <Text style={styles.title}>Nog niet gebouwd</Text>
        <Text style={styles.sub}>
          Hier maken we later: logo, cover, bio, openingstijden, categorieën, locatie etc.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG, padding: 16, paddingTop: 18 },
  h1: { fontSize: 20, fontWeight: "900", color: TEXT, marginBottom: 12 },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 16, padding: 14 },
  title: { fontWeight: "900", color: TEXT, fontSize: 16 },
  sub: { marginTop: 6, color: MUTED, fontWeight: "700" },
});