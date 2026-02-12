// FILE: app/(customer)/(tabs)/profile.tsx
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../../../lib/firebase";

export default function Profile() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Profiel</Text>
      <Text style={styles.sub}>
        Hier komen later: boekingsgeschiedenis, favorieten, reviews, instellingen.
      </Text>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => Alert.alert("Boekingen", "Later: jouw boekingsgeschiedenis")}
      >
        <Text style={styles.btnText}>Mijn boekingen</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, { backgroundColor: "#111" }]} onPress={() => signOut(auth)}>
        <Text style={[styles.btnText, { color: "white" }]}>Uitloggen</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6D9E4", paddingTop: 80, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: "900", color: "#111" },
  sub: { marginTop: 8, fontWeight: "800", color: "rgba(0,0,0,0.6)" },
  btn: {
    marginTop: 14,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  btnText: { fontWeight: "900", color: "#111", fontSize: 16 },
});