// FILE: app/(auth)/signup.tsx
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { createUserProfile } from "../../lib/userRepo";

const PH = "#000"; // ✅ placeholder/hint kleur
const CURSOR = "#000";

function hasUpper(s: string) {
  return /[A-Z]/.test(s);
}
function hasNumber(s: string) {
  return /\d/.test(s);
}

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string; email?: string }>();

  const role = (params.role === "company" ? "company" : "customer") as
    | "company"
    | "customer";

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [kvk, setKvk] = useState("");

  const [email, setEmail] = useState(String(params.email ?? ""));
  const [pass, setPass] = useState("");

  const [loading, setLoading] = useState(false);

  const valid = useMemo(() => {
    if (!first.trim() || !last.trim()) return false;
    if (!email.trim().includes("@")) return false;
    if (pass.length < 6) return false;
    if (!hasUpper(pass) || !hasNumber(pass)) return false;

    if (role === "company" && !companyName.trim()) return false;

    return true;
  }, [first, last, email, pass, role, companyName]);

  async function onCreate() {
    if (!valid) {
      Alert.alert(
        "Check even",
        "Vul alles in. Wachtwoord: minimaal 6 tekens + 1 hoofdletter + 1 cijfer."
      );
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      const uid = cred.user.uid;

      await createUserProfile({
        uid,
        email: email.trim(),
        role,
        firstName: first.trim(),
        lastName: last.trim(),
        companyName: role === "company" ? companyName.trim() : undefined,
        kvk: role === "company" ? kvk.trim() : undefined,
      });

      router.replace("/" as any); // gate
    } catch (e: any) {
      Alert.alert("Account maken mislukt", e?.message ?? "Er ging iets mis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={["#FBE7F0", "#F7D6E6", "#F2C7DB"]} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.wrap}>
          <Text style={styles.title}>
            {role === "company" ? "Bedrijfsaccount aanmaken" : "Account aanmaken"}
          </Text>

          <Text style={styles.sub}>
            Wachtwoord regels: minimaal 6 tekens, 1 hoofdletter (A-Z) en 1 cijfer (0-9).
          </Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <TextInput
                placeholder="Voornaam"
                placeholderTextColor={PH}
                selectionColor={CURSOR}
                value={first}
                onChangeText={setFirst}
                style={[styles.input, { flex: 1 }]}
              />
              <View style={{ width: 10 }} />
              <TextInput
                placeholder="Achternaam"
                placeholderTextColor={PH}
                selectionColor={CURSOR}
                value={last}
                onChangeText={setLast}
                style={[styles.input, { flex: 1 }]}
              />
            </View>

            {role === "company" ? (
              <>
                <TextInput
                  placeholder="Bedrijfsnaam"
                  placeholderTextColor={PH}
                  selectionColor={CURSOR}
                  value={companyName}
                  onChangeText={setCompanyName}
                  style={styles.input}
                />

                <TextInput
                  placeholder="KVK (mag later)"
                  placeholderTextColor={PH}
                  selectionColor={CURSOR}
                  value={kvk}
                  onChangeText={setKvk}
                  style={styles.input}
                />
              </>
            ) : null}

            <TextInput
              placeholder="E-mail"
              placeholderTextColor={PH}
              selectionColor={CURSOR}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />

            <TextInput
              placeholder="Wachtwoord"
              placeholderTextColor={PH}
              selectionColor={CURSOR}
              secureTextEntry
              value={pass}
              onChangeText={setPass}
              style={styles.input}
            />

            <TouchableOpacity
              onPress={onCreate}
              disabled={!valid || loading}
              style={[styles.primaryBtn, (!valid || loading) && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryBtnText}>
                {loading ? "Bezig..." : "Account aanmaken"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Terug</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },

  title: { fontSize: 22, fontWeight: "900", color: "#2B2B2B", marginBottom: 8 },
  sub: {
    color: "#444",
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 18,
    maxWidth: 420,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: "#F0D6E2",
  },

  row: { flexDirection: "row" },

  input: {
    height: 46,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    fontWeight: "800",
    color: "#111", // ✅ typed tekst zwart
    marginBottom: 10,
  },

  primaryBtn: {
    marginTop: 10,
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
});