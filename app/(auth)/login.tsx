// FILE: app/(auth)/login.tsx

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import SignupModal from "../../components/SignupModal";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase"; 

export default function LoginScreen() {
  const router = useRouter();

  

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  const canLogin = useMemo(
    () => email.trim().length > 3 && pass.length >= 6,
    [email, pass]
  );

async function onLogin() {
  if (!canLogin) return;

  setLoading(true);

  try {
    // 1. Login
    const cred = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      pass
    );

    const uid = cred.user.uid;

    // 2. User document ophalen
    const snap = await getDoc(doc(db, "users", uid));

    if (!snap.exists()) {
      Alert.alert("Fout", "Geen gebruikersprofiel gevonden.");
      return;
    }

    const data = snap.data();
    const role = data.role;

    // 3. Redirect op basis van role
    if (role === "company") {
      router.replace("/(company)/(tabs)" as any);
      return;
    }



    // Default = customer
    router.replace("/(customer)/(tabs)" as any);
  } catch (e: any) {
    Alert.alert("Login fout", e?.message ?? "Er ging iets mis.");
  } finally {
    setLoading(false);
  }
}

  function onPickRole(role: "customer" | "company") {
    setSignupOpen(false);
    router.push(
      {
        pathname: "/(auth)/signup",
        params: { role, email: email.trim() },
      } as any
    );
  }

  function onGoogle() {
    Alert.alert("Google login", "UI staat. Google sign-in voegen we zo toe.");
  }

  function onApple() {
    Alert.alert("Apple login", "UI staat. Apple sign-in voegen we zo toe.");
  }

  return (
    <LinearGradient colors={["#FBE7F0", "#F7D6E6", "#F2C7DB"]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.wrap}>

          {/* ✅ Logo boven (png) */}
          <Image
            source={require("../../assets/logo/logo.png")}
            style={styles.logoImg}
            resizeMode="contain"
          />

          <Text style={styles.tag}>Log in en ga verder met je routine ✨</Text>

          {/* ✅ panel iets hoger */}
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <Text style={styles.icon}>✉️</Text>
              <TextInput
                placeholder="E-mail"
                placeholderTextColor="#000"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
              />
            </View>

            <View style={styles.sep} />

            <View style={styles.fieldRow}>
              <Text style={styles.icon}>🔒</Text>
              <TextInput
                placeholder="Wachtwoord"
                placeholderTextColor="#000"
                secureTextEntry
                value={pass}
                onChangeText={setPass}
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              onPress={() => Alert.alert("Wachtwoord", "Later: reset flow")}
              style={{ alignSelf: "flex-end", marginTop: 10 }}
            >
              <Text style={styles.link}>Wachtwoord vergeten?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onLogin}
              disabled={!canLogin || loading}
              style={[styles.primaryBtn, (!canLogin || loading) && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryBtnText}>{loading ? "Bezig..." : "Inloggen"}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSignupOpen(true)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Account aanmaken</Text>
            </TouchableOpacity>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>of</Text>
              <View style={styles.orLine} />
            </View>

            <TouchableOpacity onPress={onApple} style={styles.socialBtn}>
              <Text style={styles.socialIcon}></Text>
              <Text style={styles.socialText}>Doorgaan met Apple</Text>
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onGoogle} style={styles.socialBtn}>
              <Text style={styles.socialIcon}>G</Text>
              <Text style={styles.socialText}>Doorgaan met Google</Text>
              <Text style={styles.chev}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        <SignupModal
          visible={signupOpen}
          onClose={() => setSignupOpen(false)}
          onPickRole={onPickRole}
          presetEmail={email}
        />
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    paddingTop: 40,
  },

  logoImg: {
    width: 260,
    height: 165,
    marginBottom: 10,
    alignSelf: "center",
  },

  tag: { marginTop: 6, marginBottom: 14, color: "#444", fontWeight: "700" },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F0D6E2",
  },

  fieldRow: { flexDirection: "row", alignItems: "center" },
  icon: { width: 28, textAlign: "center", fontSize: 14, opacity: 0.7 },
  input: { flex: 1, height: 44, color: "#111", fontWeight: "800" },
  sep: { height: 1, backgroundColor: "rgba(0,0,0,0.08)" },

  link: { color: "#6C2A4A", fontWeight: "900" },

  primaryBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#E97AAE",
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "900", fontSize: 16 },

  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
  },
  secondaryBtnText: { color: "#2B2B2B", fontWeight: "900" },

  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: "rgba(0,0,0,0.10)" },
  orText: { color: "#555", fontWeight: "900" },

  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 10,
  },
  socialIcon: { width: 28, fontWeight: "900", fontSize: 16, textAlign: "center" },
  socialText: { flex: 1, fontWeight: "900", color: "#222" },
  chev: { fontSize: 22, fontWeight: "900", opacity: 0.4 },
});