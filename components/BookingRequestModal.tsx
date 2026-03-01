import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { auth } from "../lib/firebase";
import { getDateKeysFromToday, listAvailableBookingSlots } from "../lib/bookingRepo";
import { MarketplaceSalon, MarketplaceService, formatCurrency } from "../lib/marketplace";
import { createPublicBookingRequest } from "../lib/publicBookingRepo";
import { COLORS, RADII } from "../lib/ui";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Chip from "./ui/Chip";
import Input from "./ui/Input";
import Sheet from "./ui/Sheet";
import Tabs from "./ui/Tabs";
import Toast from "./ui/Toast";

type BookingRequestModalProps = {
  visible: boolean;
  salon: MarketplaceSalon;
  service: MarketplaceService | null;
  onClose: () => void;
};

type BookingMode = "guest" | "account";

const TOTAL_STEPS = 4;

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const date = new Date(year, Math.max(0, month - 1), day);
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function buildDemoTimes(): string[] {
  return ["10:00", "11:30", "13:30", "15:00", "17:00"];
}

export default function BookingRequestModal({
  visible,
  salon,
  service,
  onClose,
}: BookingRequestModalProps) {
  const router = useRouter();
  const defaultMode: BookingMode = auth.currentUser?.uid ? "account" : "guest";
  const dateOptions = useMemo(() => getDateKeysFromToday(6), []);

  const [step, setStep] = useState(1);
  const [bookingMode, setBookingMode] = useState<BookingMode>(defaultMode);
  const [selectedService, setSelectedService] = useState<MarketplaceService | null>(service);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0] || "");
  const [selectedTime, setSelectedTime] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [email, setEmail] = useState(auth.currentUser?.email || "");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ bookingId: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setBookingMode(auth.currentUser?.uid ? "account" : "guest");
    setSelectedService(service || salon.services[0] || null);
    setSelectedDate(dateOptions[0] || "");
    setSelectedTime("");
    setErrorText("");
    setConfirmation(null);
    setEmail(auth.currentUser?.email || "");
    setGuestName("");
    setPhone("");
    setNote("");
    setConsentAccepted(false);
  }, [visible, service, salon.services, dateOptions]);

  useEffect(() => {
    if (!visible || !selectedDate || !selectedService) return;

    if (salon.isDemo) {
      setSlotsLoading(false);
      setAvailableTimes(buildDemoTimes());
      return;
    }

    const companyId = salon.sourceCompanyId || salon.id;
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedTime("");

    listAvailableBookingSlots({
      companyId,
      bookingDate: selectedDate,
      serviceDurationMin: Math.max(15, Number(selectedService.durationMin || 30)),
      capacity: 1,
    })
      .then((slots) => {
        if (cancelled) return;
        const nextTimes = slots
          .map((slot) => String(slot.label).split("-")[0]?.trim())
          .filter((value): value is string => Boolean(value));
        setAvailableTimes(nextTimes);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableTimes([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSlotsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, selectedDate, selectedService, salon.id, salon.isDemo, salon.sourceCompanyId]);

  const canContinueFromService = Boolean(selectedService);
  const canContinueFromSchedule = Boolean(selectedDate && selectedTime);
  const canContinueFromDetails =
    email.trim().length > 4 &&
    guestName.trim().length > 1 &&
    consentAccepted &&
    (bookingMode === "guest" || Boolean(auth.currentUser?.uid));

  function onNext() {
    setErrorText("");
    if (step === 1 && !canContinueFromService) return;
    if (step === 2 && !canContinueFromSchedule) return;
    if (step === 3 && !canContinueFromDetails) return;
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  function onBack() {
    if (step === 1) {
      onClose();
      return;
    }
    setStep((current) => Math.max(1, current - 1));
  }

  async function onSubmit() {
    if (!selectedService || !selectedDate || !selectedTime || submitting) return;

    if (bookingMode === "account" && !auth.currentUser?.uid) {
      router.push("/(auth)/login" as never);
      return;
    }

    setSubmitting(true);
    setErrorText("");

    try {
      const result = await createPublicBookingRequest({
        companyId: salon.sourceCompanyId || salon.id,
        companyName: salon.name,
        companyLogoUrl: salon.logoUrl,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        serviceCategory: selectedService.categoryLabel,
        servicePrice: selectedService.price,
        serviceDurationMin: selectedService.durationMin,
        email,
        requestedDate: selectedDate,
        requestedTime: selectedTime,
        customerUid: bookingMode === "account" ? auth.currentUser?.uid || undefined : undefined,
        customerName: guestName.trim(),
        customerPhone: phone.trim(),
        consentAccepted,
        note,
      });

      setConfirmation({ bookingId: result.bookingId });
    } catch (error: any) {
      setErrorText(error?.message ?? "Boekingsaanvraag kon niet worden verstuurd.");
    } finally {
      setSubmitting(false);
    }
  }

  function onOpenBookingOverview() {
    if (!confirmation) return;
    onClose();

    if (auth.currentUser?.uid) {
      router.push("/(customer)/(tabs)/bookings" as never);
      return;
    }

    const query = `bookingId=${encodeURIComponent(confirmation.bookingId)}&email=${encodeURIComponent(email.trim())}`;
    router.push(`/booking-status?${query}` as never);
  }

  if (!selectedService) return null;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.grabber} />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>Boeken zonder betaling</Text>
          <Text style={styles.title}>{salon.name}</Text>
        </View>

        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={COLORS.text} />
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
          const active = index + 1 <= step || Boolean(confirmation);
          return <View key={index} style={[styles.progressStep, active && styles.progressStepActive]} />;
        })}
      </View>

      {confirmation ? (
        <View style={styles.confirmationWrap}>
          <Card>
            <View style={styles.confirmationInner}>
              <Ionicons name="checkmark-circle" size={30} color={COLORS.success} />
              <Text style={styles.confirmationTitle}>Boekingsaanvraag verstuurd</Text>
              <Text style={styles.confirmationText}>
                De salon kan nu accepteren, afwijzen of een nieuw tijdstip voorstellen. Je aanvraag staat in het systeem.
              </Text>
              <Button label="Open mijn boekingen" onPress={onOpenBookingOverview} />
            </View>
          </Card>
        </View>
      ) : (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {step === 1 ? (
              <View style={styles.stepBlock}>
                <Text style={styles.stepTitle}>1. Kies je behandeling</Text>
                <Text style={styles.stepText}>Selecteer eerst de dienst die je wilt aanvragen.</Text>
                <View style={styles.stack}>
                  {salon.services.map((item) => {
                    const active = selectedService?.id === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setSelectedService(item)}
                        style={[styles.optionRow, active && styles.optionRowActive]}
                      >
                        <View style={styles.optionCopy}>
                          <Text style={styles.optionName}>{item.name}</Text>
                          <Text style={styles.optionMeta}>
                            {formatCurrency(item.price)} • {item.durationMin} min
                          </Text>
                        </View>
                        <Ionicons
                          name={active ? "radio-button-on" : "radio-button-off"}
                          size={20}
                          color={active ? COLORS.accent : COLORS.muted}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {step === 2 ? (
              <View style={styles.stepBlock}>
                <Text style={styles.stepTitle}>2. Kies datum en tijd</Text>
                <Text style={styles.stepText}>Bekijk de komende week en kies een beschikbaar moment.</Text>

                <Text style={styles.fieldLabel}>Komende dagen</Text>
                <View style={styles.rowWrap}>
                  {dateOptions.map((item) => (
                    <Chip
                      key={item}
                      label={formatDateLabel(item)}
                      active={item === selectedDate}
                      onPress={() => setSelectedDate(item)}
                    />
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Beschikbare tijden</Text>
                {slotsLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={COLORS.text} />
                    <Text style={styles.loadingText}>Beschikbaarheid laden</Text>
                  </View>
                ) : (
                  <View style={styles.rowWrap}>
                    {availableTimes.length ? (
                      availableTimes.map((item) => (
                        <Chip
                          key={item}
                          label={item}
                          active={item === selectedTime}
                          onPress={() => setSelectedTime(item)}
                        />
                      ))
                    ) : (
                      <Toast message="Geen tijden beschikbaar voor deze dag." />
                    )}
                  </View>
                )}
              </View>
            ) : null}

            {step === 3 ? (
              <View style={styles.stepBlock}>
                <Text style={styles.stepTitle}>3. Jouw gegevens</Text>
                <Text style={styles.stepText}>Boek als gast of gebruik je account als je die al hebt.</Text>

                <Tabs
                  items={["Gast", "Account"]}
                  active={bookingMode === "guest" ? "Gast" : "Account"}
                  onChange={(value) => setBookingMode(value === "Gast" ? "guest" : "account")}
                />

                {bookingMode === "account" && !auth.currentUser?.uid ? (
                  <Card>
                    <View style={styles.infoStack}>
                      <Text style={styles.optionName}>Log in om met je account te boeken</Text>
                      <Text style={styles.stepText}>
                        Zonder login kun je direct verder als gast met alleen je gegevens.
                      </Text>
                      <View style={styles.actionSplit}>
                        <Button label="Ga naar login" onPress={() => router.push("/(auth)/login" as never)} />
                        <Button label="Ga verder als gast" variant="secondary" onPress={() => setBookingMode("guest")} />
                      </View>
                    </View>
                  </Card>
                ) : (
                  <View style={styles.stack}>
                    <Input
                      label="Naam"
                      value={guestName}
                      onChangeText={setGuestName}
                      placeholder="Jouw voor- en achternaam"
                    />
                    <Input
                      label="E-mail"
                      value={email}
                      onChangeText={setEmail}
                      placeholder="naam@voorbeeld.nl"
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                    <Input
                      label="Telefoon (optioneel)"
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="06..."
                      keyboardType="phone-pad"
                    />
                    <Input
                      label="Opmerking (optioneel)"
                      value={note}
                      onChangeText={setNote}
                      placeholder="Extra info voor de salon"
                      multiline
                      style={styles.noteInput}
                    />

                    <Pressable onPress={() => setConsentAccepted((current) => !current)} style={styles.checkboxRow}>
                      <View style={[styles.checkbox, consentAccepted && styles.checkboxActive]}>
                        {consentAccepted ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                      </View>
                      <Text style={styles.checkboxText}>
                        Ik ga akkoord met de privacy- en boekingsvoorwaarden voor deze aanvraag.
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            {step === 4 ? (
              <View style={styles.stepBlock}>
                <Text style={styles.stepTitle}>4. Controleer en bevestig</Text>
                <Text style={styles.stepText}>Geen betaling. Je verstuurt alleen een aanvraag naar de salon.</Text>

                <Card>
                  <View style={styles.summaryStack}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Salon</Text>
                      <Text style={styles.summaryValue}>{salon.name}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Dienst</Text>
                      <Text style={styles.summaryValue}>{selectedService.name}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Moment</Text>
                      <Text style={styles.summaryValue}>
                        {formatDateLabel(selectedDate)} • {selectedTime}
                      </Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Prijs</Text>
                      <Text style={styles.summaryValue}>{formatCurrency(selectedService.price)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Manier</Text>
                      <Text style={styles.summaryValue}>{bookingMode === "guest" ? "Gast" : "Account"}</Text>
                    </View>
                  </View>
                </Card>

                {errorText ? <Toast message={errorText} tone="danger" /> : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Button label={step === 1 ? "Sluiten" : "Vorige"} variant="secondary" onPress={onBack} style={styles.footerButton} />

            {step < 4 ? (
              <Button label="Volgende" onPress={onNext} style={styles.footerButton} />
            ) : (
              <Button
                label={submitting ? "Versturen..." : "Bevestig aanvraag"}
                onPress={() => onSubmit().catch(() => null)}
                disabled={submitting}
                style={styles.footerButton}
              />
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grabber: {
    width: 44,
    height: 5,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
    alignSelf: "center",
  },
  header: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  progressRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  progressStep: {
    flex: 1,
    height: 6,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.border,
  },
  progressStepActive: {
    backgroundColor: COLORS.accent,
  },
  scroll: {
    marginTop: 14,
  },
  content: {
    paddingBottom: 12,
  },
  stepBlock: {
    gap: 14,
  },
  stepTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  stepText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  stack: {
    gap: 12,
  },
  optionRow: {
    minHeight: 76,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  optionRowActive: {
    borderColor: "rgba(215,138,169,0.35)",
    backgroundColor: COLORS.accentSoft,
  },
  optionCopy: {
    flex: 1,
    gap: 4,
  },
  optionName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  optionMeta: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  fieldLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  loadingRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  infoStack: {
    gap: 10,
  },
  actionSplit: {
    gap: 10,
  },
  noteInput: {
    minHeight: 92,
    textAlignVertical: "top",
    paddingTop: 14,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkboxText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  summaryStack: {
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryValue: {
    flex: 1,
    textAlign: "right",
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  footer: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
  },
  footerButton: {
    flex: 1,
  },
  confirmationWrap: {
    marginTop: 20,
    paddingBottom: 8,
  },
  confirmationInner: {
    gap: 12,
    alignItems: "flex-start",
  },
  confirmationTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  confirmationText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
});
