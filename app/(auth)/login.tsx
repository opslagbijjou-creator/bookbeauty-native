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
  // simpele validatie (goed genoeg voor UX)
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
    return e.length > 3 && password.length >= 6 && !getEmailError(e) && !getPasswordError(password);
  }, [email, password]);

  async function onLogin() {
    if (!canSubmit || loading) {
      // zet errors zichtbaar als user te snel klikt
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
          {/* Logo (groot & vrij) */}
          <View style={styles.logoContainer}>
            <Image source={require("../../assets/logo/logo.png")} style={styles.logo} contentFit="contain" />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>BookBeauty</Text>
            <Text style={styles.subtitle}>Log in op je account</Text>

            {/* MUI-achtige field: label + outlined input + helper/error */}
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
                  onChangeText={(t) => setEmail(t)}
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
                  onChangeText={(t) => setPassword(t)}
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

            {/* Primary action (MUI contained-gevoel) */}
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
              <Pressable style={({ pressed }) => [styles.socialBtn, pressed && styles.softPressed]} onPress={() => onSocialLogin("apple")}>
                <Ionicons name="logo-apple" size={16} color={COLORS.text} />
                <Text style={styles.socialBtnText}>Apple</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.socialBtn, pressed && styles.softPressed]} onPress={() => onSocialLogin("google")}>
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
    backgroundColor: COLORS.bg,
    padding: 20,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Logo “vrij” boven de card
  logoContainer: {
    alignItems: "center",
    marginBottom: -56,
    zIndex: 10,
  },
  logo: {
    width: 170,
    height: 170,
  },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    paddingTop: 78,
    gap: 12,

    shadowColor: "#000",
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },

  title: {
    fontSize: 30,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    color: COLORS.muted,
    textAlign: "center",
    marginBottom: 2,
  },

  field: {
    gap: 6,
  },
  label: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  outlined: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  outlinedFocused: {
    borderColor: COLORS.primary,
  },
  outlinedError: {
    borderColor: "#D32F2F", // alleen error, je algemene kleuren blijven verder hetzelfde
  },

  input: {
    flex: 1,
    color: COLORS.text,
    fontWeight: "600",
  },

  helper: {
    fontSize: 12,
    color: COLORS.muted,
    marginLeft: 2,
  },
  helperError: {
    color: "#D32F2F",
    fontWeight: "600",
  },

  btn: {
    marginTop: 2,
    backgroundColor: COLORS.primary,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "800",
  },

  link: {
    marginTop: 6,
    textAlign: "center",
    color: COLORS.primary,
    fontWeight: "700",
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
    fontWeight: "700",
  },

  socialRow: {
    flexDirection: "row",
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
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
    fontWeight: "800",
  },
  softPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
});