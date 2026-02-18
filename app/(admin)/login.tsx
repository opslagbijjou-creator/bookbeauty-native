import React from "react";
import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../../lib/ui";

export default function AdminLoginScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Text style={styles.title}>Admin Login</Text>
      <Text style={styles.text}>Minimale placeholder.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 24,
  },
  text: {
    color: COLORS.muted,
    marginTop: 6,
  },
});
