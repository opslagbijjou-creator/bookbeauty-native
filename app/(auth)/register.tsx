import React, { useMemo, useState } from "react";
import {
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
import { registerCompany, registerCustomer } from "../../lib/authRepo";
import { registerPushTokenForUser } from "../../lib/pushRepo";
import { addMyService } from "../../lib/serviceRepo";
import { CATEGORIES, COLORS, RADII } from "../../lib/ui";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Chip from "../../components/ui/Chip";
import Input from "../../components/ui/Input";
import Tabs from "../../components/ui/Tabs";
import Toast from "../../components/ui/Toast";

type SignupMode = "customer" | "company";

type DraftService = {
  name: string;
  category: string;
  price: number;
  durationMin: number;
};

const COMPANY_STEPS = [
  "Basis",
  "Contact",
  "Diensten",
  "Media",
  "Openingstijden",
  "Check",
] as const;

const SERVICE_TEMPLATES: Record<string, DraftService[]> = {
  Kapper: [
    { name: "Knippen", category: "Kapper", price: 35, durationMin: 45 },
    { name: "Fohnen", category: "Kapper", price: 28, durationMin: 35 },
    { name: "Kleuren", category: "Kapper", price: 65, durationMin: 90 },
  ],
  Nagels: [
    { name: "BIAB set", category: "Nagels", price: 49, durationMin: 70 },
    { name: "Gel polish", category: "Nagels", price: 32, durationMin: 40 },
  ],
  Wimpers: [
    { name: "One by one set", category: "Wimpers", price: 59, durationMin: 70 },
    { name: "Lash lift", category: "Wimpers", price: 45, durationMin: 45 },
  ],
  Wenkbrauwen: [
    { name: "Brow shape", category: "Wenkbrauwen", price: 28, durationMin: 30 },
    { name: "Brow lamination", category: "Wenkbrauwen", price: 49, durationMin: 50 },
  ],
  "Make-up": [
    { name: "Dag make-up", category: "Make-up", price: 55, durationMin: 45 },
    { name: "Event glam", category: "Make-up", price: 85, durationMin: 75 },
  ],
  Huid: [
    { name: "Glow facial", category: "Huid", price: 64, durationMin: 55 },
    { name: "Diepe reiniging", category: "Huid", price: 72, durationMin: 60 },
  ],
  Massage: [
    { name: "Ontspanningsmassage", category: "Massage", price: 68, durationMin: 60 },
    { name: "Nek en schouders", category: "Massage", price: 42, durationMin: 35 },
  ],
  Beauty: [
    { name: "Beauty consult", category: "Beauty", price: 25, durationMin: 25 },
    { name: "Fresh up treatment", category: "Beauty", price: 48, durationMin: 45 },
  ],
};

export default function RegisterScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const [mode, setMode] = useState<SignupMode>("company");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successText, setSuccessText] = useState("");
  const [errorText, setErrorText] = useState("");

  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPassword, setCustomerPassword] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [services, setServices] = useState<DraftService[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [introVideoUrl, setIntroVideoUrl] = useState("");
  const [openingHoursNote, setOpeningHoursNote] = useState("");
  const [bio, setBio] = useState("");

  const templateOptions = useMemo(
    () =>
      categories.flatMap((category) => SERVICE_TEMPLATES[category] ?? []).filter((item, index, list) => {
        const key = `${item.category}:${item.name}`;
        return list.findIndex((row) => `${row.category}:${row.name}` === key) === index;
      }),
    [categories]
  );

  const canNextCompany = useMemo(() => {
    if (step === 0) return companyName.trim().length > 1 && city.trim().length > 1 && categories.length > 0;
    if (step === 1) return email.trim().length > 4 && password.length >= 6;
    if (step === 2) return services.length > 0;
    if (step === 3) return true;
    if (step === 4) return openingHoursNote.trim().length > 3;
    return true;
  }, [step, companyName, city, categories.length, email, password, services.length, openingHoursNote]);

  function toggleCategory(value: string) {
    setCategories((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));
  }

  function toggleServiceTemplate(item: DraftService) {
    const key = `${item.category}:${item.name}`;
    setServices((prev) => {
      const exists = prev.some((service) => `${service.category}:${service.name}` === key);
      if (exists) {
        return prev.filter((service) => `${service.category}:${service.name}` !== key);
      }
      return [...prev, item];
    });
  }

  async function onRegisterCustomer() {
    if (loading) return;
    setLoading(true);
    setErrorText("");

    try {
      const user = await registerCustomer(customerEmail, customerPassword);
      const pushResult = await registerPushTokenForUser(user.uid, { requestPermission: true }).catch(() => null);
      if (pushResult && pushResult.ok !== true) {
        setSuccessText("Account is aangemaakt. Push notificaties zijn nog niet volledig ingesteld.");
      } else {
        setSuccessText("Je account is klaar. Je blijft in de marketplace en kunt nu boeken en favorieten bewaren.");
      }
      router.replace("/account" as never);
    } catch (error: any) {
      setErrorText(error?.message ?? "Registratie mislukt.");
    } finally {
      setLoading(false);
    }
  }

  async function onRegisterCompany() {
    if (loading) return;
    setLoading(true);
    setErrorText("");
    setSuccessText("");

    try {
      const user = await registerCompany({
        email,
        password,
        name: companyName.trim(),
        city: city.trim(),
        categories,
        bio: bio.trim(),
        address: address.trim(),
        phone: phone.trim(),
        instagram: instagram.trim(),
        coverImageUrl: coverImageUrl.trim(),
        introVideoUrl: introVideoUrl.trim(),
        openingHoursNote: openingHoursNote.trim(),
      });

      if (services.length) {
        await Promise.all(
          services.map((service) =>
            addMyService(user.uid, {
              name: service.name,
              category: service.category,
              description: "",
              price: service.price,
              durationMin: service.durationMin,
              bufferBeforeMin: 0,
              bufferAfterMin: 0,
              capacity: 1,
              isActive: true,
              photoUrls: [],
            })
          )
        );
      }

      await registerPushTokenForUser(user.uid, { requestPermission: true }).catch(() => null);
      setSuccessText("Je salon is aangemaakt en staat direct live in ontdekken.");
      router.replace("/account" as never);
    } catch (error: any) {
      setErrorText(error?.message ?? "Aanmelden mislukt.");
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
          <Container mobilePadding={16} desktopPadding={24} desktopMaxWidth={760}>
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
                {mode === "company" ? "Meld je salon aan in een paar rustige stappen." : "Maak je account aan wanneer je wilt boeken."}
              </Text>
              <Text style={[styles.subtitle, !desktop && styles.subtitleMobile]}>
                {mode === "company"
                  ? "Een rustige onboarding waarmee je salon direct zichtbaar kan worden."
                  : "Browsen blijft openbaar. Alleen nodig voor boekingen, favorieten en updates."}
              </Text>
            </View>

            <Tabs
              items={["Salon aanmelden", "Klant account"]}
              active={mode === "company" ? "Salon aanmelden" : "Klant account"}
              onChange={(value) => {
                setMode(value === "Salon aanmelden" ? "company" : "customer");
                setStep(0);
                setErrorText("");
                setSuccessText("");
              }}
            />

            {errorText ? <Toast message={errorText} tone="danger" /> : null}
            {successText ? <Toast message={successText} tone="success" /> : null}

            {mode === "customer" ? (
              <Card style={styles.card}>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Klant account</Text>
                  <Input
                    label="E-mail"
                    value={customerEmail}
                    onChangeText={setCustomerEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="naam@voorbeeld.nl"
                  />
                  <Input
                    label="Wachtwoord"
                    value={customerPassword}
                    onChangeText={setCustomerPassword}
                    secureTextEntry
                    placeholder="Minimaal 6 tekens"
                  />
                </View>

                <View style={[styles.footerRow, !desktop && styles.footerRowStack]}>
                  <Button label="Inloggen" variant="secondary" onPress={() => router.replace("/(auth)/login" as never)} style={styles.footerButton} />
                  <Button label={loading ? "Bezig..." : "Account maken"} onPress={() => onRegisterCustomer().catch(() => null)} style={styles.footerButton} />
                </View>
              </Card>
            ) : (
              <Card style={styles.card}>
              <View style={styles.stepHeader}>
                {COMPANY_STEPS.map((label, index) => {
                  const active = index <= step;
                  return <View key={label} style={[styles.stepPill, active && styles.stepPillActive]} />;
                })}
              </View>

              <Text style={styles.sectionTitle}>
                {step + 1}. {COMPANY_STEPS[step]}
              </Text>

              {step === 0 ? (
                <View style={styles.section}>
                  <Input label="Salonnaam" value={companyName} onChangeText={setCompanyName} placeholder="Bijv. Glow Studio Rotterdam" />
                  <Input label="Stad" value={city} onChangeText={setCity} placeholder="Rotterdam" />
                  <Input label="Adres" value={address} onChangeText={setAddress} placeholder="Straat en huisnummer" />
                  <Text style={styles.label}>Categorieen</Text>
                  <View style={styles.wrap}>
                    {CATEGORIES.map((item) => (
                      <Chip key={item} label={item} active={categories.includes(item)} onPress={() => toggleCategory(item)} />
                    ))}
                  </View>
                </View>
              ) : null}

              {step === 1 ? (
                <View style={styles.section}>
                  <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                  <Input label="Wachtwoord" value={password} onChangeText={setPassword} secureTextEntry />
                  <Input label="Telefoon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  <Input label="Instagram (optioneel)" value={instagram} onChangeText={setInstagram} placeholder="@jouwsalon" />
                </View>
              ) : null}

              {step === 2 ? (
                <View style={styles.section}>
                  <Text style={styles.helper}>
                    Kies snelle dienst-templates. Deze verschijnen direct in je profiel en kunnen later altijd worden aangepast.
                  </Text>
                  <View style={styles.wrap}>
                    {templateOptions.length ? (
                      templateOptions.map((item) => {
                        const key = `${item.category}:${item.name}`;
                        const active = services.some((service) => `${service.category}:${service.name}` === key);
                        return (
                          <Chip
                            key={key}
                            label={`${item.name} · ${item.category}`}
                            active={active}
                            onPress={() => toggleServiceTemplate(item)}
                          />
                        );
                      })
                    ) : (
                      <Toast message="Kies eerst een of meer categorieen bij de eerste stap." />
                    )}
                  </View>
                  <View style={styles.serviceList}>
                    {services.map((item) => (
                      <View key={`${item.category}:${item.name}`} style={styles.serviceRow}>
                        <Text style={styles.serviceName}>{item.name}</Text>
                        <Text style={styles.serviceMeta}>
                          {item.category} • vanaf EUR {item.price}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {step === 3 ? (
                <View style={styles.section}>
                  <Input label="Coverfoto URL (optioneel)" value={coverImageUrl} onChangeText={setCoverImageUrl} placeholder="https://..." />
                  <Input label="Intro video URL (optioneel)" value={introVideoUrl} onChangeText={setIntroVideoUrl} placeholder="https://..." />
                  <Text style={styles.helper}>
                    Je kunt media later ook vanuit je dashboard uploaden en vervangen.
                  </Text>
                </View>
              ) : null}

              {step === 4 ? (
                <View style={styles.section}>
                  <Input
                    label="Openingstijden / beschikbaarheid"
                    value={openingHoursNote}
                    onChangeText={setOpeningHoursNote}
                    placeholder="Ma-vr 09:00-18:00, za 10:00-16:00"
                  />
                  <Input
                    label="Korte beschrijving"
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Waar sta je om bekend?"
                    multiline
                    style={styles.multiline}
                  />
                </View>
              ) : null}

              {step === 5 ? (
                <View style={styles.section}>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Salon</Text>
                    <Text style={styles.reviewValue}>{companyName || "-"}</Text>
                  </View>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Stad</Text>
                    <Text style={styles.reviewValue}>{city || "-"}</Text>
                  </View>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Categorieen</Text>
                    <Text style={styles.reviewValue}>{categories.join(", ") || "-"}</Text>
                  </View>
                  <View style={styles.reviewRow}>
                    <Text style={styles.reviewLabel}>Diensten</Text>
                    <Text style={styles.reviewValue}>{services.length}</Text>
                  </View>
                  <Text style={styles.helper}>
                    Na verzenden staat je salon direct live met de huidige regels. Je kunt daarna alles verder verfijnen in het dashboard.
                  </Text>
                </View>
              ) : null}

              <View style={[styles.footerRow, !desktop && styles.footerRowStack]}>
                <Button
                  label={step === 0 ? "Terug" : "Vorige"}
                  variant="secondary"
                  onPress={() => {
                    if (step === 0) {
                      router.back();
                      return;
                    }
                    setStep((current) => Math.max(0, current - 1));
                  }}
                  style={styles.footerButton}
                />
                {step < COMPANY_STEPS.length - 1 ? (
                  <Button
                    label="Volgende"
                    onPress={() => {
                      if (!canNextCompany) return;
                      setStep((current) => Math.min(COMPANY_STEPS.length - 1, current + 1));
                    }}
                    disabled={!canNextCompany}
                    style={styles.footerButton}
                  />
                ) : (
                  <Button
                    label={loading ? "Verzenden..." : "Salon aanmaken"}
                    onPress={() => onRegisterCompany().catch(() => null)}
                    disabled={loading}
                    style={styles.footerButton}
                  />
                )}
              </View>
              </Card>
            )}
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
    paddingVertical: 18,
    gap: 16,
  },
  brand: {
    alignItems: "center",
    marginBottom: 14,
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
    marginBottom: 2,
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
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  titleMobile: {
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  subtitleMobile: {
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    gap: 16,
  },
  stepHeader: {
    flexDirection: "row",
    gap: 8,
  },
  stepPill: {
    flex: 1,
    height: 6,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
  },
  stepPillActive: {
    backgroundColor: COLORS.accent,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  label: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  helper: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceList: {
    gap: 8,
  },
  serviceRow: {
    minHeight: 56,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
    gap: 3,
    backgroundColor: COLORS.surface,
  },
  serviceName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  serviceMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  reviewLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  reviewValue: {
    flex: 1,
    textAlign: "right",
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
  },
  footerRowStack: {
    flexDirection: "column",
  },
  footerButton: {
    flex: 1,
  },
});
