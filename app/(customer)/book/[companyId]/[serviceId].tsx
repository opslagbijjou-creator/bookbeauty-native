import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BookingSlot,
  createBooking,
  formatDateLabel,
  getDateKeysFromToday,
  getCompanyBookingSettings,
  listAvailableBookingSlots,
} from "../../../../lib/bookingRepo";
import { fetchCompanyById } from "../../../../lib/companyRepo";
import { auth } from "../../../../lib/firebase";
import { fetchCompanyServiceById } from "../../../../lib/serviceRepo";
import { COLORS } from "../../../../lib/ui";

export default function BookServiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId: string; serviceId: string }>();
  const companyId = typeof params.companyId === "string" ? params.companyId : "";
  const serviceId = typeof params.serviceId === "string" ? params.serviceId : "";
  const uid = auth.currentUser?.uid ?? null;

  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [service, setService] = useState<Awaited<ReturnType<typeof fetchCompanyServiceById>>>(null);
  const [enabled, setEnabled] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(false);

  const [dateKeys] = useState(() => getDateKeysFromToday(10));
  const [selectedDate, setSelectedDate] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.key === selectedSlotKey) ?? null,
    [slots, selectedSlotKey]
  );
  const canBook = Boolean(uid && service && selectedSlot && customerName.trim().length > 1 && customerPhone.trim().length > 4);

  useEffect(() => {
    if (!companyId || !serviceId) return;
    let mounted = true;
    setLoading(true);

    Promise.all([fetchCompanyById(companyId), fetchCompanyServiceById(companyId, serviceId), getCompanyBookingSettings(companyId)])
      .then(([company, serviceData, settings]) => {
        if (!mounted) return;
        setCompanyName(company?.name ?? "Salon");
        setService(serviceData);
        setEnabled(settings.enabled);
        setAutoConfirm(settings.autoConfirm);
        const firstDate = dateKeys[0] ?? "";
        setSelectedDate(firstDate);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companyId, serviceId, dateKeys]);

  useEffect(() => {
    if (!uid) return;
    const email = auth.currentUser?.email ?? "";
    if (!email) return;
    const fallbackName = email.split("@")[0];
    setCustomerName((prev) => (prev.trim().length ? prev : fallbackName));
  }, [uid]);

  useEffect(() => {
    if (!selectedDate || !service || !enabled) {
      setSlots([]);
      setSelectedSlotKey("");
      return;
    }

    let mounted = true;
    setSlotsLoading(true);
    listAvailableBookingSlots({
      companyId,
      bookingDate: selectedDate,
      serviceDurationMin: service.durationMin,
      bufferBeforeMin: service.bufferBeforeMin,
      bufferAfterMin: service.bufferAfterMin,
      capacity: service.capacity,
    })
      .then((rows) => {
        if (!mounted) return;
        setSlots(rows);
        setSelectedSlotKey("");
      })
      .finally(() => {
        if (!mounted) return;
        setSlotsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companyId, selectedDate, service, enabled]);

  async function onSubmit() {
    if (!uid || !service || !selectedSlot || !canBook || submitting) return;
    setSubmitting(true);
    try {
      const result = await createBooking({
        companyId,
        serviceId: service.id,
        customerId: uid,
        customerName,
        customerPhone,
        customerEmail: auth.currentUser?.email ?? "",
        note,
        startAtMs: selectedSlot.startAtMs,
      });

      const confirmed = result.status === "confirmed";
      Alert.alert(
        "Gelukt",
        confirmed
          ? "Je boeking is direct bevestigd."
          : "Je boeking is geplaatst en wacht op goedkeuring."
      );
      router.replace("/(customer)/(tabs)/bookings" as never);
    } catch (error: any) {
      Alert.alert("Boeken mislukt", error?.message ?? "Kon boeking niet opslaan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Terug</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !service ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Dienst niet gevonden.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroOverline}>{companyName}</Text>
            <Text style={styles.heroTitle}>Boek {service.name}</Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaPill}>
                <Ionicons name="time-outline" size={12} color={COLORS.primary} />
                <Text style={styles.heroMetaText}>{service.durationMin} min</Text>
              </View>
              <View style={styles.heroMetaPill}>
                <Ionicons name="cash-outline" size={12} color={COLORS.primary} />
                <Text style={styles.heroMetaText}>EUR {service.price}</Text>
              </View>
            </View>
          </View>

          {!enabled ? (
            <View style={styles.disabledCard}>
              <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.disabledText}>
                Deze salon heeft online boeken tijdelijk uitgeschakeld.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.flowCard}>
                <Ionicons name={autoConfirm ? "checkmark-circle-outline" : "hourglass-outline"} size={16} color={COLORS.primary} />
                <Text style={styles.flowText}>
                  {autoConfirm
                    ? "Deze salon bevestigt boekingen automatisch."
                    : "Deze salon werkt met goedkeuring: status start als in afwachting."}
                </Text>
              </View>

              <View style={styles.card}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Kies een datum</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                  {dateKeys.map((key) => {
                    const active = key === selectedDate;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setSelectedDate(key)}
                        style={[styles.dateChip, active && styles.dateChipActive]}
                      >
                        <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>{formatDateLabel(key)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.card}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="grid-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Beschikbare tijden</Text>
                </View>

                {slotsLoading ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : slots.length ? (
                  <View style={styles.slotGrid}>
                    {slots.map((slot) => {
                      const active = selectedSlotKey === slot.key;
                      return (
                        <Pressable
                          key={slot.key}
                          style={[styles.slotBtn, active && styles.slotBtnActive]}
                          onPress={() => setSelectedSlotKey(slot.key)}
                        >
                          <Text style={[styles.slotText, active && styles.slotTextActive]}>{slot.label}</Text>
                          <Text style={[styles.slotCapacity, active && styles.slotCapacityActive]}>
                            {slot.remainingCapacity}/{slot.totalCapacity} vrij
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>Geen tijden beschikbaar op deze dag.</Text>
                )}
              </View>

              <View style={styles.card}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="person-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Jouw gegevens</Text>
                </View>

                <TextInput
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Naam"
                  placeholderTextColor={COLORS.placeholder}
                  style={styles.input}
                />
                <TextInput
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="Telefoonnummer"
                  placeholderTextColor={COLORS.placeholder}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Opmerking (optioneel)"
                  placeholderTextColor={COLORS.placeholder}
                  style={[styles.input, styles.noteInput]}
                  multiline
                />

                <Pressable
                  onPress={onSubmit}
                  disabled={!canBook || submitting}
                  style={[styles.bookBtn, (!canBook || submitting) && styles.bookBtnDisabled]}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  <Text style={styles.bookBtnText}>{submitting ? "Boeken..." : "Boek nu"}</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  backText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    gap: 10,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 12,
    gap: 6,
  },
  heroOverline: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  heroMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroMetaText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  disabledCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f0bfcf",
    backgroundColor: "#ffeef4",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowText: {
    color: COLORS.text,
    fontWeight: "700",
    flex: 1,
    fontSize: 12,
  },
  disabledText: {
    color: COLORS.danger,
    fontWeight: "700",
    flex: 1,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
  },
  dateRow: {
    gap: 8,
    paddingVertical: 2,
  },
  dateChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dateChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  dateChipTextActive: {
    color: "#fff",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotBtn: {
    width: "31%",
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  slotBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  slotText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },
  slotTextActive: {
    color: COLORS.primary,
  },
  slotCapacity: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  slotCapacityActive: {
    color: COLORS.primary,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
  },
  noteInput: {
    minHeight: 74,
    textAlignVertical: "top",
  },
  bookBtn: {
    marginTop: 2,
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  bookBtnDisabled: {
    opacity: 0.45,
  },
  bookBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
});
