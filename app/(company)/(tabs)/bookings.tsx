import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
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
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  acceptBooking,
  Booking,
  BookingSlot,
  BookingStatus,
  fetchCompanyBookingSlotsForDate,
  fetchEmployeeBookings,
  fetchBookings,
  formatDateKey,
  proposeBookingTimeByCompany,
  rejectBooking,
  respondToCustomerRescheduleByCompany,
  subscribeEmployeeBookings,
  subscribeBookings,
} from "../../../lib/bookingRepo";
import { getUserRole } from "../../../lib/authRepo";
import { auth } from "../../../lib/firebase";
import { getEmployeeCompanyId } from "../../../lib/staffRepo";
import { COLORS } from "../../../lib/ui";

type CalendarViewMode = "day" | "week" | "month";
type CalendarFilter = "active" | "all";

type DayCounts = {
  total: number;
  pending: number;
  proposed: number;
  reschedulePending: number;
  confirmed: number;
  declined: number;
  cancelled: number;
};

type MonthCell = {
  key: string;
  inCurrentMonth: boolean;
};

const BLUE = {
  primary: "#2d6cff",
  soft: "#edf3ff",
  surface: "#f6f9ff",
  border: "#d6e3ff",
  text: "#244f9e",
};
const DAY_ROW_HEIGHT = 64;

function statusLabel(status: BookingStatus): string {
  if (status === "pending") return "Aanvraag";
  if (status === "proposed_by_company") return "Wacht op klant";
  if (status === "pending_reschedule_approval") return "Verplaatsen?";
  if (status === "confirmed") return "Geaccepteerd";
  if (status === "declined") return "Geweigerd";
  if (status === "cancelled_with_fee") return "Geannuleerd (fee)";
  if (status === "cancelled_by_customer") return "Geannuleerd";
  return "Status";
}

function statusPalette(status: BookingStatus): { bg: string; text: string; border: string } {
  if (status === "pending") return { bg: "#fff4df", text: "#9a6600", border: "#f1d29a" };
  if (status === "proposed_by_company") return { bg: "#e8f0ff", text: "#2a5fcf", border: "#c6d8ff" };
  if (status === "pending_reschedule_approval") return { bg: "#eaf6ff", text: "#0f6d99", border: "#c7e8fa" };
  if (status === "confirmed") return { bg: "#e6f7ec", text: "#1f7a3f", border: "#b6e3c2" };
  if (status === "declined") return { bg: "#ffedf1", text: "#c63957", border: "#f7c8d4" };
  if (status === "cancelled_with_fee") return { bg: "#fff1e8", text: "#af552a", border: "#f3d2be" };
  if (status === "cancelled_by_customer") return { bg: "#f4f4f4", text: "#6b6b6b", border: "#d8d8d8" };
  return { bg: "#f4f4f4", text: "#6b6b6b", border: "#d8d8d8" };
}

function formatDateTime(ms: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(ms: number): string {
  if (!ms) return "--:--";
  return new Date(ms).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatTimeRange(startAtMs: number, endAtMs: number): string {
  return `${formatTime(startAtMs)} - ${formatTime(endAtMs)}`;
}

function toFriendlyError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Er ging iets mis. Probeer opnieuw.";
}

function sortByStart(items: Booking[]): Booking[] {
  return [...items].sort((a, b) => a.startAtMs - b.startAtMs);
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = String(dateKey).split("-").map((value) => Number(value));
  return new Date(year, Math.max(0, month - 1), day);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const d = parseDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

function startOfWeekKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return formatDateKey(d);
}

function weekKeysForDate(dateKey: string): string[] {
  const startKey = startOfWeekKey(dateKey);
  return Array.from({ length: 7 }, (_, idx) => addDaysToDateKey(startKey, idx));
}

function monthStartKey(dateKey: string): string {
  const d = parseDateKey(dateKey);
  d.setDate(1);
  return formatDateKey(d);
}

function shiftMonthKey(dateKey: string, delta: number): string {
  const d = parseDateKey(monthStartKey(dateKey));
  d.setMonth(d.getMonth() + delta, 1);
  return formatDateKey(d);
}

function weekdayLabelShort(dateKey: string): string {
  return parseDateKey(dateKey)
    .toLocaleDateString("nl-NL", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
}

function monthTitle(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
  });
}

function dateChipLabel(dateKey: string): string {
  const today = formatDateKey(new Date());
  if (dateKey === today) return "Vandaag";
  if (dateKey === addDaysToDateKey(today, 1)) return "Morgen";
  return parseDateKey(dateKey).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function buildMonthCells(cursorKey: string): MonthCell[] {
  const monthStart = parseDateKey(monthStartKey(cursorKey));
  const monthIndex = monthStart.getMonth();
  const mondayOffset = (monthStart.getDay() + 6) % 7;

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, idx) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + idx);
    return {
      key: formatDateKey(d),
      inCurrentMonth: d.getMonth() === monthIndex,
    };
  });
}

function minutesFromMs(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function toHourLabel(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function createEmptyCounts(): DayCounts {
  return {
    total: 0,
    pending: 0,
    proposed: 0,
    reschedulePending: 0,
    confirmed: 0,
    declined: 0,
    cancelled: 0,
  };
}

type BookingSectionProps = {
  title: string;
  items: Booking[];
  emptyText: string;
  busyBookingId: string | null;
  onAccept: (booking: Booking) => void;
  onReject: (booking: Booking) => void;
  onPropose: (booking: Booking) => void;
  onSelect?: (booking: Booking) => void;
};

function BookingSection({
  title,
  items,
  emptyText,
  busyBookingId,
  onAccept,
  onReject,
  onPropose,
  onSelect,
}: BookingSectionProps) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionCountPill}>
          <Text style={styles.sectionCountText}>{items.length}</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.sectionEmptyWrap}>
          <Text style={styles.sectionEmptyText}>{emptyText}</Text>
        </View>
      ) : (
        <View style={styles.sectionList}>
          {items.map((booking) => {
            const palette = statusPalette(booking.status);
            const isPending = booking.status === "pending";
            const isReschedulePending = booking.status === "pending_reschedule_approval";
            const needsDecision = isPending || isReschedulePending;
            const isBusy = busyBookingId === booking.id;

            return (
              <Pressable key={booking.id} style={styles.bookingCard} onPress={() => onSelect?.(booking)}>
                <View style={styles.bookingTop}>
                  <Text style={styles.bookingService} numberOfLines={1}>
                    {booking.serviceName}
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: palette.bg,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.statusPillText, { color: palette.text }]}>{statusLabel(booking.status)}</Text>
                  </View>
                </View>

                <Text style={styles.bookingMeta}>{booking.customerName}</Text>
                <Text style={styles.bookingMeta}>Medewerker: {booking.staffName}</Text>
                <Text style={styles.bookingMeta}>{formatDateTime(booking.startAtMs)}</Text>

                {booking.status === "proposed_by_company" && booking.proposedStartAtMs ? (
                  <View style={styles.proposalPreview}>
                    <Ionicons name="time-outline" size={13} color={BLUE.primary} />
                    <Text style={styles.proposalPreviewText}>
                      Voorgesteld: {formatDateTime(booking.proposedStartAtMs)}
                    </Text>
                  </View>
                ) : null}
                {booking.status === "proposed_by_company" && booking.proposalNote ? (
                  <View style={styles.proposalNoteCard}>
                    <Ionicons name="chatbubble-ellipses-outline" size={13} color="#3861bf" />
                    <Text style={styles.proposalNoteText}>{booking.proposalNote}</Text>
                  </View>
                ) : null}

                {needsDecision ? (
                  <View style={styles.pendingActionsRow}>
                    <Pressable
                      style={[styles.acceptBtn, isBusy && styles.disabled]}
                      onPress={() => onAccept(booking)}
                      disabled={isBusy}
                    >
                      <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                      <Text style={styles.acceptBtnText}>
                        {isReschedulePending ? "Akkoord verplaatsen" : "Accepteren"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.rejectBtn, isBusy && styles.disabled]}
                      onPress={() => onReject(booking)}
                      disabled={isBusy}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                      <Text style={styles.rejectBtnText}>
                        {isReschedulePending ? "Afwijzen" : "Weigeren"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {isPending ? (
                  <Pressable
                    style={[styles.proposeBtn, isBusy && styles.disabled]}
                    onPress={() => onPropose(booking)}
                    disabled={isBusy}
                  >
                    <Ionicons name="swap-horizontal-outline" size={14} color={BLUE.primary} />
                    <Text style={styles.proposeBtnText}>Nieuwe tijd kiezen + bericht</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

type StateCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  loading?: boolean;
  ctaLabel?: string;
  onPressCta?: () => void;
};

function StateCard({ icon, title, description, loading, ctaLabel, onPressCta }: StateCardProps) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIconWrap}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>

      {loading ? <ActivityIndicator color={COLORS.primary} style={styles.stateSpinner} /> : null}

      {ctaLabel && onPressCta ? (
        <Pressable style={styles.stateCtaBtn} onPress={onPressCta}>
          <Ionicons name="refresh" size={14} color={COLORS.primary} />
          <Text style={styles.stateCtaText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function BookingDashboardScreen() {
  const viewerId = auth.currentUser?.uid ?? null;
  const [viewerRole, setViewerRole] = useState<"company" | "employee">("company");
  const [businessId, setBusinessId] = useState<string | null>(viewerId);
  const [roleResolved, setRoleResolved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [proposeModalBooking, setProposeModalBooking] = useState<Booking | null>(null);
  const [proposeDate, setProposeDate] = useState<string>(formatDateKey(new Date()));
  const [proposeSlots, setProposeSlots] = useState<BookingSlot[]>([]);
  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [selectedProposedStartAtMs, setSelectedProposedStartAtMs] = useState<number | null>(null);
  const [proposalNote, setProposalNote] = useState("");

  const [calendarView, setCalendarView] = useState<CalendarViewMode>("day");
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>("active");
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => formatDateKey(new Date()));
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const calendarAnim = useRef(new Animated.Value(1)).current;

  const actionRequiredBookings = useMemo(
    () =>
      sortByStart(
        bookings.filter((row) => row.status === "pending" || row.status === "pending_reschedule_approval")
      ),
    [bookings]
  );
  const waitingCustomerBookings = useMemo(
    () => sortByStart(bookings.filter((row) => row.status === "proposed_by_company")),
    [bookings]
  );
  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return sortByStart(bookings.filter((row) => row.status === "confirmed" && row.startAtMs >= now));
  }, [bookings]);
  const rejectedBookings = useMemo(() => sortByStart(bookings.filter((row) => row.status === "declined")), [bookings]);
  const cancelledBookings = useMemo(
    () =>
      sortByStart(bookings.filter((row) => row.status === "cancelled_by_customer" || row.status === "cancelled_with_fee")),
    [bookings]
  );

  const pendingCount = actionRequiredBookings.length;

  const filteredCalendarBookings = useMemo(() => {
    if (calendarFilter === "all") return bookings;
    return bookings.filter(
      (booking) =>
        booking.status === "pending" ||
        booking.status === "pending_reschedule_approval" ||
        booking.status === "proposed_by_company" ||
        booking.status === "confirmed"
    );
  }, [bookings, calendarFilter]);

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    filteredCalendarBookings.forEach((booking) => {
      if (!map[booking.bookingDate]) {
        map[booking.bookingDate] = [];
      }
      map[booking.bookingDate].push(booking);
    });
    Object.keys(map).forEach((dateKey) => {
      map[dateKey] = sortByStart(map[dateKey]);
    });
    return map;
  }, [filteredCalendarBookings]);

  const countsByDate = useMemo(() => {
    const map: Record<string, DayCounts> = {};

    bookings.forEach((booking) => {
      if (!map[booking.bookingDate]) {
        map[booking.bookingDate] = createEmptyCounts();
      }

      const next = map[booking.bookingDate];
      next.total += 1;
      if (booking.status === "pending") next.pending += 1;
      if (booking.status === "proposed_by_company") next.proposed += 1;
      if (booking.status === "pending_reschedule_approval") next.reschedulePending += 1;
      if (booking.status === "confirmed") next.confirmed += 1;
      if (booking.status === "declined") next.declined += 1;
      if (booking.status === "cancelled_by_customer" || booking.status === "cancelled_with_fee") next.cancelled += 1;
    });

    return map;
  }, [bookings]);

  const selectedDayBookings = useMemo(() => sortByStart(bookingsByDate[selectedDate] ?? []), [bookingsByDate, selectedDate]);

  const selectedBooking = useMemo(
    () => bookings.find((row) => row.id === selectedBookingId) ?? null,
    [bookings, selectedBookingId]
  );

  const weekKeys = useMemo(() => weekKeysForDate(selectedDate), [selectedDate]);
  const monthCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const timelineBounds = useMemo(() => {
    let startMin = 8 * 60;
    let endMin = 21 * 60;

    selectedDayBookings.forEach((booking) => {
      const bookingStart = minutesFromMs(booking.startAtMs);
      const bookingEnd = minutesFromMs(booking.endAtMs);
      startMin = Math.min(startMin, Math.max(0, bookingStart - 30));
      endMin = Math.max(endMin, Math.min(24 * 60, bookingEnd + 30));
    });

    startMin = Math.max(0, Math.floor(startMin / 30) * 30);
    endMin = Math.min(24 * 60, Math.ceil(endMin / 30) * 30);

    if (endMin - startMin < 180) {
      endMin = Math.min(24 * 60, startMin + 180);
    }

    return { startMin, endMin };
  }, [selectedDayBookings]);

  const timelineHeight = useMemo(
    () => Math.max(260, ((timelineBounds.endMin - timelineBounds.startMin) / 60) * DAY_ROW_HEIGHT),
    [timelineBounds]
  );

  const hourMarks = useMemo(() => {
    const rows: number[] = [];
    for (let minute = timelineBounds.startMin; minute <= timelineBounds.endMin; minute += 60) {
      rows.push(minute);
    }
    return rows;
  }, [timelineBounds]);

  const hasBookings = bookings.length > 0;
  const totalIncome = useMemo(
    () =>
      bookings
        .filter((booking) => booking.status === "confirmed")
        .reduce((sum, booking) => sum + Number(booking.servicePrice ?? 0), 0),
    [bookings]
  );
  const thisMonthIncome = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return bookings
      .filter((booking) => {
        if (booking.status !== "confirmed") return false;
        const d = new Date(booking.startAtMs);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .reduce((sum, booking) => sum + Number(booking.servicePrice ?? 0), 0);
  }, [bookings]);

  const retry = useCallback(() => {
    setReloadTick((value) => value + 1);
  }, []);

  const openProposeModal = useCallback((booking: Booking) => {
    const todayKey = formatDateKey(new Date());
    const startDate = booking.bookingDate >= todayKey ? booking.bookingDate : todayKey;
    setProposeModalBooking(booking);
    setProposeDate(startDate);
    setProposeSlots([]);
    setProposeError(null);
    setSelectedProposedStartAtMs(null);
    setProposalNote(booking.proposalNote ?? "");
  }, []);

  const closeProposeModal = useCallback(() => {
    setProposeModalBooking(null);
    setProposeSlots([]);
    setProposeError(null);
    setSelectedProposedStartAtMs(null);
    setProposalNote("");
  }, []);

  const proposeDateOptions = useMemo(() => {
    if (!proposeModalBooking) return [];
    const todayKey = formatDateKey(new Date());
    const startDate = proposeModalBooking.bookingDate >= todayKey ? proposeModalBooking.bookingDate : todayKey;
    return Array.from({ length: 7 }, (_, idx) => addDaysToDateKey(startDate, idx));
  }, [proposeModalBooking]);

  useEffect(() => {
    if (!viewerId) {
      setViewerRole("company");
      setBusinessId(null);
      setRoleResolved(true);
      return;
    }

    let mounted = true;
    setRoleResolved(false);

    getUserRole(viewerId)
      .then(async (role) => {
        if (!mounted) return;
        if (role === "employee") {
          setViewerRole("employee");
          const employeeCompanyId = await getEmployeeCompanyId(viewerId);
          if (!mounted) return;
          setBusinessId(employeeCompanyId);
          setRoleResolved(true);
          return;
        }
        setViewerRole("company");
        setBusinessId(viewerId);
        setRoleResolved(true);
      })
      .catch(() => {
        if (!mounted) return;
        setViewerRole("company");
        setBusinessId(viewerId);
        setRoleResolved(true);
      });

    return () => {
      mounted = false;
    };
  }, [viewerId]);

  useEffect(() => {
    if (!roleResolved) {
      setLoading(true);
      return;
    }
    if (!viewerId) {
      setLoading(false);
      setErrorMessage(null);
      setBookings([]);
      return;
    }
    if (!businessId) {
      setLoading(false);
      setBookings([]);
      setErrorMessage(
        viewerRole === "employee"
          ? "Je medewerkeraccount is nog niet gekoppeld aan een bedrijf."
          : "Geen bedrijf gevonden."
      );
      return;
    }

    const employeeMode = viewerRole === "employee";

    console.log("[BookingDashboard] businessId:", businessId);
    console.log("[BookingDashboard] role:", viewerRole);
    console.log("[BookingDashboard] query start");

    setLoading(true);
    setErrorMessage(null);

    let active = true;
    let firstResponseHandled = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;

    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const resolveInitialLoad = () => {
      if (!active || firstResponseHandled) return;
      firstResponseHandled = true;
      clearWatchdog();
      setLoading(false);
    };

    const onQuerySuccess = (rows: Booking[]) => {
      if (!active) return;
      setBookings(sortByStart(rows));
      setErrorMessage(null);
      resolveInitialLoad();
      console.log("[BookingDashboard] query success count:", rows.length);
    };

    const onQueryError = (error: unknown) => {
      if (!active) return;
      console.log("[BookingDashboard] query error:", error);
      setErrorMessage("Boekingen laden mislukt. Probeer opnieuw.");
      resolveInitialLoad();
    };

    const unsubscribe = employeeMode
      ? subscribeEmployeeBookings(viewerId, onQuerySuccess, onQueryError)
      : subscribeBookings(businessId, onQuerySuccess, onQueryError);

    const initialLoader = employeeMode ? fetchEmployeeBookings(viewerId) : fetchBookings(businessId);
    initialLoader.then(onQuerySuccess).catch(onQueryError);

    watchdog = setTimeout(() => {
      if (!active || firstResponseHandled) return;
      console.log("[BookingDashboard] query error:", "timeout");
      setErrorMessage("Laden duurt te lang. Controleer je verbinding en probeer opnieuw.");
      setLoading(false);
      firstResponseHandled = true;
    }, 9000);

    return () => {
      active = false;
      clearWatchdog();
      unsubscribe();
    };
  }, [businessId, reloadTick, roleResolved, viewerId, viewerRole]);

  useEffect(() => {
    if (!selectedBookingId) return;
    if (!bookings.some((booking) => booking.id === selectedBookingId)) {
      setSelectedBookingId(null);
    }
  }, [bookings, selectedBookingId]);

  useEffect(() => {
    calendarAnim.setValue(0.35);
    Animated.timing(calendarAnim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [calendarView, selectedDate, calendarFilter, selectedDayBookings.length, calendarAnim]);

  useEffect(() => {
    const targetMonth = monthStartKey(selectedDate);
    if (targetMonth !== monthStartKey(monthCursor)) {
      setMonthCursor(targetMonth);
    }
  }, [selectedDate, monthCursor]);

  useEffect(() => {
    if (!proposeModalBooking) return;

    let active = true;
    setProposeLoading(true);
    setProposeError(null);

    fetchCompanyBookingSlotsForDate({
      companyId: proposeModalBooking.companyId,
      staffId: proposeModalBooking.staffId,
      bookingDate: proposeDate,
      serviceDurationMin: proposeModalBooking.serviceDurationMin,
      bufferBeforeMin: proposeModalBooking.serviceBufferBeforeMin,
      bufferAfterMin: proposeModalBooking.serviceBufferAfterMin,
      capacity: proposeModalBooking.serviceCapacity,
    })
      .then((rows) => {
        if (!active) return;
        const validRows = rows.filter(
          (slot) =>
            slot.startAtMs > Date.now() + 60_000 &&
            Math.abs(slot.startAtMs - proposeModalBooking.startAtMs) >= 60_000
        );
        setProposeSlots(validRows);
        setSelectedProposedStartAtMs((current) => {
          if (current && validRows.some((slot) => slot.startAtMs === current)) return current;
          return validRows[0]?.startAtMs ?? null;
        });
      })
      .catch((error) => {
        if (!active) return;
        setProposeError(toFriendlyError(error));
        setProposeSlots([]);
        setSelectedProposedStartAtMs(null);
      })
      .finally(() => {
        if (!active) return;
        setProposeLoading(false);
      });

    return () => {
      active = false;
    };
  }, [proposeDate, proposeModalBooking]);

  const setStatus = useCallback(
    async (booking: Booking, nextStatus: "confirmed" | "declined") => {
      if (!viewerId || busyBookingId) return;

      const previousStatus = booking.status;
      setBusyBookingId(booking.id);
      setBookings((current) =>
        current.map((row) => (row.id === booking.id ? { ...row, status: nextStatus } : row))
      );

      try {
        if (booking.status === "pending_reschedule_approval") {
          await respondToCustomerRescheduleByCompany(
            booking.id,
            booking.companyId,
            nextStatus === "confirmed" ? "approved" : "declined"
          );
        } else if (nextStatus === "confirmed") {
          await acceptBooking(booking.id, booking.companyId);
        } else {
          await rejectBooking(booking.id, booking.companyId);
        }
      } catch (error) {
        setBookings((current) =>
          current.map((row) => (row.id === booking.id ? { ...row, status: previousStatus } : row))
        );
        Alert.alert("Actie mislukt", toFriendlyError(error));
      } finally {
        setBusyBookingId(null);
      }
    },
    [viewerId, busyBookingId]
  );

  const onPropose = useCallback(
    (booking: Booking) => {
      if (!viewerId || busyBookingId) return;
      openProposeModal(booking);
    },
    [viewerId, busyBookingId, openProposeModal]
  );

  const submitProposedTime = useCallback(async () => {
    if (!viewerId || busyBookingId || !proposeModalBooking) return;
    if (!selectedProposedStartAtMs) {
      Alert.alert("Kies een tijd", "Selecteer eerst een beschikbaar tijdslot.");
      return;
    }

    setBusyBookingId(proposeModalBooking.id);
    try {
      await proposeBookingTimeByCompany({
        bookingId: proposeModalBooking.id,
        companyId: proposeModalBooking.companyId,
        proposedStartAtMs: selectedProposedStartAtMs,
        proposalNote,
      });

      const proposedLabel = new Date(selectedProposedStartAtMs).toLocaleString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const cleanedNote = proposalNote.trim();
      setBookings((current) =>
        current.map((row) =>
          row.id === proposeModalBooking.id
            ? {
                ...row,
                status: "proposed_by_company",
                proposedStartAtMs: selectedProposedStartAtMs,
                proposalNote: cleanedNote || undefined,
              }
            : row
        )
      );
      closeProposeModal();
      Alert.alert("Voorstel verzonden", `Nieuwe tijd voorgesteld: ${proposedLabel}.`);
    } catch (error) {
      Alert.alert("Voorstel mislukt", toFriendlyError(error));
    } finally {
      setBusyBookingId(null);
    }
  }, [
    busyBookingId,
    closeProposeModal,
    proposeModalBooking,
    proposalNote,
    selectedProposedStartAtMs,
    viewerId,
  ]);

  const onAccept = useCallback(
    (booking: Booking) => {
      setStatus(booking, "confirmed").catch(() => null);
    },
    [setStatus]
  );

  const onReject = useCallback(
    (booking: Booking) => {
      setStatus(booking, "declined").catch(() => null);
    },
    [setStatus]
  );

  function openBookingFromCalendar(booking: Booking) {
    setSelectedBookingId(booking.id);
    setSelectedDate(booking.bookingDate);
    setCalendarView("day");
  }

  function renderWeekStrip() {
    return (
      <View style={styles.weekStripWrap}>
        <Pressable
          style={styles.weekNavBtn}
          onPress={() => setSelectedDate(addDaysToDateKey(selectedDate, calendarView === "week" ? -7 : -1))}
        >
          <Ionicons name="chevron-back" size={16} color={BLUE.primary} />
        </Pressable>

        <View style={styles.weekStripRow}>
          {weekKeys.map((dateKey) => {
            const active = dateKey === selectedDate;
            const counts = countsByDate[dateKey] ?? createEmptyCounts();

            return (
              <Pressable
                key={dateKey}
                style={[styles.weekDayCard, active && styles.weekDayCardActive]}
                onPress={() => setSelectedDate(dateKey)}
              >
                <Text style={[styles.weekDayName, active && styles.weekDayNameActive]}>{weekdayLabelShort(dateKey)}</Text>
                <Text style={[styles.weekDayDate, active && styles.weekDayDateActive]}>{parseDateKey(dateKey).getDate()}</Text>
                <View style={styles.weekCountDotRow}>
                  {counts.pending ? <View style={[styles.weekDot, { backgroundColor: "#f9b73f" }]} /> : null}
                  {counts.reschedulePending ? <View style={[styles.weekDot, { backgroundColor: "#5ca3e5" }]} /> : null}
                  {counts.proposed ? <View style={[styles.weekDot, { backgroundColor: "#678cf1" }]} /> : null}
                  {counts.confirmed ? <View style={[styles.weekDot, { backgroundColor: "#34b36b" }]} /> : null}
                  {counts.declined ? <View style={[styles.weekDot, { backgroundColor: "#e45b7f" }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={styles.weekNavBtn}
          onPress={() => setSelectedDate(addDaysToDateKey(selectedDate, calendarView === "week" ? 7 : 1))}
        >
          <Ionicons name="chevron-forward" size={16} color={BLUE.primary} />
        </Pressable>
      </View>
    );
  }

  function renderDayView() {
    return (
      <View style={styles.viewBodyCard}>
        <Text style={styles.viewTitle}>Dagplanning - {formatDateTime(parseDateKey(selectedDate).getTime()).split(",")[0]}</Text>
        <View style={styles.timelineViewport}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={[styles.timelineCanvas, { height: timelineHeight }]}>
              {hourMarks.map((hourMin) => {
                const top = ((hourMin - timelineBounds.startMin) / 60) * DAY_ROW_HEIGHT;
                return (
                  <View key={`hour-${hourMin}`} style={[styles.hourRow, { top }]}>
                    <Text style={styles.hourLabel}>{toHourLabel(hourMin)}</Text>
                    <View style={styles.hourLine} />
                  </View>
                );
              })}

              {selectedDayBookings.map((booking) => {
                const palette = statusPalette(booking.status);
                const startMin = Math.max(timelineBounds.startMin, minutesFromMs(booking.startAtMs));
                const endMin = Math.min(timelineBounds.endMin, minutesFromMs(booking.endAtMs));
                const top = ((startMin - timelineBounds.startMin) / 60) * DAY_ROW_HEIGHT + 3;
                const rawHeight = ((Math.max(endMin, startMin + 15) - startMin) / 60) * DAY_ROW_HEIGHT - 6;
                const height = Math.max(54, rawHeight);
                const active = selectedBookingId === booking.id;

                return (
                  <Pressable
                    key={booking.id}
                    onPress={() => setSelectedBookingId(booking.id)}
                    style={[
                      styles.timelineEvent,
                      {
                        top,
                        height,
                        backgroundColor: palette.bg,
                        borderColor: active ? BLUE.primary : palette.border,
                      },
                    ]}
                  >
                    <Text style={[styles.timelineEventTitle, { color: palette.text }]} numberOfLines={1}>
                      {booking.serviceName}
                    </Text>
                    <Text style={[styles.timelineEventMeta, { color: palette.text }]} numberOfLines={1}>
                      {booking.customerName}
                    </Text>
                    <Text style={[styles.timelineEventMeta, { color: palette.text }]}> 
                      {formatTimeRange(booking.startAtMs, booking.endAtMs)}
                    </Text>
                  </Pressable>
                );
              })}

              {selectedDayBookings.length === 0 ? (
                <View style={styles.timelineEmptyWrap}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.muted} />
                  <Text style={styles.timelineEmptyText}>Geen afspraken op deze dag.</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  }

  function renderWeekView() {
    return (
      <View style={styles.viewBodyCard}>
        <Text style={styles.viewTitle}>Weekoverzicht</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekOverviewRow}>
          {weekKeys.map((dateKey) => {
            const counts = countsByDate[dateKey] ?? createEmptyCounts();
            const active = dateKey === selectedDate;
            return (
              <Pressable
                key={dateKey}
                style={[styles.weekOverviewCard, active && styles.weekOverviewCardActive]}
                onPress={() => {
                  setSelectedDate(dateKey);
                  setCalendarView("day");
                }}
              >
                <Text style={[styles.weekOverviewDay, active && styles.weekOverviewDayActive]}>
                  {weekdayLabelShort(dateKey)} {parseDateKey(dateKey).getDate()}
                </Text>
                <View style={styles.weekOverviewMetricRow}>
                  <Text style={styles.weekOverviewMetricLabel}>Afspraken</Text>
                  <Text style={styles.weekOverviewMetricValue}>{counts.total}</Text>
                </View>
                <View style={styles.weekOverviewMetricRow}>
                  <Text style={styles.weekOverviewMetricLabel}>Actie nodig</Text>
                  <Text style={[styles.weekOverviewMetricValue, { color: "#a66a00" }]}>
                    {counts.pending + counts.reschedulePending}
                  </Text>
                </View>
                <View style={styles.weekOverviewMetricRow}>
                  <Text style={styles.weekOverviewMetricLabel}>Wacht op klant</Text>
                  <Text style={[styles.weekOverviewMetricValue, { color: "#2a5fcf" }]}>{counts.proposed}</Text>
                </View>
                <View style={styles.weekOverviewMetricRow}>
                  <Text style={styles.weekOverviewMetricLabel}>Bevestigd</Text>
                  <Text style={[styles.weekOverviewMetricValue, { color: "#208e49" }]}>{counts.confirmed}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  function renderMonthView() {
    const weekDays = ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"];

    return (
      <View style={styles.viewBodyCard}>
        <View style={styles.monthHeaderRow}>
          <Pressable style={styles.monthNavBtn} onPress={() => setMonthCursor((current) => shiftMonthKey(current, -1))}>
            <Ionicons name="chevron-back" size={16} color={BLUE.primary} />
          </Pressable>
          <Text style={styles.monthTitle}>{monthTitle(monthCursor)}</Text>
          <Pressable style={styles.monthNavBtn} onPress={() => setMonthCursor((current) => shiftMonthKey(current, 1))}>
            <Ionicons name="chevron-forward" size={16} color={BLUE.primary} />
          </Pressable>
        </View>

        <View style={styles.monthWeekdaysRow}>
          {weekDays.map((day) => (
            <Text key={day} style={styles.monthWeekdayLabel}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.monthGrid}>
          {monthCells.map((cell) => {
            const counts = countsByDate[cell.key] ?? createEmptyCounts();
            const active = cell.key === selectedDate;
            const isToday = cell.key === formatDateKey(new Date());

            return (
              <Pressable
                key={cell.key}
                style={[
                  styles.monthCell,
                  !cell.inCurrentMonth && styles.monthCellMuted,
                  active && styles.monthCellActive,
                  isToday && styles.monthCellToday,
                ]}
                onPress={() => {
                  setSelectedDate(cell.key);
                  setCalendarView("day");
                }}
              >
                <Text style={[styles.monthCellDay, !cell.inCurrentMonth && styles.monthCellDayMuted, active && styles.monthCellDayActive]}>
                  {parseDateKey(cell.key).getDate()}
                </Text>
                {counts.total ? (
                  <View style={styles.monthCountBadge}>
                    <Text style={styles.monthCountText}>{counts.total}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={["#3a79ff", "#245dda"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="calendar-outline" size={20} color="#fff" />
            </View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>{viewerRole === "employee" ? "Mijn agenda" : "Agenda"}</Text>
              <Text style={styles.heroSubtitle}>
                {pendingCount} {pendingCount === 1 ? "aanvraag" : "aanvragen"} in afwachting
              </Text>
            </View>
          </View>
          <Text style={styles.heroHint}>
            {viewerRole === "employee"
              ? "Alleen je eigen afspraken en aanvragen worden getoond."
              : "Bekijk planning van je hele team en reageer direct op aanvragen."}
          </Text>
        </LinearGradient>

        {viewerRole === "company" ? (
          <View style={styles.incomeRow}>
            <View style={styles.incomeCard}>
              <Text style={styles.incomeLabel}>Omzet deze maand</Text>
              <Text style={styles.incomeValue}>EUR {thisMonthIncome.toFixed(2)}</Text>
            </View>
            <View style={styles.incomeCard}>
              <Text style={styles.incomeLabel}>Totale bevestigde omzet</Text>
              <Text style={styles.incomeValue}>EUR {totalIncome.toFixed(2)}</Text>
            </View>
          </View>
        ) : null}

        {!businessId ? (
          <StateCard
            icon="lock-closed-outline"
            title="Niet ingelogd"
            description="Log opnieuw in om je boekingen te bekijken."
            ctaLabel="Ververs"
            onPressCta={retry}
          />
        ) : loading ? (
          <StateCard
            icon="hourglass-outline"
            title="Bezig met laden"
            description="We laden je boekingen in. Dit duurt meestal maar kort."
            loading
          />
        ) : errorMessage ? (
          <StateCard
            icon="alert-circle-outline"
            title="Kon niet laden"
            description={errorMessage}
            ctaLabel="Opnieuw proberen"
            onPressCta={retry}
          />
        ) : (
          <>
            <View style={styles.calendarCard}>
              <View style={styles.calendarTopRow}>
                <Text style={styles.calendarTitle}>Kalender</Text>
                <View style={styles.calendarFilterRow}>
                  <Pressable
                    style={[styles.filterChip, calendarFilter === "active" && styles.filterChipActive]}
                    onPress={() => setCalendarFilter("active")}
                  >
                    <Text style={[styles.filterChipText, calendarFilter === "active" && styles.filterChipTextActive]}>
                      Actief
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.filterChip, calendarFilter === "all" && styles.filterChipActive]}
                    onPress={() => setCalendarFilter("all")}
                  >
                    <Text style={[styles.filterChipText, calendarFilter === "all" && styles.filterChipTextActive]}>
                      Alles
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.modeRow}>
                {[
                  { id: "day", label: "Dag", icon: "today-outline" },
                  { id: "week", label: "Week", icon: "calendar-outline" },
                  { id: "month", label: "Maand", icon: "grid-outline" },
                ].map((item) => {
                  const active = calendarView === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      style={[styles.modeBtn, active && styles.modeBtnActive]}
                      onPress={() => setCalendarView(item.id as CalendarViewMode)}
                    >
                      <Ionicons
                        name={item.icon as keyof typeof Ionicons.glyphMap}
                        size={13}
                        color={active ? "#fff" : BLUE.primary}
                      />
                      <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {calendarView !== "month" ? renderWeekStrip() : null}

              <Animated.View
                style={{
                  opacity: calendarAnim,
                  transform: [
                    {
                      translateY: calendarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                }}
              >
                {calendarView === "day" ? renderDayView() : null}
                {calendarView === "week" ? renderWeekView() : null}
                {calendarView === "month" ? renderMonthView() : null}
              </Animated.View>

              {selectedBooking ? (
                <View style={styles.selectedBookingCard}>
                  <View style={styles.selectedBookingTop}>
                    <Text style={styles.selectedBookingTitle} numberOfLines={1}>
                      {selectedBooking.serviceName}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        {
                          backgroundColor: statusPalette(selectedBooking.status).bg,
                          borderColor: statusPalette(selectedBooking.status).border,
                        },
                      ]}
                    >
                      <Text style={[styles.statusPillText, { color: statusPalette(selectedBooking.status).text }]}>
                        {statusLabel(selectedBooking.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.selectedBookingMeta}>{selectedBooking.customerName}</Text>
                  <Text style={styles.selectedBookingMeta}>Medewerker: {selectedBooking.staffName}</Text>
                  <Text style={styles.selectedBookingMeta}>
                    {formatDateTime(selectedBooking.startAtMs)} • {formatTimeRange(selectedBooking.startAtMs, selectedBooking.endAtMs)}
                  </Text>
                  {selectedBooking.proposedStartAtMs ? (
                    <Text style={styles.selectedBookingMeta}>
                      Voorstel:{" "}
                      {new Date(selectedBooking.proposedStartAtMs).toLocaleString("nl-NL", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  ) : null}
                  {selectedBooking.proposalNote ? (
                    <View style={styles.proposalNoteCard}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color="#3861bf" />
                      <Text style={styles.proposalNoteText}>{selectedBooking.proposalNote}</Text>
                    </View>
                  ) : null}
                  {selectedBooking.status === "confirmed" ? (
                    <>
                      <Text style={styles.selectedBookingMeta}>Tel: {selectedBooking.customerPhone || "-"}</Text>
                      <Text style={styles.selectedBookingMeta}>E-mail: {selectedBooking.customerEmail || "-"}</Text>
                    </>
                  ) : (
                    <Text style={styles.selectedBookingPrivateHint}>
                      Contactgegevens zichtbaar na definitieve bevestiging.
                    </Text>
                  )}

                  {selectedBooking.status === "pending" || selectedBooking.status === "pending_reschedule_approval" ? (
                    <View style={styles.pendingActionsRow}>
                      <Pressable
                        style={[styles.acceptBtn, busyBookingId === selectedBooking.id && styles.disabled]}
                        onPress={() => onAccept(selectedBooking)}
                        disabled={busyBookingId === selectedBooking.id}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color="#fff" />
                        <Text style={styles.acceptBtnText}>
                          {selectedBooking.status === "pending_reschedule_approval" ? "Akkoord verplaatsen" : "Accepteren"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[styles.rejectBtn, busyBookingId === selectedBooking.id && styles.disabled]}
                        onPress={() => onReject(selectedBooking)}
                        disabled={busyBookingId === selectedBooking.id}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={COLORS.danger} />
                        <Text style={styles.rejectBtnText}>
                          {selectedBooking.status === "pending_reschedule_approval" ? "Afwijzen" : "Weigeren"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {selectedBooking.status === "pending" ? (
                    <Pressable
                      style={[styles.proposeBtn, busyBookingId === selectedBooking.id && styles.disabled]}
                      onPress={() => onPropose(selectedBooking)}
                      disabled={busyBookingId === selectedBooking.id}
                    >
                      <Ionicons name="swap-horizontal-outline" size={14} color={BLUE.primary} />
                      <Text style={styles.proposeBtnText}>Nieuwe tijd kiezen + bericht</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            {!hasBookings ? (
              <StateCard
                icon="file-tray-outline"
                title="Nog geen afspraken"
                description="Nieuwe boekingsaanvragen verschijnen automatisch in je agenda."
                ctaLabel="Ververs"
                onPressCta={retry}
              />
            ) : (
              <>
                <BookingSection
                  title="Actie nodig"
                  items={actionRequiredBookings}
                  emptyText="Geen aanvragen die actie vragen."
                  busyBookingId={busyBookingId}
                  onAccept={onAccept}
                  onReject={onReject}
                  onPropose={onPropose}
                  onSelect={openBookingFromCalendar}
                />

                <BookingSection
                  title="Wacht op klant"
                  items={waitingCustomerBookings}
                  emptyText="Geen voorstellen in afwachting van klant."
                  busyBookingId={busyBookingId}
                  onAccept={onAccept}
                  onReject={onReject}
                  onPropose={onPropose}
                  onSelect={openBookingFromCalendar}
                />

                <BookingSection
                  title="Aankomend"
                  items={upcomingBookings}
                  emptyText="Geen geaccepteerde toekomstige afspraken."
                  busyBookingId={busyBookingId}
                  onAccept={onAccept}
                  onReject={onReject}
                  onPropose={onPropose}
                  onSelect={openBookingFromCalendar}
                />

                {rejectedBookings.length > 0 ? (
                  <BookingSection
                    title="Geweigerd"
                    items={rejectedBookings}
                    emptyText="Nog geen geweigerde aanvragen."
                    busyBookingId={busyBookingId}
                    onAccept={onAccept}
                    onReject={onReject}
                    onPropose={onPropose}
                    onSelect={openBookingFromCalendar}
                  />
                ) : null}

                {cancelledBookings.length > 0 ? (
                  <BookingSection
                    title="Geannuleerd"
                    items={cancelledBookings}
                    emptyText="Nog geen annuleringen."
                    busyBookingId={busyBookingId}
                    onAccept={onAccept}
                    onReject={onReject}
                    onPropose={onPropose}
                    onSelect={openBookingFromCalendar}
                  />
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(proposeModalBooking)}
        transparent
        animationType="slide"
        onRequestClose={closeProposeModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropPress} onPress={closeProposeModal} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={12}
            style={styles.modalSheetWrap}
          >
            <View style={styles.modalSheet}>
              <View style={styles.modalTopRow}>
                <View style={styles.modalTitleWrap}>
                  <Text style={styles.modalTitle}>Andere tijd voorstellen</Text>
                  <Text style={styles.modalSubtitle}>
                    {proposeModalBooking?.customerName} • {proposeModalBooking?.serviceName}
                  </Text>
                </View>
                <Pressable style={styles.modalCloseBtn} onPress={closeProposeModal}>
                  <Ionicons name="close" size={16} color={COLORS.muted} />
                </Pressable>
              </View>

              {proposeModalBooking ? (
                <View style={styles.requestedTimeCard}>
                  <Ionicons name="time-outline" size={14} color={BLUE.primary} />
                  <Text style={styles.requestedTimeText}>Aangevraagd: {formatDateTime(proposeModalBooking.startAtMs)}</Text>
                </View>
              ) : null}

              <Text style={styles.modalSectionTitle}>Kies een dag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateChipRow}>
                {proposeDateOptions.map((dateKey) => {
                  const active = proposeDate === dateKey;
                  return (
                    <Pressable
                      key={dateKey}
                      style={[styles.dateChip, active && styles.dateChipActive]}
                      onPress={() => setProposeDate(dateKey)}
                    >
                      <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>{dateChipLabel(dateKey)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.modalSectionTitle}>Kies een tijdslot</Text>
              <View style={styles.slotCard}>
                {proposeLoading ? (
                  <View style={styles.slotStateWrap}>
                    <ActivityIndicator color={BLUE.primary} />
                    <Text style={styles.slotStateText}>Beschikbare tijden laden...</Text>
                  </View>
                ) : proposeError ? (
                  <View style={styles.slotStateWrap}>
                    <Text style={styles.slotErrorText}>{proposeError}</Text>
                  </View>
                ) : proposeSlots.length === 0 ? (
                  <View style={styles.slotStateWrap}>
                    <Text style={styles.slotStateText}>Geen beschikbare tijden op deze dag.</Text>
                  </View>
                ) : (
                  <ScrollView
                    style={styles.slotGridScroll}
                    contentContainerStyle={styles.slotGrid}
                    showsVerticalScrollIndicator={false}
                  >
                    {proposeSlots.map((slot) => {
                      const active = selectedProposedStartAtMs === slot.startAtMs;
                      return (
                        <Pressable
                          key={slot.key}
                          style={[styles.slotBtn, active && styles.slotBtnActive]}
                          onPress={() => setSelectedProposedStartAtMs(slot.startAtMs)}
                        >
                          <Text style={[styles.slotBtnTime, active && styles.slotBtnTimeActive]}>{slot.label}</Text>
                          <Text style={[styles.slotBtnCapacity, active && styles.slotBtnCapacityActive]}>
                            {slot.remainingCapacity}/{slot.totalCapacity} vrij
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <Text style={styles.modalSectionTitle}>Toelichting (optioneel)</Text>
              <TextInput
                value={proposalNote}
                onChangeText={setProposalNote}
                placeholder="Bijv. Deze tijd sluit beter aan op onze planning."
                placeholderTextColor="#57657f"
                style={styles.noteInput}
                multiline
                maxLength={240}
                textAlignVertical="top"
              />
              <Text style={styles.noteCount}>{proposalNote.trim().length}/240</Text>

              <View style={styles.modalActionRow}>
                <Pressable style={styles.modalGhostBtn} onPress={closeProposeModal} disabled={busyBookingId !== null}>
                  <Text style={styles.modalGhostBtnText}>Sluiten</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalPrimaryBtn,
                    (!selectedProposedStartAtMs || busyBookingId !== null || proposeLoading) && styles.disabled,
                  ]}
                  onPress={submitProposedTime}
                  disabled={!selectedProposedStartAtMs || busyBookingId !== null || proposeLoading}
                >
                  <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                  <Text style={styles.modalPrimaryBtnText}>Voorstel versturen</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 26,
    gap: 12,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    padding: 14,
    gap: 8,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextWrap: {
    flex: 1,
    gap: 1,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "800",
  },
  heroHint: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "600",
  },
  incomeRow: {
    flexDirection: "row",
    gap: 8,
  },
  incomeCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  incomeLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  incomeValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  calendarCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: BLUE.soft,
    padding: 12,
    gap: 10,
  },
  calendarTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  calendarTitle: {
    color: BLUE.text,
    fontSize: 18,
    fontWeight: "900",
  },
  calendarFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterChip: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  filterChipActive: {
    borderColor: BLUE.primary,
    backgroundColor: BLUE.primary,
  },
  filterChipText: {
    color: BLUE.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  modeBtnActive: {
    borderColor: BLUE.primary,
    backgroundColor: BLUE.primary,
  },
  modeBtnText: {
    color: BLUE.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  modeBtnTextActive: {
    color: "#fff",
  },
  weekStripWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weekNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  weekStripRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 7,
  },
  weekDayCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  weekDayCardActive: {
    backgroundColor: BLUE.primary,
    borderColor: BLUE.primary,
  },
  weekDayName: {
    color: "#6789c9",
    fontSize: 9,
    fontWeight: "800",
  },
  weekDayNameActive: {
    color: "#dce9ff",
  },
  weekDayDate: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  weekDayDateActive: {
    color: "#fff",
  },
  weekCountDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 8,
  },
  weekDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  viewBodyCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8,
  },
  viewTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  timelineViewport: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: BLUE.surface,
    maxHeight: 460,
    overflow: "hidden",
  },
  timelineCanvas: {
    position: "relative",
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: DAY_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    width: 54,
    paddingTop: 6,
    paddingLeft: 8,
    color: "#6f87bf",
    fontSize: 10,
    fontWeight: "800",
  },
  hourLine: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#d8e5ff",
    marginTop: 10,
  },
  timelineEvent: {
    position: "absolute",
    left: 58,
    right: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  timelineEventTitle: {
    fontSize: 12,
    fontWeight: "900",
  },
  timelineEventMeta: {
    fontSize: 11,
    fontWeight: "700",
  },
  timelineEmptyWrap: {
    position: "absolute",
    left: 58,
    right: 10,
    top: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    minHeight: 74,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  timelineEmptyText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  weekOverviewRow: {
    gap: 9,
    paddingRight: 4,
  },
  weekOverviewCard: {
    width: 170,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: BLUE.surface,
    padding: 10,
    gap: 6,
  },
  weekOverviewCardActive: {
    borderColor: BLUE.primary,
    backgroundColor: BLUE.soft,
  },
  weekOverviewDay: {
    color: BLUE.text,
    fontSize: 12,
    fontWeight: "900",
  },
  weekOverviewDayActive: {
    color: BLUE.primary,
  },
  weekOverviewMetricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekOverviewMetricLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  weekOverviewMetricValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  monthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: BLUE.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  monthTitle: {
    color: BLUE.text,
    fontSize: 15,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  monthWeekdaysRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  monthWeekdayLabel: {
    flex: 1,
    textAlign: "center",
    color: "#7c92c2",
    fontSize: 10,
    fontWeight: "800",
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BLUE.border,
  },
  monthCell: {
    width: "14.2857%",
    minHeight: 58,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  monthCellMuted: {
    backgroundColor: "#f5f8ff",
  },
  monthCellActive: {
    backgroundColor: BLUE.primary,
  },
  monthCellToday: {
    borderColor: BLUE.primary,
  },
  monthCellDay: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  monthCellDayMuted: {
    color: "#9db0d7",
  },
  monthCellDayActive: {
    color: "#fff",
  },
  monthCountBadge: {
    minWidth: 18,
    height: 16,
    borderRadius: 999,
    backgroundColor: "rgba(45,108,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  monthCountText: {
    color: BLUE.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  selectedBookingCard: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    padding: 10,
    gap: 5,
  },
  selectedBookingTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectedBookingTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  selectedBookingMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  selectedBookingPrivateHint: {
    color: "#2a5fcf",
    fontSize: 12,
    fontWeight: "700",
  },
  stateCard: {
    minHeight: 240,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    gap: 8,
  },
  stateIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  stateDescription: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
  stateSpinner: {
    marginTop: 6,
  },
  stateCtaBtn: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  stateCtaText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  sectionCountPill: {
    minWidth: 30,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  sectionCountText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionEmptyWrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sectionEmptyText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  sectionList: {
    gap: 9,
  },
  bookingCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: 6,
  },
  bookingTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  bookingService: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  bookingMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  proposalPreview: {
    marginTop: 2,
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#edf3ff",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  proposalPreviewText: {
    flex: 1,
    color: BLUE.text,
    fontSize: 11,
    fontWeight: "800",
  },
  proposalNoteCard: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#d3def8",
    backgroundColor: "#f7faff",
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  proposalNoteText: {
    flex: 1,
    color: "#2d4f96",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  pendingActionsRow: {
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
  },
  acceptBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  acceptBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  rejectBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f4c3d2",
    backgroundColor: "#fff0f5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  rejectBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  proposeBtn: {
    marginTop: 4,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#edf3ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  proposeBtnText: {
    color: BLUE.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(19,26,43,0.3)",
    justifyContent: "flex-end",
  },
  modalBackdropPress: {
    flex: 1,
  },
  modalSheetWrap: {
    width: "100%",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    backgroundColor: COLORS.card,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 18,
    gap: 10,
    maxHeight: "90%",
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitleWrap: {
    flex: 1,
    gap: 2,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  requestedTimeCard: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#edf3ff",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  requestedTimeText: {
    flex: 1,
    color: BLUE.text,
    fontSize: 12,
    fontWeight: "800",
  },
  modalSectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  dateChipRow: {
    gap: 8,
    paddingBottom: 2,
    paddingRight: 6,
  },
  dateChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  dateChipActive: {
    borderColor: BLUE.primary,
    backgroundColor: BLUE.primary,
  },
  dateChipText: {
    color: BLUE.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  dateChipTextActive: {
    color: "#fff",
  },
  slotCard: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: BLUE.surface,
    padding: 10,
    minHeight: 112,
  },
  slotStateWrap: {
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  slotStateText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  slotErrorText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  slotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  slotGridScroll: {
    maxHeight: 190,
  },
  slotBtn: {
    width: "48.5%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLUE.border,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 2,
  },
  slotBtnActive: {
    borderColor: BLUE.primary,
    backgroundColor: "#e9f1ff",
  },
  slotBtnTime: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  slotBtnTimeActive: {
    color: BLUE.primary,
  },
  slotBtnCapacity: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  slotBtnCapacityActive: {
    color: BLUE.text,
  },
  noteInput: {
    minHeight: 78,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  noteCount: {
    alignSelf: "flex-end",
    marginTop: -4,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  modalGhostBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalGhostBtnText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  modalPrimaryBtn: {
    flex: 1.4,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: BLUE.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  modalPrimaryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.55,
  },
});
