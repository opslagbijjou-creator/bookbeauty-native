import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getUserRole, login } from "../../lib/authRepo";
import { registerPushTokenForUser } from "../../lib/pushRepo";
import { COLORS } from "../../lib/ui";

function getEmailError(email: string) {
  const v = email.trim();
  if (!v) return "";
  if (!v.includes("@") || !v.includes(".")) return "Vul een geldig e-mailadres in.";
  return "";
}

function getPasswordError(password: string) {
  if (!password) return "";
  if (password.length < 6) return "Wachtwoord moet minimaal 6 tekens zijn.";
  return "";
}

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const [touchedEmail, setTouchedEmail] = useState(false);
  const [touchedPassword, setTouchedPassword] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  const emailError = useMemo(
    () => (touchedEmail ? getEmailError(email) : ""),
    [email, touchedEmail]
  );
  const passwordError = useMemo(
    () => (touchedPassword ? getPasswordError(password) : ""),
    [password, touchedPassword]
  );

  const canSubmit = useMemo(() => {
    const e = email.trim();
    return (
      e.length > 3 &&
      password.length >= 6 &&
      !getEmailError(e) &&
      !getPasswordError(password)
    );
  }, [email, password]);

  async function onLogin() {
    if (!canSubmit || loading) {
      setTouchedEmail(true);
      setTouchedPassword(true);
      return;
    }

    setLoading(true);
    try {
      const user = await login(email.trim(), password);

      const pushResult = await registerPushTokenForUser(user.uid, {
        requestPermission: true,
      }).catch(() => null);

      if (pushResult && pushResult.ok !== true) {
        Alert.alert("Push setup", `Push registreren is niet gelukt (${pushResult.reason}).`);
      }

      const role = await getUserRole(user.uid);

      if (role === "company") {
        router.replace("/(company)/(tabs)/home" as never);
      } else if (role === "employee") {
        router.replace("/(company)/(tabs)/bookings" as never);
      } else if (role === "admin") {
        router.replace("/(admin)/(tabs)" as never);
      } else if (role === "influencer") {
        router.replace("/(customer)/(tabs)/profile" as never);
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
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {/* ===== glossy / 3D background layers ===== */}
          <View pointerEvents="none" style={styles.bgGlowTop} />
          <View pointerEvents="none" style={styles.bgGlowBottom} />
          <View pointerEvents="none" style={styles.bgHighlight} />

          {/* ===== Logo (groot, precies boven card) ===== */}
          <View style={styles.brandRow}>
            <Image
              source={require("../../assets/logo/logo.png")}
              style={styles.logo}
              contentFit="contain"
            />
          </View>

          {/* ===== Glass Card ===== */}
          <View style={styles.card}>
            {/* subtle glass shine */}
            <View pointerEvents="none" style={styles.cardShine} />

            {/* Titel weg (zoals je wilde) */}
            <Text style={styles.subtitle}>Log in op je account</Text>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>E-mail</Text>

              <View
                style={[
                  styles.outlined,
                  emailFocused && styles.outlinedFocused,
                  !!emailError && styles.outlinedError,
                ]}
              >
                <Ionicons name="mail-outline" size={18} color={COLORS.muted} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@bedrijf.nl"
                  placeholderTextColor={COLORS.placeholder}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  style={styles.input}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => {
                    setEmailFocused(false);
                    setTouchedEmail(true);
                  }}
                />

                {email.length > 0 ? (
                  <Pressable
                    onPress={() => setEmail("")}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="E-mail wissen"
                  >
                    <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                  </Pressable>
                ) : null}
              </View>

              <Text style={[styles.helper, !!emailError && styles.helperError]}>
                {emailError ? emailError : "Gebruik het e-mailadres van je account."}
              </Text>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Wachtwoord</Text>

              <View
                style={[
                  styles.outlined,
                  passwordFocused && styles.outlinedFocused,
                  !!passwordError && styles.outlinedError,
                ]}
              >
                <Ionicons name="lock-closed-outline" size={18} color={COLORS.muted} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.placeholder}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={onLogin}
                  style={styles.input}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => {
                    setPasswordFocused(false);
                    setTouchedPassword(true);
                  }}
                />

                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={COLORS.muted}
                  />
                </Pressable>
              </View>

              <Text style={[styles.helper, !!passwordError && styles.helperError]}>
                {passwordError ? passwordError : "Minimaal 6 tekens."}
              </Text>
            </View>

            {/* Button */}
            <Pressable
              onPress={onLogin}
              disabled={!canSubmit || loading}
              style={({ pressed }) => [
                styles.btn,
                (!canSubmit || loading) && styles.btnDisabled,
                pressed && canSubmit && !loading && styles.btnPressed,
              ]}
            >
              {loading ? (
                <View style={styles.btnRow}>
                  <ActivityIndicator />
                  <Text style={styles.btnText}>Bezig...</Text>
                </View>
              ) : (
                <Text style={styles.btnText}>Inloggen</Text>
              )}
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
              <Pressable
                style={({ pressed }) => [styles.socialBtn, pressed && styles.softPressed]}
                onPress={() => onSocialLogin("apple")}
              >
                <Ionicons name="logo-apple" size={16} color={COLORS.text} />
                <Text style={styles.socialBtnText}>Apple</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.socialBtn, pressed && styles.softPressed]}
                onPress={() => onSocialLogin("google")}
              >
                <Ionicons name="logo-google" size={16} color={COLORS.text} />
                <Text style={styles.socialBtnText}>Google</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg, // jouw kleur blijft
    padding: 20,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },

  /* ===== Background: glossy / 3D (zonder kleuren te veranderen) ===== */
  bgGlowTop: {
    position: "absolute",
    top: -40,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "#ffffff",
    opacity: 0.22,
  },
  bgGlowBottom: {
    position: "absolute",
    bottom: -60,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: "#ffffff",
    opacity: 0.16,
  },
  bgHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 140,
    opacity: 0.10,
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 80,
  },

  /* ===== Logo ===== */
  brandRow: {
    alignItems: "center",
    marginBottom: 14,
  },
  logo: {
    width: 210,  // groter
    height: 70,  // brede logo look (pas aan als je logo vierkant is)
  },

  /* ===== Glass card ===== */
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(255,255,255,0.72)", // glass effect
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    padding: 20,
    gap: 12,

    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    overflow: "hidden",
  },
  cardShine: {
    position: "absolute",
    top: -120,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "#fff",
    opacity: 0.35,
    transform: [{ rotate: "20deg" }],
  },

  subtitle: {
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: 6,
    fontWeight: "700",
  },

  field: { gap: 6 },
  label: {
    color: COLORS.muted,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  outlined: {
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  outlinedFocused: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  outlinedError: {
    borderColor: "#D32F2F",
  },

  input: {
    flex: 1,
    color: COLORS.text,
    fontWeight: "700",
  },

  helper: {
    fontSize: 12,
    color: COLORS.muted,
    marginLeft: 2,
    fontWeight: "600",
  },
  helperError: {
    color: "#D32F2F",
    fontWeight: "700",
  },

  btn: {
    marginTop: 4,
    backgroundColor: COLORS.primary, // jouw kleur blijft
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  btnPressed: {
    transform: [{ scale: 0.99 }],
  },
  btnDisabled: {
    opacity: 0.55,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  btnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },

  link: {
    marginTop: 6,
    textAlign: "center",
    color: COLORS.primary,
    fontWeight: "900",
  },

  dividerRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  dividerText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },

  socialRow: {
    flexDirection: "row",
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(255,255,255,0.80)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  socialBtnText: {
    color: COLORS.text,
    fontWeight: "900",
  },
  softPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
});