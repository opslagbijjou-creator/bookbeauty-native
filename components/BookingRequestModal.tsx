import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { auth } from "../lib/firebase";
import { getDateKeysFromToday, listAvailableBookingSlots } from "../lib/bookingRepo";
import { MarketplaceSalon, MarketplaceService } from "../lib/marketplace";
import { createPublicBookingRequest } from "../lib/publicBookingRepo";
import { COLORS } from "../lib/ui";

type BookingRequestModalProps = {
  visible: boolean;
  salon: MarketplaceSalon;
  service: MarketplaceService | null;
  onClose: () => void;
};

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
  return ["10:00", "12:30", "15:00", "17:30"];
}

export default function BookingRequestModal({
  visible,
  salon,
  service,
  onClose,
}: BookingRequestModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState(auth.currentUser?.email || "");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [errorText, setErrorText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ bookingId: string } | null>(null);

  const dateOptions = useMemo(() => getDateKeysFromToday(6), []);

  useEffect(() => {
    if (!visible) return;
    setErrorText("");
    setConfirmation(null);
    setSelectedDate((current) => current || dateOptions[0] || "");
    setSelectedTime("");
  }, [visible, dateOptions]);

  useEffect(() => {
    if (!visible || !selectedDate || !service) return;

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
      serviceDurationMin: Math.max(15, Number(service.durationMin || 30)),
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
  }, [visible, selectedDate, service, salon.id, salon.isDemo, salon.sourceCompanyId]);

  async function onBookAsGuest() {
    if (!service || !selectedDate || !selectedTime || submitting) return;
    setSubmitting(true);
    setErrorText("");

    try {
      const result = await createPublicBookingRequest({
        companyId: salon.sourceCompanyId || salon.id,
        companyName: salon.name,
        companyLogoUrl: salon.logoUrl,
        serviceId: service.id,
        serviceName: service.name,
        serviceCategory: service.categoryLabel,
        servicePrice: service.price,
        serviceDurationMin: service.durationMin,
        email,
        requestedDate: selectedDate,
        requestedTime: selectedTime,
        customerUid: auth.currentUser?.uid || undefined,
      });

      setConfirmation({ bookingId: result.bookingId });
    } catch (error: any) {
      setErrorText(error?.message ?? "Boeking plaatsen mislukt.");
    } finally {
      setSubmitting(false);
    }
  }

  function onGoToLogin() {
    onClose();
    router.push("/(auth)/login" as never);
  }

  function onOpenStatus() {
    if (!confirmation) return;
    onClose();
    const query = `bookingId=${encodeURIComponent(confirmation.bookingId)}&email=${encodeURIComponent(email.trim())}`;
    router.push(`/booking-status?${query}` as never);
  }

  if (!service) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>Boek direct</Text>
              <Text style={styles.title}>{service.name}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={COLORS.text} />
            </Pressable>
          </View>

          {confirmation ? (
            <View style={styles.confirmationCard}>
              <Ionicons name="checkmark-circle" size={28} color={COLORS.success} />
              <Text style={styles.confirmationTitle}>Aanvraag ontvangen</Text>
              <Text style={styles.confirmationText}>
                We hebben je boekingsverzoek opgeslagen. De salon kan nu accepteren, afwijzen of een nieuw tijdstip voorstellen.
              </Text>
              <Pressable onPress={onOpenStatus} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Bekijk status</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <View style={styles.heroBlock}>
                <Text style={styles.heroTitle}>Kies hoe je wilt boeken</Text>
                <Text style={styles.heroText}>
                  Gast boeken vraagt alleen je e-mail. Een account blijft optioneel.
                </Text>
              </View>

              <View style={styles.optionCard}>
                <Text style={styles.optionTitle}>Optie 1</Text>
                <Text style={styles.optionHeading}>Boek als gast (alleen e-mail)</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="naam@voorbeeld.nl"
                  placeholderTextColor={COLORS.muted}
                  style={styles.input}
                />

                <Text style={styles.fieldLabel}>Datum</Text>
                <View style={styles.chipsWrap}>
                  {dateOptions.map((item) => {
                    const active = item === selectedDate;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => setSelectedDate(item)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {formatDateLabel(item)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Tijd</Text>
                {slotsLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={COLORS.primary} />
                    <Text style={styles.loadingText}>Beschikbare tijden laden</Text>
                  </View>
                ) : (
                  <View style={styles.chipsWrap}>
                    {availableTimes.length ? (
                      availableTimes.map((item) => {
                        const active = item === selectedTime;
                        return (
                          <Pressable
                            key={item}
                            onPress={() => setSelectedTime(item)}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                          </Pressable>
                        );
                      })
                    ) : (
                      <Text style={styles.emptyText}>Geen tijden beschikbaar voor deze dag.</Text>
                    )}
                  </View>
                )}

                {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

                <Pressable
                  onPress={() => onBookAsGuest().catch(() => null)}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (pressed || submitting) && styles.primaryBtnPressed,
                  ]}
                  disabled={submitting}
                >
                  <Text style={styles.primaryBtnText}>
                    {submitting ? "Aanvraag verzenden..." : "Verstuur boekingsaanvraag"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.optionCard}>
                <Text style={styles.optionTitle}>Optie 2</Text>
                <Text style={styles.optionHeading}>Login / Account aanmaken</Text>
                <Text style={styles.optionText}>
                  Gebruik je account als je favorieten wilt bewaren of je boekingen in je dashboard wilt zien.
                </Text>
                <Pressable onPress={onGoToLogin} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Ga naar login</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12,20,31,0.44)",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    maxHeight: Platform.OS === "web" ? 760 : "88%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 24,
    marginTop: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    gap: 16,
    paddingBottom: 4,
  },
  heroBlock: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  heroTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
  },
  heroText: {
    color: COLORS.muted,
    lineHeight: 20,
  },
  optionCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    gap: 12,
    shadowColor: "#102544",
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  optionTitle: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  optionHeading: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
  },
  optionText: {
    color: COLORS.muted,
    lineHeight: 20,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  fieldLabel: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  chipText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextActive: {
    color: "#ffffff",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "600",
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 13,
  },
  primaryBtn: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryBtnPressed: {
    transform: [{ scale: 0.98 }],
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  confirmationCard: {
    alignItems: "flex-start",
    gap: 12,
    padding: 8,
  },
  confirmationTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 22,
  },
  confirmationText: {
    color: COLORS.muted,
    lineHeight: 21,
  },
});
