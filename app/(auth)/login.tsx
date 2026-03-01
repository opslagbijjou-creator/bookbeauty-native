import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Container from "../../components/ui/Container";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Toast from "../../components/ui/Toast";
import { getUserRole, login } from "../../lib/authRepo";
import { registerPushTokenForUser } from "../../lib/pushRepo";
import { COLORS } from "../../lib/ui";

function getEmailError(email: string) {
  const value = email.trim();
  if (!value) return "";
  if (!value.includes("@") || !value.includes(".")) return "Vul een geldig e-mailadres in.";
  return "";
}

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const canSubmit = useMemo(() => {
    return email.trim().length > 3 && password.length >= 6 && !getEmailError(email);
  }, [email, password]);

  async function onLogin() {
    if (!canSubmit || loading) return;
    setLoading(true);
    setErrorText("");

    try {
      const user = await login(email.trim(), password);
      await registerPushTokenForUser(user.uid, { requestPermission: true }).catch(() => null);
      const role = await getUserRole(user.uid);

      if (role === "company" || role === "employee") {
        router.replace("/account" as never);
      } else if (role === "admin") {
        router.replace("/(admin)/(tabs)/index" as never);
      } else {
        router.replace("/account" as never);
      }
    } catch (error: any) {
      setErrorText(error?.message ?? "Controleer je gegevens en probeer opnieuw.");
      Alert.alert("Login mislukt", error?.message ?? "Controleer je gegevens en probeer opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Container mobilePadding={16} desktopPadding={24} desktopMaxWidth={620}>
            <View style={styles.brand}>
              <Image
                source={require("../../assets/logo/logo.png")}
                style={[styles.logo, desktop && styles.logoDesktop]}
                contentFit="contain"
              />
            </View>

            <View style={styles.header}>
              <Text style={styles.eyebrow}>BookBeauty account</Text>
              <Text style={[styles.title, !desktop && styles.titleMobile]}>
                Log in zonder uit de marketplace te vallen.
              </Text>
              <Text style={[styles.subtitle, !desktop && styles.subtitleMobile]}>
                Alleen nodig voor boeken, opslaan, volgen en updates. Browsen blijft openbaar.
              </Text>
            </View>

            <Card style={styles.card}>
              {errorText ? <Toast message={errorText} tone="danger" /> : null}

              <Input
                label="E-mail"
                value={email}
                onChangeText={setEmail}
                placeholder="naam@voorbeeld.nl"
                autoCapitalize="none"
                keyboardType="email-address"
                helperText={!getEmailError(email) ? "Gebruik het e-mailadres van je account." : getEmailError(email)}
              />
              <Input
                label="Wachtwoord"
                value={password}
                onChangeText={setPassword}
                placeholder="Minimaal 6 tekens"
                secureTextEntry
              />

              <View style={[styles.row, !desktop && styles.rowStack]}>
                <Button label="Terug" variant="secondary" onPress={() => router.back()} style={styles.button} />
                <Button
                  label={loading ? "Bezig..." : "Inloggen"}
                  onPress={() => onLogin().catch(() => null)}
                  disabled={!canSubmit || loading}
                  style={styles.button}
                />
              </View>

              <Button
                label="Nog geen account? Maak er een"
                variant="secondary"
                onPress={() => router.replace("/(auth)/register" as never)}
              />
            </Card>
          </Container>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 18,
  },
  brand: {
    alignItems: "center",
    marginBottom: 16,
  },
  logo: {
    width: 220,
    height: 56,
  },
  logoDesktop: {
    width: 250,
    height: 62,
  },
  header: {
    gap: 8,
    marginBottom: 14,
  },
  card: {
    gap: 14,
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  titleMobile: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  subtitleMobile: {
    fontSize: 13,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  rowStack: {
    flexDirection: "column",
  },
  button: {
    flex: 1,
  },
});
