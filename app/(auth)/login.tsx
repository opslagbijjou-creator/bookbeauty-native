import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
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

      if (role === "company") {
        router.replace("/(company)/(tabs)/home" as never);
      } else if (role === "employee") {
        router.replace("/(company)/(tabs)/bookings" as never);
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
          <View style={styles.brand}>
            <Image source={require("../../assets/logo/logo.png")} style={styles.logo} contentFit="contain" />
          </View>

          <Card style={styles.card}>
            <Text style={styles.eyebrow}>Inloggen</Text>
            <Text style={styles.title}>Open je account zonder de marketplace te verlaten.</Text>
            <Text style={styles.subtitle}>
              Je hebt alleen een account nodig voor boeken, opslaan, volgen en je eigen dashboard.
            </Text>

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

            <View style={styles.row}>
              <Button label="Terug" variant="secondary" onPress={() => router.back()} style={styles.button} />
              <Button
                label={loading ? "Bezig..." : "Inloggen"}
                onPress={() => onLogin().catch(() => null)}
                disabled={!canSubmit || loading}
                style={styles.button}
              />
            </View>

            <Button label="Nog geen account? Maak er een" variant="secondary" onPress={() => router.replace("/(auth)/register" as never)} />
          </Card>
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
    padding: 18,
    gap: 18,
  },
  brand: {
    alignItems: "center",
  },
  logo: {
    width: 170,
    height: 44,
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
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
  },
});
