// FILE: app/(admin)/home.tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";

export default function AdminHome() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: "900" }}>Admin Home 🛠️</Text>
      <Text style={{ marginTop: 8, opacity: 0.7 }}>{auth.currentUser?.email}</Text>

      <TouchableOpacity
        onPress={() => signOut(auth)}
        style={{ marginTop: 18, padding: 12, borderRadius: 12, backgroundColor: "#eee" }}
      >
        <Text style={{ fontWeight: "900" }}>Uitloggen</Text>
      </TouchableOpacity>
    </View>
  );
}