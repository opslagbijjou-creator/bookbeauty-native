import React, { useMemo, useState } from "react";
import {
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
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryChips from "../../components/CategoryChips";
import { registerCompany, registerCustomer, registerInfluencer } from "../../lib/authRepo";
import { CATEGORIES, COLORS } from "../../lib/ui";

type RolePick = "customer" | "company" | "influencer";

export default function RegisterScreen() {
  const router = useRouter();

  const [role, setRole] = useState<RolePick>("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [influencerName, setInfluencerName] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [kvk, setKvk] = useState("");
  const [phone, setPhone] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    if (role === "customer") return email.trim().length > 3 && password.length >= 6;
    if (role === "influencer") {
      return email.trim().length > 3 && password.length >= 6 && influencerName.trim().length >= 2;
    }
    return (
      email.trim().length > 3 &&
      password.length >= 6 &&
      name.trim().length >= 2 &&
      city.trim().length >= 2 &&
      categories.length > 0
    );
  }, [email, password, role, influencerName, name, city, categories.length]);

  function toggleCategory(value: string) {
    setCategories((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  async function onRegister() {
    if (!canSubmit || loading) return;
    setLoading(true);

    try {
      if (role === "customer") {
        await registerCustomer(email, password);
        router.replace("/(customer)/(tabs)" as never);
      } else if (role === "influencer") {
        await registerInfluencer({
          email,
          password,
          name: influencerName.trim(),
        });
        router.replace("/(customer)/(tabs)/profile" as never);
      } else {
        await registerCompany({
          email,
          password,
          name: name.trim(),
          city: city.trim(),
          categories,
          bio: bio.trim(),
          kvk: kvk.trim(),
          phone: phone.trim(),
        });
        router.replace("/(company)/(tabs)/home" as never);
      }
    } catch (error: any) {
      Alert.alert("Registratie mislukt", error?.message ?? "Probeer het opnieuw.");
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
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.card}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles-outline" size={18} color={COLORS.primary} />
            <Text style={styles.title}>Account aanmaken</Text>
          </View>

          <View style={styles.roleRow}>
            <Pressable
              style={[styles.roleBtn, role === "customer" && styles.roleBtnActive]}
              onPress={() => setRole("customer")}
            >
              <Text style={[styles.roleText, role === "customer" && styles.roleTextActive]}>Klant</Text>
            </Pressable>
            <Pressable
              style={[styles.roleBtn, role === "company" && styles.roleBtnActive]}
              onPress={() => setRole("company")}
            >
              <Text style={[styles.roleText, role === "company" && styles.roleTextActive]}>Bedrijf</Text>
            </Pressable>
            <Pressable
              style={[styles.roleBtn, role === "influencer" && styles.roleBtnActive]}
              onPress={() => setRole("influencer")}
            >
              <Text style={[styles.roleText, role === "influencer" && styles.roleTextActive]}>Influencer</Text>
            </Pressable>
          </View>

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
            placeholder="Wachtwoord (min 6)"
            placeholderTextColor={COLORS.placeholder}
            secureTextEntry
            style={styles.input}
          />

          {role === "influencer" ? (
            <View style={styles.companyFields}>
              <TextInput
                value={influencerName}
                onChangeText={setInfluencerName}
                placeholder="Jouw creator naam"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
            </View>
          ) : null}

          {role === "company" ? (
            <View style={styles.companyFields}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Salonnaam"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="Stad"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
              <TextInput
                value={bio}
                onChangeText={setBio}
                placeholder="Korte bio"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
              <TextInput
                value={kvk}
                onChangeText={setKvk}
                placeholder="KVK (optioneel)"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Telefoon (optioneel)"
                placeholderTextColor={COLORS.placeholder}
                style={styles.input}
              />
              <Text style={styles.multiLabel}>Kies meerdere categorieen</Text>
              <CategoryChips items={[...CATEGORIES]} selectedItems={categories} multi onToggle={toggleCategory} />
            </View>
          ) : null}

          <Pressable onPress={onRegister} style={[styles.btn, (!canSubmit || loading) && styles.disabled]}>
            <Text style={styles.btnText}>{loading ? "Bezig..." : "Registreren"}</Text>
          </Pressable>

          <Pressable onPress={() => router.replace("/(auth)/login" as never)}>
            <Text style={styles.link}>Al een account? Inloggen</Text>
          </Pressable>
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
  },
  content: {
    padding: 18,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.card,
  },
  roleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  roleTextActive: {
    color: "#fff",
  },
  companyFields: {
    gap: 10,
    marginTop: 2,
  },
  multiLabel: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
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
    marginTop: 4,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.5,
  },
  link: {
    textAlign: "center",
    color: COLORS.primary,
    fontWeight: "600",
    marginTop: 6,
  },
});
