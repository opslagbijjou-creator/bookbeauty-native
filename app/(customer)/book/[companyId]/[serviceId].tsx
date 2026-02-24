import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
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
import { getUserRole, subscribeAuth } from "../../../../lib/authRepo";
import {
  BookingSlot,
  createBooking,
  formatDateLabel,
  getCompanyBookingSettings,
  getDateKeysFromToday,
  listAvailableBookingSlots,
} from "../../../../lib/bookingRepo";
import { fetchCompanyById } from "../../../../lib/companyRepo";
import { auth } from "../../../../lib/firebase";
import { fetchCompanyServiceById } from "../../../../lib/serviceRepo";
import { fetchPublicCompanyStaff, PublicStaffMember } from "../../../../lib/staffRepo";
import { COLORS } from "../../../../lib/ui";

const LOOKAHEAD_DAYS = 28;
const DAYS_PER_WEEK = 7;
const BLUE = {
  primary: "#2b6dff",
  soft: "#eef4ff",
  surface: "#f7faff",
  border: "#d7e3ff",
};

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = String(dateKey).split("-").map((value) => Number(value));
  return new Date(year, Math.max(0, month - 1), day);
}

function formatWeekdayShort(dateKey: string): string {
  return parseDateKey(dateKey)
    .toLocaleDateString("nl-NL", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
}

function formatDayNumber(dateKey: string): string {
  const day = parseDateKey(dateKey).getDate();
  return String(day);
}

function formatMonthShort(dateKey: string): string {
  return parseDateKey(dateKey)
    .toLocaleDateString("nl-NL", { month: "short" })
    .replace(".", "")
    .toUpperCase();
}

function formatWeekRange(week: string[]): string {
  if (!week.length) return "";
  const start = parseDateKey(week[0]);
  const end = parseDateKey(week[week.length - 1]);

  const startLabel = start.toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
  const endLabel = end.toLocaleDateString("nl-NL", { day: "2-digit", month: "short" });
  return `${startLabel} - ${endLabel}`;
}

function splitSlotLabel(label: string): { start: string; end: string } {
  const parts = String(label).split("-").map((item) => item.trim());
  return {
    start: parts[0] ?? "--:--",
    end: parts[1] ?? "--:--",
  };
}

function showBookingMessage(title: string, message: string): void {
  if (Platform.OS === "web") {
    const win = globalThis as { alert?: (text: string) => void };
    if (typeof win.alert === "function") {
      win.alert(`${title}\n\n${message}`);
      return;
    }
  }
  Alert.alert(title, message);
}

async function createMollieCheckoutForBooking(
  bookingId: string,
  amountCents: number
): Promise<string> {
  const cleanBookingId = String(bookingId || "").trim();
  if (!cleanBookingId) {
    throw new Error("bookingId ontbreekt voor betaling.");
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Je sessie is verlopen. Log opnieuw in.");
  }

  const idToken = await currentUser.getIdToken().catch(() => "");
  if (!idToken) {
    throw new Error("Kon geen geldige sessie vinden voor betaling.");
  }

  const res = await fetch("/.netlify/functions/mollie-create-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      bookingId: cleanBookingId,
      amountCents: Math.max(0, Math.floor(Number(amountCents) || 0)),
    }),
  }).catch(() => null);

  if (!res) {
    throw new Error("Geen verbinding met betaalserver.");
  }

  const payload = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || payload.ok !== true) {
    const errorMessage = String(payload.error || "").trim();
    throw new Error(errorMessage || "Kon Mollie betaling niet starten.");
  }

  const checkoutUrl = String(payload.checkoutUrl || "").trim();
  if (!checkoutUrl) {
    throw new Error("Mollie checkout URL ontbreekt.");
  }

  return checkoutUrl;
}

async function openExternalCheckout(checkoutUrl: string): Promise<void> {
  if (Platform.OS === "web") {
    const win = globalThis as {
      location?: { assign?: (href: string) => void; href?: string };
      open?: (url?: string, target?: string) => void;
    };
    if (typeof win.location?.assign === "function") {
      win.location.assign(checkoutUrl);
      return;
    }
    if (win.location) {
      win.location.href = checkoutUrl;
      return;
    }
    if (typeof win.open === "function") {
      win.open(checkoutUrl, "_self");
      return;
    }
  }
  await Linking.openURL(checkoutUrl);
}

export default function BookServiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId: string; serviceId: string; refPostId?: string }>();
  const companyId = typeof params.companyId === "string" ? params.companyId : "";
  const serviceId = typeof params.serviceId === "string" ? params.serviceId : "";
  const refPostId = typeof params.refPostId === "string" ? params.refPostId.trim() : "";
  const hasReferralFromVideo = Boolean(refPostId);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [authReady, setAuthReady] = useState(Boolean(auth.currentUser));
  const [userRole, setUserRole] = useState<"customer" | "company" | "employee" | "influencer" | "admin" | null>(null);

  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [service, setService] = useState<Awaited<ReturnType<typeof fetchCompanyServiceById>>>(null);
  const [staffMembers, setStaffMembers] = useState<PublicStaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [autoConfirm, setAutoConfirm] = useState(false);

  const dateKeys = useMemo(() => getDateKeysFromToday(LOOKAHEAD_DAYS), []);
  const weekPages = useMemo(() => {
    const pages: string[][] = [];
    for (let i = 0; i < dateKeys.length; i += DAYS_PER_WEEK) {
      pages.push(dateKeys.slice(i, i + DAYS_PER_WEEK));
    }
    return pages;
  }, [dateKeys]);

  const [weekIndex, setWeekIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const slotAnim = useRef(new Animated.Value(1)).current;

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.key === selectedSlotKey) ?? null,
    [slots, selectedSlotKey]
  );
  const selectedStaff = useMemo(
    () => staffMembers.find((member) => member.id === selectedStaffId) ?? null,
    [staffMembers, selectedStaffId]
  );
  const bookingBlockedForRole = Boolean(uid && userRole !== null && userRole !== "customer");
  const canBook = Boolean(
    uid &&
      userRole === "customer" &&
      service &&
      selectedStaff &&
      selectedSlot &&
      customerName.trim().length > 1 &&
      customerPhone.trim().length > 4
  );

  const visibleWeek = weekPages[weekIndex] ?? [];
  const canPrevWeek = weekIndex > 0;
  const canNextWeek = weekIndex < weekPages.length - 1;

  useEffect(() => {
    const unsub = subscribeAuth((user) => {
      setUid(user?.uid ?? null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!companyId || !serviceId) return;
    let mounted = true;
    setLoading(true);

    Promise.all([
      fetchCompanyById(companyId),
      fetchCompanyServiceById(companyId, serviceId),
      getCompanyBookingSettings(companyId),
    ])
      .then(([company, serviceData, settings]) => {
        if (!mounted) return;
        const nextCompanyName = company?.name ?? "Salon";
        setCompanyName(nextCompanyName);
        setService(serviceData);
        setEnabled(settings.enabled);
        setAutoConfirm(settings.autoConfirm);
        const firstDate = dateKeys[0] ?? "";
        setSelectedDate(firstDate);
        setWeekIndex(0);

        fetchPublicCompanyStaff(companyId, nextCompanyName)
          .then((members) => {
            if (!mounted) return;
            setStaffMembers(members);
            setSelectedStaffId((current) => {
              if (current && members.some((member) => member.id === current)) return current;
              return members[0]?.id ?? companyId;
            });
          })
          .catch(() => {
            if (!mounted) return;
            const fallbackMember: PublicStaffMember = {
              id: companyId,
              companyId,
              displayName: nextCompanyName,
              isActive: true,
              isOwner: true,
            };
            setStaffMembers([fallbackMember]);
            setSelectedStaffId(companyId);
          });
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn("[customer/book] initial load failed", error);
        setCompanyName("Salon");
        setService(null);
        setEnabled(false);
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
    if (!uid) {
      setUserRole(null);
      return;
    }
    getUserRole(uid)
      .then((role) => setUserRole((role as "customer" | "company" | "employee" | "influencer" | "admin") ?? null))
      .catch(() => setUserRole(null));
  }, [uid]);

  useEffect(() => {
    if (!authReady) return;

    if (!uid || !selectedDate || !service || !enabled || !selectedStaffId || bookingBlockedForRole) {
      setSlots([]);
      setSelectedSlotKey("");
      return;
    }

    let mounted = true;
    setSlotsLoading(true);

    listAvailableBookingSlots({
      companyId,
      staffId: selectedStaffId,
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
      .catch((error: any) => {
        if (!mounted) return;
        setSlots([]);
        setSelectedSlotKey("");
        Alert.alert("Tijden laden mislukt", error?.message ?? "Kon beschikbare tijden niet ophalen.");
      })
      .finally(() => {
        if (!mounted) return;
        setSlotsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [authReady, uid, companyId, selectedDate, selectedStaffId, service, enabled, bookingBlockedForRole]);

  useEffect(() => {
    if (!selectedDate) return;
    const idx = weekPages.findIndex((page) => page.includes(selectedDate));
    if (idx >= 0 && idx !== weekIndex) {
      setWeekIndex(idx);
    }
  }, [selectedDate, weekIndex, weekPages]);

  useEffect(() => {
    slotAnim.setValue(0.35);
    Animated.timing(slotAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedDate, slotsLoading, slots.length, slotAnim]);

  async function onSubmit() {
    if (!uid) {
      Alert.alert("Login vereist", "Log in om een afspraak te boeken.");
      return;
    }
    if (userRole !== "customer") {
      Alert.alert("Niet beschikbaar", "Dit accounttype kan geen afspraak boeken.");
      return;
    }
    if (!service || !selectedStaff || !selectedSlot || !canBook || submitting) return;
    setSubmitting(true);
    const amountCents = Math.max(0, Math.round(Number(service.price || 0) * 100));
    let createdBookingId = "";
    try {
      const result = await createBooking({
        companyId,
        serviceId: service.id,
        staffId: selectedStaff.id,
        staffName: selectedStaff.displayName,
        customerId: uid,
        customerName,
        customerPhone,
        customerEmail: auth.currentUser?.email ?? "",
        note,
        startAtMs: selectedSlot.startAtMs,
        referralPostId: refPostId || undefined,
      });
      createdBookingId = result.bookingId;
      const checkoutUrl = await createMollieCheckoutForBooking(result.bookingId, amountCents);
      await openExternalCheckout(checkoutUrl);
    } catch (error: any) {
      const fallbackMessage = error?.message ?? "Kon boeking of betaling niet starten.";
      if (createdBookingId) {
        showBookingMessage(
          "Boeking geplaatst, betaling niet gestart",
          `${fallbackMessage}\n\nOpen je boekingen om deze afspraak opnieuw te betalen.`
        );
        router.replace(
          `/(customer)/(tabs)/bookings?bookingId=${encodeURIComponent(createdBookingId)}` as never
        );
      } else {
        showBookingMessage("Boeken mislukt", fallbackMessage);
      }
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : !service ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Dienst niet gevonden.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          >
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
                <Ionicons
                  name={autoConfirm ? "checkmark-circle-outline" : "hourglass-outline"}
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={styles.flowText}>
                  {autoConfirm
                    ? "Deze salon bevestigt boekingen automatisch."
                    : "Deze salon werkt met goedkeuring: status start als in afwachting."}
                </Text>
              </View>

              {hasReferralFromVideo ? (
                <View style={styles.referralCard}>
                  <Ionicons name="megaphone-outline" size={15} color={BLUE.primary} />
                  <Text style={styles.referralText}>
                    Je boekt via een creator video. Eventuele influencer commissie wordt automatisch gekoppeld.
                  </Text>
                </View>
              ) : null}

              {!uid ? (
                <View style={styles.loginCard}>
                  <Ionicons name="log-in-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.loginText}>Log in om dit tijdslot te kunnen boeken.</Text>
                </View>
              ) : bookingBlockedForRole ? (
                <View style={styles.disabledCard}>
                  <Ionicons name="lock-closed-outline" size={16} color={COLORS.danger} />
                  <Text style={styles.disabledText}>Alleen klantaccounts kunnen een afspraak boeken.</Text>
                </View>
              ) : null}

              <View style={styles.card}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="people-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Kies je medewerker</Text>
                </View>
                <View style={styles.staffGrid}>
                  {staffMembers.map((member) => {
                    const active = member.id === selectedStaffId;
                    return (
                      <Pressable
                        key={member.id}
                        style={[styles.staffChip, active && styles.staffChipActive]}
                        onPress={() => setSelectedStaffId(member.id)}
                      >
                        <Ionicons
                          name={member.isOwner ? "ribbon-outline" : "person-outline"}
                          size={13}
                          color={active ? "#fff" : COLORS.primary}
                        />
                        <Text style={[styles.staffChipText, active && styles.staffChipTextActive]}>
                          {member.displayName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.calendarCard}>
                <View style={styles.calendarTopRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Kies je moment</Text>
                    <Text style={styles.calendarRangeText}>{formatWeekRange(visibleWeek)}</Text>
                  </View>

                  <View style={styles.calendarNavRow}>
                    <Pressable
                      style={[styles.calendarNavBtn, !canPrevWeek && styles.calendarNavBtnDisabled]}
                      onPress={() => setWeekIndex((prev) => Math.max(0, prev - 1))}
                      disabled={!canPrevWeek}
                    >
                      <Ionicons name="chevron-back" size={14} color={canPrevWeek ? BLUE.primary : "#8aa7ea"} />
                    </Pressable>
                    <Pressable
                      style={[styles.calendarNavBtn, !canNextWeek && styles.calendarNavBtnDisabled]}
                      onPress={() => setWeekIndex((prev) => Math.min(weekPages.length - 1, prev + 1))}
                      disabled={!canNextWeek}
                    >
                      <Ionicons name="chevron-forward" size={14} color={canNextWeek ? BLUE.primary : "#8aa7ea"} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.weekRow}>
                  {visibleWeek.map((dateKey) => {
                    const active = dateKey === selectedDate;
                    return (
                      <Pressable
                        key={dateKey}
                        style={[styles.dayCard, active && styles.dayCardActive]}
                        onPress={() => setSelectedDate(dateKey)}
                      >
                        <Text style={[styles.dayWeekLabel, active && styles.dayWeekLabelActive]}>
                          {formatWeekdayShort(dateKey)}
                        </Text>
                        <Text style={[styles.dayNumber, active && styles.dayNumberActive]}>
                          {formatDayNumber(dateKey)}
                        </Text>
                        <Text style={[styles.dayMonth, active && styles.dayMonthActive]}>
                          {formatMonthShort(dateKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="calendar-number-outline" size={16} color={BLUE.primary} />
                  <Text style={styles.sectionTitle}>Beschikbare tijden ({formatDateLabel(selectedDate)})</Text>
                </View>

                {slotsLoading ? (
                  <View style={styles.slotsLoadingWrap}>
                    <ActivityIndicator color={BLUE.primary} />
                  </View>
                ) : slots.length ? (
                  <Animated.View
                    style={{
                      opacity: slotAnim,
                      transform: [
                        {
                          translateY: slotAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [10, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <View style={styles.slotGrid}>
                      {slots.map((slot) => {
                        const active = selectedSlotKey === slot.key;
                        const times = splitSlotLabel(slot.label);
                        return (
                          <Pressable
                            key={slot.key}
                            style={[styles.slotBtn, active && styles.slotBtnActive]}
                            onPress={() => setSelectedSlotKey(slot.key)}
                          >
                            <Text style={[styles.slotStartText, active && styles.slotStartTextActive]}>
                              {times.start}
                            </Text>
                            <Text style={[styles.slotEndText, active && styles.slotEndTextActive]}>
                              tot {times.end}
                            </Text>

                            <View style={styles.slotFootRow}>
                              <Ionicons
                                name="people-outline"
                                size={12}
                                color={active ? BLUE.primary : COLORS.muted}
                              />
                              <Text style={[styles.slotCapacity, active && styles.slotCapacityActive]}>
                                {slot.remainingCapacity}/{slot.totalCapacity} vrij
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Animated.View>
                ) : (
                  <View style={styles.emptySlotCard}>
                    <Ionicons name="moon-outline" size={16} color={COLORS.muted} />
                    <Text style={styles.emptySlotText}>
                      Geen beschikbare tijden op deze dag. Kies een andere dag in de kalender.
                    </Text>
                  </View>
                )}

                {selectedSlot ? (
                  <View style={styles.selectedSlotCard}>
                    <Ionicons name="checkmark-circle" size={15} color={BLUE.primary} />
                    <Text style={styles.selectedSlotText}>Gekozen tijd: {selectedSlot.label}</Text>
                  </View>
                ) : null}
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
                  placeholderTextColor="#4d4d4d"
                  style={styles.input}
                />
                <TextInput
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  placeholder="Telefoonnummer"
                  placeholderTextColor="#4d4d4d"
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Opmerking (optioneel)"
                  placeholderTextColor="#4d4d4d"
                  style={[styles.input, styles.noteInput]}
                  multiline
                />

                <Pressable
                  onPress={onSubmit}
                  disabled={!canBook || submitting}
                  style={[styles.bookBtn, (!canBook || submitting) && styles.bookBtnDisabled]}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                  )}
                  <Text style={styles.bookBtnText}>{submitting ? "Boeken..." : "Boek nu"}</Text>
                </Pressable>
              </View>
            </>
          )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
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
  calendarCard: {
    backgroundColor: BLUE.soft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BLUE.border,
    padding: 12,
    gap: 10,
  },
  calendarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  calendarRangeText: {
    color: "#4f6cae",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  calendarNavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarNavBtnDisabled: {
    opacity: 0.5,
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dayCard: {
    flex: 1,
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 8,
  },
  dayCardActive: {
    backgroundColor: BLUE.primary,
    borderColor: BLUE.primary,
  },
  dayWeekLabel: {
    color: "#6989ca",
    fontSize: 10,
    fontWeight: "800",
  },
  dayWeekLabelActive: {
    color: "#dce8ff",
  },
  dayNumber: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26,
  },
  dayNumberActive: {
    color: "#fff",
  },
  dayMonth: {
    color: "#688acb",
    fontSize: 10,
    fontWeight: "800",
  },
  dayMonthActive: {
    color: "#dce8ff",
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
  referralCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#edf4ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  referralText: {
    color: BLUE.primary,
    fontWeight: "700",
    fontSize: 12,
    flex: 1,
  },
  loginCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loginText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
    flex: 1,
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
  staffGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  staffChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  staffChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  staffChipText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  staffChipTextActive: {
    color: "#fff",
  },
  slotsLoadingWrap: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 9,
  },
  slotBtn: {
    width: "48%",
    minHeight: 74,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  slotBtnActive: {
    borderColor: BLUE.primary,
    backgroundColor: BLUE.surface,
  },
  slotStartText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  slotStartTextActive: {
    color: BLUE.primary,
  },
  slotEndText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  slotEndTextActive: {
    color: "#4e72bc",
  },
  slotFootRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slotCapacity: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  slotCapacityActive: {
    color: BLUE.primary,
  },
  emptySlotCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 90,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptySlotText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  selectedSlotCard: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: BLUE.soft,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectedSlotText: {
    color: "#355cae",
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
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
