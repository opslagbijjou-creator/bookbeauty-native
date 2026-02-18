import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getUserRole, login } from "../../lib/authRepo";
import { COLORS } from "../../lib/ui";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 3 && password.length >= 6, [email, password]);

  async function onLogin() {
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      const user = await login(email, password);
      const role = await getUserRole(user.uid);

      if (role === "company") {
        router.replace("/(company)/(tabs)/home" as never);
      } else if (role === "employee") {
        router.replace("/(company)/(tabs)/bookings" as never);
      } else if (role === "admin") {
        router.replace("/(admin)/(tabs)" as never);
      } else {
        router.replace("/(customer)/(tabs)" as never);
      }
    } catch (error: any) {
      Alert.alert("Login mislukt", error?.message ?? "Controleer je gegevens.");
    } finally {
      setLoading(false);
    }
  }

  function onSocialLogin(provider: "apple" | "google") {
    const label = provider === "apple" ? "Apple" : "Google";
    Alert.alert("Binnenkort", `Inloggen met ${label} komt in de volgende update.`);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Image source={require("../../assets/logo/logo.png")} style={styles.logo} contentFit="contain" />
        </View>
        <Text style={styles.title}>BookBeauty</Text>
        <Text style={styles.subtitle}>Log in op je account</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="E-mail"
          placeholderTextColor={COLORS.placeholder}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Wachtwoord"
          placeholderTextColor={COLORS.placeholder}
          secureTextEntry
          style={styles.input}
        />

        <Pressable onPress={onLogin} style={[styles.btn, (!canSubmit || loading) && styles.disabled]}>
          <Text style={styles.btnText}>{loading ? "Bezig..." : "Inloggen"}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(auth)/register" as never)}>
          <Text style={styles.link}>Nog geen account? Registreren</Text>
        </Pressable>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>of ga verder met</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <Pressable style={styles.socialBtn} onPress={() => onSocialLogin("apple")}>
            <Ionicons name="logo-apple" size={16} color={COLORS.text} />
            <Text style={styles.socialBtnText}>Apple</Text>
          </Pressable>
          <Pressable style={styles.socialBtn} onPress={() => onSocialLogin("google")}>
            <Ionicons name="logo-google" size={16} color={COLORS.text} />
            <Text style={styles.socialBtnText}>Google</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 10,
  },
  logoWrap: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
    overflow: "hidden",
  },
  logo: {
    width: 72,
    height: 72,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    color: COLORS.muted,
    marginBottom: 6,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
  },
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
  link: {
    marginTop: 8,
    textAlign: "center",
    color: COLORS.primary,
    fontWeight: "600",
  },
  dividerRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  socialRow: {
    flexDirection: "row",
    gap: 8,
  },
  socialBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  socialBtnText: {
    color: COLORS.text,
    fontWeight: "700",
  },
});
