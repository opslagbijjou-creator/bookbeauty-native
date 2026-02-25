import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Transaction,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { getUserRole } from "./authRepo";
import { fetchCompanyById } from "./companyRepo";
import {
  notifyCompanyOnBookingCancelledByCustomer,
  notifyCompanyOnBookingCheckedIn,
  notifyCompanyOnBookingCompleted,
  notifyCompanyOnBookingNoShow,
  notifyCompanyOnBookingProposalDecisionByCustomer,
  notifyCompanyOnRescheduleRequestByCustomer,
  notifyCustomerOnBookingCheckInReady,
  notifyCustomerOnBookingCheckedIn,
  notifyCustomerOnBookingCompleted,
  notifyCustomerOnBookingNoShow,
  notifyCustomerOnBookingPaymentPending,
  notifyCustomerOnBookingProposalByCompany,
  notifyCustomerOnBookingStatusByCompany,
  notifyCustomerOnRescheduleDecisionByCompany,
} from "./notificationRepo";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "reschedule_requested"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";
export type BookingProposalBy = "company" | "customer";
export type BookingPaymentStatus =
  | "open"
  | "pending_payment"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

export type TimeRange = {
  start: string;
  end: string;
};

export type DaySchedule = {
  open: boolean;
  ranges: TimeRange[];
};

export type BookingWeekSchedule = Record<WeekdayKey, DaySchedule>;

export type BookingSettings = {
  enabled: boolean;
  intervalMin: number;
  autoConfirm: boolean;
  defaultCapacity: number;
  weekSchedule: BookingWeekSchedule;
};

export type BookingBlock = {
  id: string;
  companyId: string;
  startAtMs: number;
  endAtMs: number;
  allDay: boolean;
  reason?: string;
  createdAtMs: number;
  updatedAtMs: number;
};

type SlotLock = {
  id: string;
  companyId: string;
  staffId: string;
  bookingDate: string;
  slotKey: string;
  seat: number;
};

export type BookingSlot = {
  key: string;
  bookingDate: string;
  startAtMs: number;
  endAtMs: number;
  label: string;
  remainingCapacity: number;
  totalCapacity: number;
};

export type Booking = {
  id: string;
  companyId: string;
  companyName: string;
  companyLogoUrl?: string;
  staffId: string;
  staffName: string;
  serviceId: string;
  serviceName: string;
  serviceCategory: string;
  serviceDurationMin: number;
  serviceBufferBeforeMin: number;
  serviceBufferAfterMin: number;
  serviceCapacity: number;
  servicePrice: number;
  bookingDate: string;
  startAtMs: number;
  endAtMs: number;
  occupiedStartAtMs: number;
  occupiedEndAtMs: number;
  status: BookingStatus;
  paymentStatus: BookingPaymentStatus | "";
  mollieStatus?: string;
  amountCents: number;
  checkoutUrl?: string;
  proposalBy?: BookingProposalBy;
  proposedBookingDate?: string;
  proposedStartAtMs?: number;
  proposedEndAtMs?: number;
  proposedOccupiedStartAtMs?: number;
  proposedOccupiedEndAtMs?: number;
  proposedAtMs?: number;
  proposalNote?: string;
  customerRescheduleCount: number;
  customerConfirmedAtMs?: number;
  companyConfirmedAtMs?: number;
  confirmedAtMs?: number;
  checkInCode?: string;
  checkInCodeExpiresAtMs?: number;
  checkInQrGeneratedAtMs?: number;
  checkInConfirmedAtMs?: number;
  checkInRejectedAtMs?: number;
  checkInRejectedReason?: string;
  completedAtMs?: number;
  noShowReportedAtMs?: number;
  reminder24hAtMs?: number;
  reminderSameDayAtMs?: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  note?: string;
  cancellationFeePercent: number;
  cancellationFeeAmount: number;
  referralPostId?: string;
  referralInfluencerId?: string;
  referralInfluencerName?: string;
  referralCommissionPercent?: number;
  referralCommissionAmount?: number;
  lockIds: string[];
  lockSeat?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type CreateBookingPayload = {
  companyId: string;
  serviceId: string;
  staffId?: string;
  staffName?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  note?: string;
  startAtMs: number;
  allowDoubleBooking?: boolean;
  referralPostId?: string;
};

export type BookingBlockPayload = {
  startAtMs: number;
  endAtMs: number;
  allDay?: boolean;
  reason?: string;
};

export type BookingQueryFilter = {
  statuses?: BookingStatus[];
  dateFrom?: string;
  dateTo?: string;
  serviceId?: string;
  staffId?: string;
};

export type CompanyTopBookedService = {
  serviceId: string;
  serviceName: string;
  count: number;
};

export type CompanyBookingInsights = {
  totalBookings: number;
  topServices: CompanyTopBookedService[];
};

export type InfluencerCommissionSummary = {
  totalBookings: number;
  confirmedBookings: number;
  estimatedCommissionTotal: number;
  confirmedCommissionTotal: number;
  pendingCommissionTotal: number;
};

const DEFAULT_RANGE = { start: "09:00", end: "18:00" } as const;
const VALID_INTERVALS = [10, 15, 20, 30, 45, 60];
const SLOT_LOCK_STEP_MIN = 5;
const FREE_CANCELLATION_HOURS = 24;
const LATE_CANCEL_FEE_PERCENT = 15;
const SAME_DAY_RESCHEDULE_LIMIT = 1;
const DEFAULT_INFLUENCER_COMMISSION_PERCENT = 5;
const CHECK_IN_CODE_TTL_MIN = 30;
const NO_SHOW_GRACE_MIN = 20;

function toMillis(value: unknown): number {
  const v = value as Timestamp | Date | { toMillis?: () => number } | undefined;
  if (v && typeof (v as Timestamp).toMillis === "function") return (v as Timestamp).toMillis();
  if (v instanceof Date) return v.getTime();
  return 0;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function toTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

function toMinutes(time: string): number {
  const [h, m] = String(time || "00:00").split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(23 * 60 + 59, h * 60 + m));
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => String(row ?? "").trim())
    .filter((row) => row.length > 0);
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map((x) => Number(x));
  return new Date(year, Math.max(0, month - 1), day);
}

function dateFromDayAndMinutes(dateKey: string, minutes: number): Date {
  const base = dateFromKey(dateKey);
  base.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return base;
}

function dayKeyFromDateKey(dateKey: string): WeekdayKey {
  const dayIndex = dateFromKey(dateKey).getDay();
  const keys: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return keys[dayIndex] ?? "mon";
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function normalizeRange(raw: unknown): TimeRange | null {
  const node = (raw as Record<string, unknown> | undefined) ?? {};
  const start = String(node.start ?? "").trim();
  const end = String(node.end ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return null;
  if (toMinutes(end) <= toMinutes(start)) return null;
  return { start, end };
}

function normalizeRanges(raw: unknown): TimeRange[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => normalizeRange(row)).filter((row): row is TimeRange => Boolean(row));
}

function normalizeDay(raw: unknown, fallbackOpen: boolean): DaySchedule {
  const node = (raw as Record<string, unknown> | undefined) ?? {};
  const open = typeof node.open === "boolean" ? node.open : fallbackOpen;

  const explicitRanges = normalizeRanges(node.ranges);
  if (explicitRanges.length) {
    return { open, ranges: explicitRanges };
  }

  // Backward compatibility with legacy start/end shape.
  const legacyRange = normalizeRange({ start: node.start ?? DEFAULT_RANGE.start, end: node.end ?? DEFAULT_RANGE.end });
  return {
    open,
    ranges: legacyRange ? [legacyRange] : [{ ...DEFAULT_RANGE }],
  };
}

function normalizeCapacity(value: unknown, fallback = 1): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.floor(raw));
}

function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.floor(raw));
}

function normalizeInterval(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 30;
  return VALID_INTERVALS.includes(raw) ? raw : 30;
}

function normalizeStatus(raw: unknown): BookingStatus {
  const value = String(raw ?? "pending").trim().toLowerCase();
  if (
    value === "pending" ||
    value === "confirmed" ||
    value === "reschedule_requested" ||
    value === "checked_in" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "no_show"
  ) {
    return value;
  }
  // Backward compatibility with legacy statuses in older bookings.
  if (value === "proposed_by_company" || value === "pending_reschedule_approval") return "reschedule_requested";
  if (value === "declined" || value === "cancelled_by_customer" || value === "cancelled_with_fee") return "cancelled";
  if (value === "checked-in") return "checked_in";
  if (value === "no-show") return "no_show";
  return "pending";
}

function normalizePaymentStatus(raw: unknown, mollieRaw?: unknown): BookingPaymentStatus | "" {
  const direct = String(raw ?? "").trim().toLowerCase();
  const mollie = String(mollieRaw ?? "").trim().toLowerCase();
  const value = direct || mollie;
  if (
    value === "open" ||
    value === "pending_payment" ||
    value === "paid" ||
    value === "failed" ||
    value === "canceled" ||
    value === "expired"
  ) {
    return value;
  }
  if (value === "cancelled") return "canceled";
  if (value === "pending") return "open";
  return "";
}

function isPaymentSettledForCompany(row: Booking): boolean {
  if (!row.paymentStatus) return true; // legacy bookings from before payment flow
  return row.paymentStatus === "paid";
}

function canCompanyManageBooking(row: Booking): boolean {
  return isPaymentSettledForCompany(row);
}

function buildSlotLockKeys(bookingDate: string, occupiedStartMs: number, occupiedEndMs: number): string[] {
  const { dayStartMs } = buildDayRangeMs(bookingDate);
  const stepMs = SLOT_LOCK_STEP_MIN * 60_000;
  const startIndex = Math.max(0, Math.floor((occupiedStartMs - dayStartMs) / stepMs));
  const endIndex = Math.max(startIndex + 1, Math.ceil((occupiedEndMs - dayStartMs) / stepMs));

  const keys: string[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    keys.push(String(index));
  }
  return keys;
}

function buildSlotLockDocId(companyId: string, staffId: string, bookingDate: string, seat: number, slotKey: string): string {
  return `${companyId}_${staffId}_${bookingDate}_${seat}_${slotKey}`;
}

function buildLegacySlotLockDocId(companyId: string, bookingDate: string, seat: number, slotKey: string): string {
  return `${companyId}_${bookingDate}_${seat}_${slotKey}`;
}

function getBookingLockIds(row: Booking): string[] {
  return row.lockIds.length ? row.lockIds : [];
}

function effectiveBookingCapacity(settings: BookingSettings, serviceData: Record<string, unknown>): number {
  const companyCapacity = normalizeCapacity(settings.defaultCapacity, 1);
  const serviceCapacity = normalizeCapacity(serviceData.capacity, companyCapacity);
  return Math.max(1, Math.min(companyCapacity, serviceCapacity));
}

function releaseSlotLocks(transaction: Transaction, lockIds: string[]): void {
  lockIds.forEach((lockId) => {
    transaction.delete(doc(db, "booking_slot_locks", lockId));
  });
}

function getDefaultRanges(open = true): DaySchedule {
  return {
    open,
    ranges: [{ ...DEFAULT_RANGE }],
  };
}

function getBookingOccupiedWindow(row: Booking): { occupiedStartAtMs: number; occupiedEndAtMs: number } {
  const fallbackStart = row.startAtMs - row.serviceBufferBeforeMin * 60_000;
  const fallbackEnd = row.endAtMs + row.serviceBufferAfterMin * 60_000;

  return {
    occupiedStartAtMs: row.occupiedStartAtMs || fallbackStart,
    occupiedEndAtMs: row.occupiedEndAtMs || fallbackEnd,
  };
}

function sortBookingsByStartAsc(items: Booking[]): Booking[] {
  return [...items].sort((a, b) => a.startAtMs - b.startAtMs);
}

function sortBookingsByCreatedDesc(items: Booking[]): Booking[] {
  return [...items].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function toBooking(id: string, data: Record<string, unknown>): Booking {
  const startAtMs = toMillis(data.startAt);
  const durationMin = normalizeNonNegativeInt(data.serviceDurationMin, 0);
  const proposedStartAtMs = toMillis(data.proposedStartAt);
  const proposedEndAtMs = toMillis(data.proposedEndAt);
  const proposedOccupiedStartAtMs = toMillis(data.proposedOccupiedStartAt);
  const proposedOccupiedEndAtMs = toMillis(data.proposedOccupiedEndAt);
  const proposedAtMs = toMillis(data.proposedAt);
  const customerConfirmedAtMs = toMillis(data.customerConfirmedAt);
  const companyConfirmedAtMs = toMillis(data.companyConfirmedAt);
  const confirmedAtMs = toMillis(data.confirmedAt);
  const checkInCode = String(data.checkInCode ?? "").trim();
  const checkInCodeExpiresAtMs = toMillis(data.checkInCodeExpiresAt);
  const checkInQrGeneratedAtMs = toMillis(data.checkInQrGeneratedAt);
  const checkInConfirmedAtMs = toMillis(data.checkInConfirmedAt);
  const checkInRejectedAtMs = toMillis(data.checkInRejectedAt);
  const checkInRejectedReason = String(data.checkInRejectedReason ?? "").trim();
  const completedAtMs = toMillis(data.completedAt);
  const noShowReportedAtMs = toMillis(data.noShowReportedAt);
  const proposalByRaw = String(data.proposalBy ?? "");
  const proposalBy: BookingProposalBy | undefined =
    proposalByRaw === "company" || proposalByRaw === "customer" ? proposalByRaw : undefined;
  const referralPostId = typeof data.referralPostId === "string" ? data.referralPostId.trim() : "";
  const referralInfluencerId =
    typeof data.referralInfluencerId === "string" ? data.referralInfluencerId.trim() : "";
  const referralInfluencerName =
    typeof data.referralInfluencerName === "string" ? data.referralInfluencerName.trim() : "";
  const referralCommissionPercentRaw = Number(data.referralCommissionPercent ?? 0);
  const referralCommissionPercent = Number.isFinite(referralCommissionPercentRaw)
    ? Math.max(0, referralCommissionPercentRaw)
    : 0;
  const referralCommissionAmountRaw = Number(data.referralCommissionAmount ?? 0);
  const referralCommissionAmount = Number.isFinite(referralCommissionAmountRaw)
    ? Math.max(0, referralCommissionAmountRaw)
    : 0;
  const mollieNode = (data.mollie as Record<string, unknown> | undefined) ?? {};
  const mollieStatus = String(mollieNode.status ?? "").trim().toLowerCase();
  const paymentStatus = normalizePaymentStatus(data.paymentStatus, mollieStatus);
  const breakdownNode = (data.breakdown as Record<string, unknown> | undefined) ?? {};
  const fallbackAmountCents = Math.max(0, Math.round((Number(data.servicePrice ?? 0) || 0) * 100));
  const amountCentsRaw = Number(breakdownNode.amountCents ?? data.amountCents ?? fallbackAmountCents);
  const amountCents = Number.isFinite(amountCentsRaw) ? Math.max(0, Math.floor(amountCentsRaw)) : fallbackAmountCents;
  const checkoutUrl = String(mollieNode.checkoutUrl ?? "").trim();

  return {
    id,
    companyId: String(data.companyId ?? ""),
    companyName: String(data.companyName ?? "Onbekende salon"),
    companyLogoUrl: typeof data.companyLogoUrl === "string" ? data.companyLogoUrl : undefined,
    staffId: String(data.staffId ?? data.companyId ?? ""),
    staffName: String(data.staffName ?? data.companyName ?? "Salon team"),
    serviceId: String(data.serviceId ?? ""),
    serviceName: String(data.serviceName ?? "Dienst"),
    serviceCategory: String(data.serviceCategory ?? "Overig"),
    serviceDurationMin: durationMin,
    serviceBufferBeforeMin: normalizeNonNegativeInt(data.serviceBufferBeforeMin, 0),
    serviceBufferAfterMin: normalizeNonNegativeInt(data.serviceBufferAfterMin, 0),
    serviceCapacity: normalizeCapacity(data.serviceCapacity, 1),
    servicePrice: Number(data.servicePrice ?? 0),
    bookingDate: String(data.bookingDate ?? ""),
    startAtMs,
    endAtMs: toMillis(data.endAt) || startAtMs + durationMin * 60_000,
    occupiedStartAtMs: toMillis(data.occupiedStartAt),
    occupiedEndAtMs: toMillis(data.occupiedEndAt),
    status: normalizeStatus(data.status),
    paymentStatus,
    mollieStatus: mollieStatus || undefined,
    amountCents,
    checkoutUrl: checkoutUrl || undefined,
    proposalBy,
    proposedBookingDate: typeof data.proposedBookingDate === "string" ? data.proposedBookingDate : undefined,
    proposedStartAtMs: proposedStartAtMs || undefined,
    proposedEndAtMs: proposedEndAtMs || undefined,
    proposedOccupiedStartAtMs: proposedOccupiedStartAtMs || undefined,
    proposedOccupiedEndAtMs: proposedOccupiedEndAtMs || undefined,
    proposedAtMs: proposedAtMs || undefined,
    proposalNote: typeof data.proposalNote === "string" ? data.proposalNote : undefined,
    customerRescheduleCount: normalizeNonNegativeInt(data.customerRescheduleCount, 0),
    customerConfirmedAtMs: customerConfirmedAtMs || undefined,
    companyConfirmedAtMs: companyConfirmedAtMs || undefined,
    confirmedAtMs: confirmedAtMs || undefined,
    checkInCode: checkInCode || undefined,
    checkInCodeExpiresAtMs: checkInCodeExpiresAtMs || undefined,
    checkInQrGeneratedAtMs: checkInQrGeneratedAtMs || undefined,
    checkInConfirmedAtMs: checkInConfirmedAtMs || undefined,
    checkInRejectedAtMs: checkInRejectedAtMs || undefined,
    checkInRejectedReason: checkInRejectedReason || undefined,
    completedAtMs: completedAtMs || undefined,
    noShowReportedAtMs: noShowReportedAtMs || undefined,
    reminder24hAtMs: toMillis(data.reminder24hAt) || undefined,
    reminderSameDayAtMs: toMillis(data.reminderSameDayAt) || undefined,
    customerId: String(data.customerId ?? ""),
    customerName: String(data.customerName ?? ""),
    customerPhone: String(data.customerPhone ?? ""),
    customerEmail: typeof data.customerEmail === "string" ? data.customerEmail : undefined,
    note: typeof data.note === "string" ? data.note : undefined,
    cancellationFeePercent: normalizeNonNegativeInt(data.cancellationFeePercent, 0),
    cancellationFeeAmount: Number(data.cancellationFeeAmount ?? 0),
    referralPostId: referralPostId || undefined,
    referralInfluencerId: referralInfluencerId || undefined,
    referralInfluencerName: referralInfluencerName || undefined,
    referralCommissionPercent: referralCommissionPercent || undefined,
    referralCommissionAmount: referralCommissionAmount || undefined,
    lockIds: toStringArray(data.lockIds),
    lockSeat: typeof data.lockSeat === "number" ? data.lockSeat : undefined,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

function toBookingBlock(id: string, companyId: string, data: Record<string, unknown>): BookingBlock {
  return {
    id,
    companyId,
    startAtMs: toMillis(data.startAt),
    endAtMs: toMillis(data.endAt),
    allDay: Boolean(data.allDay),
    reason: typeof data.reason === "string" ? data.reason : undefined,
    createdAtMs: toMillis(data.createdAt),
    updatedAtMs: toMillis(data.updatedAt),
  };
}

function toSlotLock(id: string, data: Record<string, unknown>): SlotLock {
  return {
    id,
    companyId: String(data.companyId ?? ""),
    staffId: String(data.staffId ?? data.companyId ?? ""),
    bookingDate: String(data.bookingDate ?? ""),
    slotKey: String(data.slotKey ?? ""),
    seat: normalizeNonNegativeInt(data.seat, 0),
  };
}

function isSameOrAfterDate(dateKey: string, minDateKey: string): boolean {
  return dateFromKey(dateKey).getTime() >= dateFromKey(minDateKey).getTime();
}

function isSameOrBeforeDate(dateKey: string, maxDateKey: string): boolean {
  return dateFromKey(dateKey).getTime() <= dateFromKey(maxDateKey).getTime();
}

function buildDayRangeMs(dateKey: string): { dayStartMs: number; dayEndMs: number } {
  const dayStart = dateFromDayAndMinutes(dateKey, 0).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return { dayStartMs: dayStart, dayEndMs: dayEnd };
}

function normalizeBookingRows(rows: Booking[]): Booking[] {
  return rows.map((row) => {
    const occupied = getBookingOccupiedWindow(row);
    return {
      ...row,
      occupiedStartAtMs: occupied.occupiedStartAtMs,
      occupiedEndAtMs: occupied.occupiedEndAtMs,
    };
  });
}

function clearProposalPatch(): Record<string, unknown> {
  return {
    proposalBy: "",
    proposedBookingDate: "",
    proposedStartAt: null,
    proposedEndAt: null,
    proposedOccupiedStartAt: null,
    proposedOccupiedEndAt: null,
    proposedAt: null,
    proposalNote: "",
  };
}

function isSameCalendarDay(dateKey: string, ms: number): boolean {
  return formatDateKey(new Date(ms)) === dateKey;
}

function isFinalConfirmed(status: BookingStatus): boolean {
  return status === "confirmed" || status === "checked_in" || status === "completed";
}

function isOpenRequest(status: BookingStatus): boolean {
  return status === "pending" || status === "reschedule_requested";
}

function computeCancellationFee(startAtMs: number, servicePrice: number, nowMs: number): { percent: number; amount: number } {
  const diffMs = startAtMs - nowMs;
  const freeMs = FREE_CANCELLATION_HOURS * 60 * 60 * 1000;
  if (diffMs >= freeMs) {
    return { percent: 0, amount: 0 };
  }
  const amount = Math.max(0, Number((Number(servicePrice || 0) * (LATE_CANCEL_FEE_PERCENT / 100)).toFixed(2)));
  return { percent: LATE_CANCEL_FEE_PERCENT, amount };
}

function buildWindowFromStart(
  startAtMs: number,
  serviceDurationMin: number,
  bufferBeforeMin: number,
  bufferAfterMin: number
): {
  bookingDate: string;
  startAtMs: number;
  endAtMs: number;
  occupiedStartAtMs: number;
  occupiedEndAtMs: number;
} {
  const bookingDate = formatDateKey(new Date(startAtMs));
  const endAtMs = startAtMs + serviceDurationMin * 60_000;
  const occupiedStartAtMs = startAtMs - bufferBeforeMin * 60_000;
  const occupiedEndAtMs = endAtMs + bufferAfterMin * 60_000;

  return {
    bookingDate,
    startAtMs,
    endAtMs,
    occupiedStartAtMs,
    occupiedEndAtMs,
  };
}

async function hasOpenSeatForWindow(params: {
  companyId: string;
  staffId: string;
  bookingDate: string;
  occupiedStartAtMs: number;
  occupiedEndAtMs: number;
  capacity: number;
  ignoreLockIds?: string[];
}): Promise<boolean> {
  const { companyId, staffId, bookingDate, occupiedStartAtMs, occupiedEndAtMs, capacity, ignoreLockIds = [] } = params;
  const ignore = new Set(ignoreLockIds);
  const locks = await fetchDayLocksRaw(companyId, bookingDate, staffId);
  const requiredSlotKeys = buildSlotLockKeys(bookingDate, occupiedStartAtMs, occupiedEndAtMs);
  const seats = Math.max(1, normalizeCapacity(capacity, 1));

  for (let seat = 0; seat < seats; seat += 1) {
    const isBlocked = requiredSlotKeys.some((slotKey) =>
      locks.some((row) => !ignore.has(row.id) && row.seat === seat && row.slotKey === slotKey)
    );
    if (!isBlocked) return true;
  }

  return false;
}

async function ensureWindowIsBookable(params: {
  companyId: string;
  staffId: string;
  bookingDate: string;
  occupiedStartAtMs: number;
  occupiedEndAtMs: number;
  capacity: number;
  ignoreLockIds?: string[];
}): Promise<void> {
  const { companyId, staffId, bookingDate, occupiedStartAtMs, occupiedEndAtMs, capacity, ignoreLockIds } = params;
  const { settings, blocks } = await fetchDayState(companyId, bookingDate, staffId);
  if (!settings.enabled) throw new Error("Online boeken staat uit voor dit bedrijf.");

  const day = settings.weekSchedule[dayKeyFromDateKey(bookingDate)];
  if (!day?.open) throw new Error("Deze dag is niet beschikbaar.");

  if (!candidateFitsInAnyRange(day.ranges, bookingDate, occupiedStartAtMs, occupiedEndAtMs)) {
    throw new Error("Tijdslot valt buiten de ingestelde beschikbaarheid.");
  }

  if (overlapsAnyBlock(blocks, occupiedStartAtMs, occupiedEndAtMs)) {
    throw new Error("Dit tijdslot is geblokkeerd.");
  }

  const hasSeat = await hasOpenSeatForWindow({
    companyId,
    staffId,
    bookingDate,
    occupiedStartAtMs,
    occupiedEndAtMs,
    capacity,
    ignoreLockIds,
  });
  if (!hasSeat) {
    throw new Error("Dit tijdslot is niet meer beschikbaar.");
  }
}

async function suggestNextSlotForBooking(row: Booking): Promise<BookingSlot | null> {
  const slots = await listAvailableBookingSlots({
    companyId: row.companyId,
    staffId: row.staffId,
    bookingDate: row.bookingDate,
    serviceDurationMin: row.serviceDurationMin,
    bufferBeforeMin: row.serviceBufferBeforeMin,
    bufferAfterMin: row.serviceBufferAfterMin,
    capacity: row.serviceCapacity,
  });

  const next = slots.find((slot) => slot.startAtMs > row.startAtMs);
  return next ?? null;
}

function candidateFitsInAnyRange(dayRanges: TimeRange[], bookingDate: string, occupiedStartMs: number, occupiedEndMs: number): boolean {
  return dayRanges.some((range) => {
    const startMin = toMinutes(range.start);
    const endMin = toMinutes(range.end);
    const rangeStartMs = dateFromDayAndMinutes(bookingDate, startMin).getTime();
    const rangeEndMs = dateFromDayAndMinutes(bookingDate, endMin).getTime();
    return occupiedStartMs >= rangeStartMs && occupiedEndMs <= rangeEndMs;
  });
}

function overlapsAnyBlock(blocks: BookingBlock[], occupiedStartMs: number, occupiedEndMs: number): boolean {
  return blocks.some((block) => overlaps(occupiedStartMs, occupiedEndMs, block.startAtMs, block.endAtMs));
}

function isPermissionDeniedError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return code.includes("permission-denied") || message.includes("missing or insufficient permissions");
}

function isMissingIndexError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return code.includes("failed-precondition") && message.includes("index");
}

function filterDayLocks(locks: SlotLock[], bookingDate: string, staffId?: string): SlotLock[] {
  const selectedStaffId = staffId?.trim() ?? "";
  return locks.filter(
    (row) =>
      row.bookingDate === bookingDate &&
      row.slotKey.length > 0 &&
      row.seat >= 0 &&
      (!selectedStaffId || row.staffId === selectedStaffId)
  );
}

async function fetchCompanyBookingsRaw(companyId: string): Promise<Booking[]> {
  const q = query(collection(db, "bookings"), where("companyId", "==", companyId));
  const snap = await getDocs(q);
  return snap.docs.map((row) => toBooking(row.id, row.data()));
}

async function fetchCompanyBlocksRaw(companyId: string): Promise<BookingBlock[]> {
  try {
    const snap = await getDocs(collection(db, "companies", companyId, "booking_blocks"));
    const rows = snap.docs.map((row) => toBookingBlock(row.id, companyId, row.data()));
    return rows.sort((a, b) => a.startAtMs - b.startAtMs);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      console.warn("[bookingRepo/fetchCompanyBlocksRaw] permission denied, fallback without blocks", error);
      return [];
    }
    throw error;
  }
}

async function fetchDayLocksRaw(companyId: string, bookingDate: string, staffId?: string): Promise<SlotLock[]> {
  try {
    const dayLocksQuery = query(
      collection(db, "booking_slot_locks"),
      where("companyId", "==", companyId),
      where("bookingDate", "==", bookingDate)
    );
    const snap = await getDocs(dayLocksQuery);
    return filterDayLocks(
      snap.docs.map((row) => toSlotLock(row.id, row.data())),
      bookingDate,
      staffId
    );
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      console.warn("[bookingRepo/fetchDayLocksRaw] permission denied, fallback without locks", error);
      return [];
    }
    if (isMissingIndexError(error)) {
      console.warn("[bookingRepo/fetchDayLocksRaw] missing index for day locks query, using fallback", error);
      try {
        const fallbackQuery = query(collection(db, "booking_slot_locks"), where("companyId", "==", companyId));
        const snap = await getDocs(fallbackQuery);
        return filterDayLocks(
          snap.docs.map((row) => toSlotLock(row.id, row.data())),
          bookingDate,
          staffId
        );
      } catch (fallbackError) {
        if (isPermissionDeniedError(fallbackError)) {
          console.warn("[bookingRepo/fetchDayLocksRaw] permission denied during fallback, using empty locks", fallbackError);
          return [];
        }
        throw fallbackError;
      }
    }
    throw error;
  }
}

export function getDefaultWeekSchedule(): BookingWeekSchedule {
  return {
    mon: getDefaultRanges(true),
    tue: getDefaultRanges(true),
    wed: getDefaultRanges(true),
    thu: getDefaultRanges(true),
    fri: getDefaultRanges(true),
    sat: getDefaultRanges(true),
    sun: getDefaultRanges(false),
  };
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateLabel(dateKey: string): string {
  return dateFromKey(dateKey).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function getDateKeysFromToday(days: number): string[] {
  const safeDays = Math.max(1, days);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const rows: string[] = [];
  for (let i = 0; i < safeDays; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    rows.push(formatDateKey(d));
  }
  return rows;
}

export function normalizeBookingSettings(data?: Record<string, unknown>): BookingSettings {
  const defaults = getDefaultWeekSchedule();
  const rawWeek = (data?.bookingWeekSchedule as Record<string, unknown> | undefined) ?? {};

  return {
    enabled: typeof data?.bookingEnabled === "boolean" ? Boolean(data.bookingEnabled) : true,
    intervalMin: normalizeInterval(data?.bookingIntervalMin),
    autoConfirm: typeof data?.bookingAutoConfirm === "boolean" ? Boolean(data.bookingAutoConfirm) : false,
    defaultCapacity: normalizeCapacity(data?.bookingDefaultCapacity, 1),
    weekSchedule: {
      mon: normalizeDay(rawWeek.mon, defaults.mon.open),
      tue: normalizeDay(rawWeek.tue, defaults.tue.open),
      wed: normalizeDay(rawWeek.wed, defaults.wed.open),
      thu: normalizeDay(rawWeek.thu, defaults.thu.open),
      fri: normalizeDay(rawWeek.fri, defaults.fri.open),
      sat: normalizeDay(rawWeek.sat, defaults.sat.open),
      sun: normalizeDay(rawWeek.sun, defaults.sun.open),
    },
  };
}

export async function getCompanyBookingSettings(companyId: string): Promise<BookingSettings> {
  const snap = await getDoc(doc(db, "companies_public", companyId));
  if (!snap.exists()) return normalizeBookingSettings();
  return normalizeBookingSettings(snap.data() as Record<string, unknown>);
}

export async function saveMyBookingSettings(companyId: string, settings: BookingSettings): Promise<void> {
  await setDoc(
    doc(db, "companies_public", companyId),
    {
      bookingEnabled: settings.enabled,
      bookingIntervalMin: normalizeInterval(settings.intervalMin),
      bookingAutoConfirm: Boolean(settings.autoConfirm),
      bookingDefaultCapacity: normalizeCapacity(settings.defaultCapacity, 1),
      bookingWeekSchedule: settings.weekSchedule,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchCompanyBookingBlocks(companyId: string): Promise<BookingBlock[]> {
  return fetchCompanyBlocksRaw(companyId);
}

export async function addMyBookingBlock(companyId: string, payload: BookingBlockPayload): Promise<void> {
  const startAtMs = Number(payload.startAtMs);
  const endAtMs = Number(payload.endAtMs);
  if (!Number.isFinite(startAtMs) || !Number.isFinite(endAtMs) || endAtMs <= startAtMs) {
    throw new Error("Ongeldige blokkade tijd.");
  }

  await addDoc(collection(db, "companies", companyId, "booking_blocks"), {
    startAt: new Date(startAtMs),
    endAt: new Date(endAtMs),
    allDay: Boolean(payload.allDay),
    reason: payload.reason?.trim() ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateMyBookingBlock(
  companyId: string,
  blockId: string,
  patch: Partial<BookingBlockPayload>
): Promise<void> {
  const nextPatch: Record<string, unknown> = {};

  if (typeof patch.startAtMs === "number") nextPatch.startAt = new Date(patch.startAtMs);
  if (typeof patch.endAtMs === "number") nextPatch.endAt = new Date(patch.endAtMs);
  if (typeof patch.allDay === "boolean") nextPatch.allDay = patch.allDay;
  if (typeof patch.reason === "string") nextPatch.reason = patch.reason.trim();

  await updateDoc(doc(db, "companies", companyId, "booking_blocks", blockId), {
    ...nextPatch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteMyBookingBlock(companyId: string, blockId: string): Promise<void> {
  await deleteDoc(doc(db, "companies", companyId, "booking_blocks", blockId));
}

function filterBookings(rows: Booking[], filter?: BookingQueryFilter): Booking[] {
  if (!filter) return rows;
  return rows.filter((row) => {
    if (filter.statuses?.length && !filter.statuses.includes(row.status)) return false;
    if (filter.serviceId && row.serviceId !== filter.serviceId) return false;
    if (filter.staffId && row.staffId !== filter.staffId) return false;
    if (filter.dateFrom && !isSameOrAfterDate(row.bookingDate, filter.dateFrom)) return false;
    if (filter.dateTo && !isSameOrBeforeDate(row.bookingDate, filter.dateTo)) return false;
    return true;
  });
}

export async function fetchCompanyBookings(companyId: string, filter?: BookingQueryFilter): Promise<Booking[]> {
  const rows = await fetchCompanyBookingsRaw(companyId);
  const visibleRows = rows.filter((row) => isPaymentSettledForCompany(row));
  return sortBookingsByStartAsc(normalizeBookingRows(filterBookings(visibleRows, filter)));
}

export async function fetchCompanyBookingInsights(companyId: string, top = 3): Promise<CompanyBookingInsights> {
  const safeTop = Math.max(1, Math.min(8, Math.floor(top)));
  const rows = (await fetchCompanyBookingsRaw(companyId)).filter((row) => isPaymentSettledForCompany(row));
  const counters = new Map<string, CompanyTopBookedService>();
  let totalBookings = 0;

  rows.forEach((row) => {
    // Cancelled/no-show rows are not counted as successful bookings for profile stats.
    if (row.status === "cancelled" || row.status === "no_show") return;
    totalBookings += 1;

    const serviceId = row.serviceId?.trim() ?? "";
    const serviceName = row.serviceName?.trim() || "Onbekende dienst";
    const key = serviceId ? `id:${serviceId}` : `name:${serviceName.toLowerCase()}`;
    const current = counters.get(key);
    if (current) {
      current.count += 1;
      return;
    }
    counters.set(key, {
      serviceId,
      serviceName,
      count: 1,
    });
  });

  const topServices = [...counters.values()]
    .sort((a, b) => b.count - a.count || a.serviceName.localeCompare(b.serviceName, "nl-NL"))
    .slice(0, safeTop);

  return {
    totalBookings,
    topServices,
  };
}

export async function fetchCustomerBookings(customerId: string): Promise<Booking[]> {
  const q = query(collection(db, "bookings"), where("customerId", "==", customerId));
  const snap = await getDocs(q);
  const rows = snap.docs.map((row) => toBooking(row.id, row.data()));
  return sortBookingsByCreatedDesc(normalizeBookingRows(rows));
}

export async function fetchInfluencerCommissionSummary(influencerId: string): Promise<InfluencerCommissionSummary> {
  const cleanInfluencerId = influencerId.trim();
  if (!cleanInfluencerId) {
    return {
      totalBookings: 0,
      confirmedBookings: 0,
      estimatedCommissionTotal: 0,
      confirmedCommissionTotal: 0,
      pendingCommissionTotal: 0,
    };
  }

  const q = query(collection(db, "bookings"), where("referralInfluencerId", "==", cleanInfluencerId));
  const snap = await getDocs(q);
  const rows = snap.docs.map((row) => toBooking(row.id, row.data()));

  let confirmedBookings = 0;
  let estimatedCommissionTotal = 0;
  let confirmedCommissionTotal = 0;
  let pendingCommissionTotal = 0;

  rows.forEach((row) => {
    const amount = Number(row.referralCommissionAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;

    estimatedCommissionTotal += amount;
    if (row.status === "completed") {
      confirmedBookings += 1;
      confirmedCommissionTotal += amount;
      return;
    }
    if (
      row.status === "pending" ||
      row.status === "reschedule_requested" ||
      row.status === "confirmed" ||
      row.status === "checked_in"
    ) {
      pendingCommissionTotal += amount;
    }
  });

  return {
    totalBookings: rows.length,
    confirmedBookings,
    estimatedCommissionTotal: Number(estimatedCommissionTotal.toFixed(2)),
    confirmedCommissionTotal: Number(confirmedCommissionTotal.toFixed(2)),
    pendingCommissionTotal: Number(pendingCommissionTotal.toFixed(2)),
  };
}

export async function fetchEmployeeBookings(employeeId: string, filter?: BookingQueryFilter): Promise<Booking[]> {
  const q = query(collection(db, "bookings"), where("staffId", "==", employeeId));
  const snap = await getDocs(q);
  const rows = snap.docs.map((row) => toBooking(row.id, row.data())).filter((row) => isPaymentSettledForCompany(row));
  return sortBookingsByStartAsc(normalizeBookingRows(filterBookings(rows, filter)));
}

export function subscribeCompanyBookings(
  companyId: string,
  onData: (items: Booking[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(collection(db, "bookings"), where("companyId", "==", companyId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((row: QueryDocumentSnapshot<DocumentData>) => toBooking(row.id, row.data()))
        .filter((row) => isPaymentSettledForCompany(row));
      onData(sortBookingsByStartAsc(normalizeBookingRows(rows)));
    },
    (error) => onError?.(error)
  );
}

export function subscribeCustomerBookings(
  customerId: string,
  onData: (items: Booking[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(collection(db, "bookings"), where("customerId", "==", customerId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row: QueryDocumentSnapshot<DocumentData>) => toBooking(row.id, row.data()));
      onData(sortBookingsByCreatedDesc(normalizeBookingRows(rows)));
    },
    (error) => onError?.(error)
  );
}

export function subscribeEmployeeBookings(
  employeeId: string,
  onData: (items: Booking[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  const q = query(collection(db, "bookings"), where("staffId", "==", employeeId));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((row: QueryDocumentSnapshot<DocumentData>) => toBooking(row.id, row.data()))
        .filter((row) => isPaymentSettledForCompany(row));
      onData(sortBookingsByStartAsc(normalizeBookingRows(rows)));
    },
    (error) => onError?.(error)
  );
}

async function fetchDayState(companyId: string, bookingDate: string, staffId?: string): Promise<{
  settings: BookingSettings;
  locks: SlotLock[];
  blocks: BookingBlock[];
}> {
  const [settings, dayLocks, allBlocks] = await Promise.all([
    getCompanyBookingSettings(companyId),
    fetchDayLocksRaw(companyId, bookingDate, staffId),
    fetchCompanyBlocksRaw(companyId),
  ]);

  const { dayStartMs, dayEndMs } = buildDayRangeMs(bookingDate);
  const dayBlocks = allBlocks.filter((block) => overlaps(block.startAtMs, block.endAtMs, dayStartMs, dayEndMs));

  return {
    settings,
    locks: dayLocks,
    blocks: dayBlocks,
  };
}

function roundToNextInterval(totalMinutes: number, intervalMin: number): number {
  const safe = Math.max(1, intervalMin);
  return Math.ceil(totalMinutes / safe) * safe;
}

export async function listAvailableBookingSlots(params: {
  companyId: string;
  staffId?: string;
  bookingDate: string;
  serviceDurationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  capacity?: number;
}): Promise<BookingSlot[]> {
  const {
    companyId,
    staffId,
    bookingDate,
    serviceDurationMin,
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
    capacity = 1,
  } = params;

  const selectedStaffId = staffId?.trim() || companyId;
  const { settings, locks, blocks } = await fetchDayState(companyId, bookingDate, selectedStaffId);
  if (!settings.enabled) return [];

  const day = settings.weekSchedule[dayKeyFromDateKey(bookingDate)];
  if (!day?.open) return [];

  const durationMin = Math.max(5, normalizeNonNegativeInt(serviceDurationMin, 0));
  const beforeMin = normalizeNonNegativeInt(bufferBeforeMin, 0);
  const afterMin = normalizeNonNegativeInt(bufferAfterMin, 0);
  const slotCapacity = normalizeCapacity(capacity, settings.defaultCapacity || 1);
  const intervalMin = normalizeInterval(settings.intervalMin);

  const now = new Date();
  const nowDateKey = formatDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const minStartMinutes = bookingDate === nowDateKey ? roundToNextInterval(nowMinutes + 5, intervalMin) : 0;

  const slots: BookingSlot[] = [];

  day.ranges.forEach((range) => {
    const rangeStart = toMinutes(range.start);
    const rangeEnd = toMinutes(range.end);
    if (rangeEnd <= rangeStart) return;

    for (let cursor = Math.max(rangeStart, minStartMinutes); cursor + durationMin <= rangeEnd; cursor += intervalMin) {
      const startAtMs = dateFromDayAndMinutes(bookingDate, cursor).getTime();
      const endAtMs = dateFromDayAndMinutes(bookingDate, cursor + durationMin).getTime();
      const occupiedStartAtMs = startAtMs - beforeMin * 60_000;
      const occupiedEndAtMs = endAtMs + afterMin * 60_000;

      const fitsRange = candidateFitsInAnyRange(day.ranges, bookingDate, occupiedStartAtMs, occupiedEndAtMs);
      if (!fitsRange) continue;
      if (overlapsAnyBlock(blocks, occupiedStartAtMs, occupiedEndAtMs)) continue;

      const requiredSlotKeys = buildSlotLockKeys(bookingDate, occupiedStartAtMs, occupiedEndAtMs);
      let reservedSeats = 0;
      for (let seat = 0; seat < slotCapacity; seat += 1) {
        const occupiedSeat = requiredSlotKeys.some((slotKey) =>
          locks.some((row) => row.seat === seat && row.slotKey === slotKey)
        );
        if (occupiedSeat) reservedSeats += 1;
      }
      const remainingCapacity = slotCapacity - reservedSeats;
      if (remainingCapacity <= 0) continue;

      slots.push({
        key: `${bookingDate}-${cursor}`,
        bookingDate,
        startAtMs,
        endAtMs,
        label: `${toTime(cursor)} - ${toTime(cursor + durationMin)}`,
        remainingCapacity,
        totalCapacity: slotCapacity,
      });
    }
  });

  return slots.sort((a, b) => a.startAtMs - b.startAtMs);
}

function assertStatusTransition(current: BookingStatus, next: BookingStatus, actor: "company" | "customer"): void {
  if (actor === "company") {
    if (current !== "pending" && current !== "reschedule_requested") {
      throw new Error("Alleen open aanvragen kunnen worden beoordeeld.");
    }
    if (next !== "confirmed" && next !== "cancelled") throw new Error("Ongeldige status.");
    return;
  }

  if (next !== "cancelled") throw new Error("Ongeldige status.");
  if (!isOpenRequest(current) && current !== "confirmed") {
    throw new Error("Deze boeking kan niet meer geannuleerd worden.");
  }
}

export async function createBooking(payload: CreateBookingPayload): Promise<{ bookingId: string; status: BookingStatus }> {
  if (!payload.companyId || !payload.serviceId || !payload.customerId) {
    throw new Error("Onvolledige boekingsgegevens.");
  }
  const actorId = auth.currentUser?.uid ?? "";
  if (!actorId) {
    throw new Error("Log in om een afspraak te boeken.");
  }
  if (actorId !== payload.customerId) {
    throw new Error("Je kunt alleen een afspraak voor je eigen account boeken.");
  }
  const actorRole = await getUserRole(actorId);
  if (actorRole && actorRole !== "customer") {
    throw new Error("Alleen klantaccounts kunnen een afspraak boeken.");
  }
  if (payload.customerName.trim().length < 2) {
    throw new Error("Vul een geldige naam in.");
  }
  if (payload.customerPhone.trim().length < 5) {
    throw new Error("Vul een geldig telefoonnummer in.");
  }

  const now = Date.now();
  if (payload.startAtMs < now - 60_000) {
    throw new Error("Dit tijdslot ligt in het verleden.");
  }
  const bookingDateForPayload = formatDateKey(new Date(payload.startAtMs));

  if (!payload.allowDoubleBooking) {
    const customerSameDaySnap = await getDocs(
      query(
        collection(db, "bookings"),
        where("customerId", "==", payload.customerId),
        where("bookingDate", "==", bookingDateForPayload)
      )
    );
    const existingConflict = customerSameDaySnap.docs
      .map((row) => toBooking(row.id, row.data()))
      .find((row) => row.status === "confirmed" || row.status === "checked_in");
    if (existingConflict) {
      const conflictTime = new Date(existingConflict.startAtMs).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      });
      throw new Error(
        `DOUBLE_BOOKING_WARNING::${existingConflict.id}::${conflictTime}::Je hebt vandaag al een afspraak om ${conflictTime}.`
      );
    }
  }

  const bookingRef = doc(collection(db, "bookings"));
  const selectedStaffId = payload.staffId?.trim() || payload.companyId;

  const result = await runTransaction(db, async (transaction) => {
    const companyRef = doc(db, "companies_public", payload.companyId);
    const serviceRef = doc(db, "companies_public", payload.companyId, "services_public", payload.serviceId);

    const [companySnap, serviceSnap] = await Promise.all([transaction.get(companyRef), transaction.get(serviceRef)]);
    if (!companySnap.exists()) throw new Error("Bedrijf niet gevonden.");
    if (!serviceSnap.exists()) throw new Error("Dienst niet gevonden.");

    const companyData = companySnap.data() as Record<string, unknown>;
    const serviceData = serviceSnap.data() as Record<string, unknown>;
    let selectedStaffName = payload.staffName?.trim() || String(companyData.name ?? "Salon team");

    if (!Boolean(companyData.isActive)) throw new Error("Dit bedrijf is momenteel niet beschikbaar.");
    if (!Boolean(serviceData.isActive)) throw new Error("Deze dienst is niet beschikbaar.");

    if (selectedStaffId !== payload.companyId) {
      const staffSnap = await transaction.get(
        doc(db, "companies_public", payload.companyId, "staff_public", selectedStaffId)
      );
      if (!staffSnap.exists()) {
        throw new Error("Geselecteerde medewerker is niet gevonden.");
      }

      const staffData = staffSnap.data() as Record<string, unknown>;
      if (typeof staffData.isActive === "boolean" && !staffData.isActive) {
        throw new Error("Geselecteerde medewerker is niet beschikbaar.");
      }

      selectedStaffName = String(staffData.displayName ?? selectedStaffName);
    }

    const settings = normalizeBookingSettings(companyData);
    if (!settings.enabled) throw new Error("Online boeken staat uit voor dit bedrijf.");

    const serviceDurationMin = Math.max(5, normalizeNonNegativeInt(serviceData.durationMin, 0));
    const serviceBufferBeforeMin = normalizeNonNegativeInt(serviceData.bufferBeforeMin, 0);
    const serviceBufferAfterMin = normalizeNonNegativeInt(serviceData.bufferAfterMin, 0);
    const serviceCapacity = effectiveBookingCapacity(settings, serviceData);
    const servicePrice = Number(serviceData.price ?? 0);

    const startAt = new Date(payload.startAtMs);
    const bookingDate = formatDateKey(startAt);
    const day = settings.weekSchedule[dayKeyFromDateKey(bookingDate)];
    if (!day.open) throw new Error("Deze dag is niet beschikbaar.");

    const endAtMs = payload.startAtMs + serviceDurationMin * 60_000;
    const occupiedStartAtMs = payload.startAtMs - serviceBufferBeforeMin * 60_000;
    const occupiedEndAtMs = endAtMs + serviceBufferAfterMin * 60_000;

    if (!candidateFitsInAnyRange(day.ranges, bookingDate, occupiedStartAtMs, occupiedEndAtMs)) {
      throw new Error("Tijdslot valt buiten de ingestelde beschikbaarheid.");
    }

    let blocks: BookingBlock[] = [];
    try {
      const blocksSnap = await getDocs(collection(db, "companies", payload.companyId, "booking_blocks"));
      blocks = blocksSnap.docs.map((row) => toBookingBlock(row.id, payload.companyId, row.data()));
    } catch (error) {
      if (!isPermissionDeniedError(error)) {
        throw error;
      }
      console.warn("[bookingRepo/createBooking] permission denied on booking_blocks, fallback without blocks", error);
    }

    if (overlapsAnyBlock(blocks, occupiedStartAtMs, occupiedEndAtMs)) {
      throw new Error("Dit tijdslot is geblokkeerd.");
    }

    const lockSlotKeys = buildSlotLockKeys(bookingDate, occupiedStartAtMs, occupiedEndAtMs);
    let chosenSeat = -1;
    let lockIds: string[] = [];

    for (let seat = 0; seat < serviceCapacity; seat += 1) {
      const candidateLockIds = lockSlotKeys.map((slotKey) =>
        buildSlotLockDocId(payload.companyId, selectedStaffId, bookingDate, seat, slotKey)
      );
      const legacyLockIds =
        selectedStaffId === payload.companyId
          ? lockSlotKeys.map((slotKey) => buildLegacySlotLockDocId(payload.companyId, bookingDate, seat, slotKey))
          : [];

      const lockSnaps = await Promise.all([
        ...candidateLockIds.map((lockId) => transaction.get(doc(db, "booking_slot_locks", lockId))),
        ...legacyLockIds.map((lockId) => transaction.get(doc(db, "booking_slot_locks", lockId))),
      ]);

      if (lockSnaps.every((snap) => !snap.exists())) {
        chosenSeat = seat;
        lockIds = candidateLockIds;
        break;
      }
    }

    if (chosenSeat < 0 || !lockIds.length) {
      throw new Error("Dit tijdslot is net bezet. Kies een ander moment.");
    }

    let referralInfo: {
      postId: string;
      influencerId: string;
      influencerName: string;
      commissionPercent: number;
      commissionAmount: number;
    } | null = null;

    const referralPostId = payload.referralPostId?.trim() || "";
    if (referralPostId) {
      const referralSnap = await transaction.get(doc(db, "feed_public", referralPostId));
      if (referralSnap.exists()) {
        const referralData = referralSnap.data() as Record<string, unknown>;
        const referralCompanyId = String(referralData.companyId ?? "").trim();
        const referralServiceId = String(referralData.serviceId ?? "").trim();
        const referralInfluencerId = String(referralData.influencerId ?? "").trim();
        const referralInfluencerName = String(referralData.influencerName ?? "").trim();
        const referralCreatorRole = String(referralData.creatorRole ?? "").trim();
        const referralIsActive = Boolean(referralData.isActive);
        const rawCommissionPercent = Number(
          referralData.influencerCommissionPercent ?? DEFAULT_INFLUENCER_COMMISSION_PERCENT
        );
        const commissionPercent = Number.isFinite(rawCommissionPercent)
          ? Math.max(0, Math.min(30, rawCommissionPercent))
          : DEFAULT_INFLUENCER_COMMISSION_PERCENT;
        const serviceMatches = !referralServiceId || referralServiceId === payload.serviceId;

        if (
          referralIsActive &&
          referralCreatorRole === "influencer" &&
          referralCompanyId === payload.companyId &&
          serviceMatches &&
          referralInfluencerId &&
          referralInfluencerId !== payload.customerId &&
          commissionPercent > 0
        ) {
          const commissionAmount = Number(((servicePrice * commissionPercent) / 100).toFixed(2));
          referralInfo = {
            postId: referralPostId,
            influencerId: referralInfluencerId,
            influencerName: referralInfluencerName,
            commissionPercent,
            commissionAmount,
          };
        }
      }
    }

    const status: BookingStatus = settings.autoConfirm ? "confirmed" : "pending";
    const nowDate = new Date();
    const reminder24hAtMs = payload.startAtMs - 24 * 60 * 60 * 1000;
    const reminderSameDayAtMs = payload.startAtMs - 2 * 60 * 60 * 1000;
    const reminder24hAt = reminder24hAtMs > now + 60_000 ? new Date(reminder24hAtMs) : null;
    const reminderSameDayAt =
      reminderSameDayAtMs > now + 60_000 ? new Date(reminderSameDayAtMs) : null;

    lockIds.forEach((lockId, index) => {
      transaction.set(doc(db, "booking_slot_locks", lockId), {
        companyId: payload.companyId,
        staffId: selectedStaffId,
        bookingDate,
        slotKey: lockSlotKeys[index],
        seat: chosenSeat,
        bookingId: bookingRef.id,
        userId: payload.customerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    transaction.set(bookingRef, {
      companyId: payload.companyId,
      companyName: String(companyData.name ?? "Onbekende salon"),
      companyLogoUrl: typeof companyData.logoUrl === "string" ? companyData.logoUrl : "",
      staffId: selectedStaffId,
      staffName: selectedStaffName,
      serviceId: payload.serviceId,
      serviceName: String(serviceData.name ?? "Dienst"),
      serviceCategory: String(serviceData.category ?? "Overig"),
      serviceDurationMin,
      serviceBufferBeforeMin,
      serviceBufferAfterMin,
      serviceCapacity,
      servicePrice,
      bookingDate,
      startAt,
      endAt: new Date(endAtMs),
      occupiedStartAt: new Date(occupiedStartAtMs),
      occupiedEndAt: new Date(occupiedEndAtMs),
      status,
      paymentStatus: "open",
      proposalBy: "",
      proposedBookingDate: "",
      proposedStartAt: null,
      proposedEndAt: null,
      proposedOccupiedStartAt: null,
      proposedOccupiedEndAt: null,
      proposedAt: null,
      customerRescheduleCount: 0,
      customerConfirmedAt: nowDate,
      companyConfirmedAt: status === "confirmed" ? nowDate : null,
      confirmedAt: status === "confirmed" ? nowDate : null,
      reminder24hAt,
      reminderSameDayAt,
      checkInCode: "",
      checkInCodeExpiresAt: null,
      checkInQrGeneratedAt: null,
      checkInConfirmedAt: null,
      checkInRejectedAt: null,
      checkInRejectedReason: "",
      completedAt: null,
      noShowReportedAt: null,
      customerId: payload.customerId,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      customerEmail: payload.customerEmail?.trim() ?? "",
      note: payload.note?.trim() ?? "",
      cancellationFeePercent: 0,
      cancellationFeeAmount: 0,
      referralPostId: referralInfo?.postId ?? "",
      referralInfluencerId: referralInfo?.influencerId ?? "",
      referralInfluencerName: referralInfo?.influencerName ?? "",
      referralCommissionPercent: referralInfo?.commissionPercent ?? 0,
      referralCommissionAmount: referralInfo?.commissionAmount ?? 0,
      amountCents: Math.max(0, Math.round(servicePrice * 100)),
      breakdown: {
        amountCents: Math.max(0, Math.round(servicePrice * 100)),
      },
      lockIds,
      lockSeat: chosenSeat,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      status,
      companyName: String(companyData.name ?? "Salon"),
      serviceName: String(serviceData.name ?? "Dienst"),
    };
  });

  // Keep user experience stable even if notification write fails.
  notifyCustomerOnBookingPaymentPending({
    customerId: payload.customerId,
    companyId: payload.companyId,
    companyName: result.companyName,
    serviceId: payload.serviceId,
    serviceName: result.serviceName,
    bookingId: bookingRef.id,
  }).catch(() => null);

  return {
    bookingId: bookingRef.id,
    status: result.status,
  };
}

export async function setBookingStatusByCompany(
  bookingId: string,
  companyId: string,
  status: "confirmed" | "declined" | "cancelled"
): Promise<void> {
  let notifyPayload: {
    customerId: string;
    companyId: string;
    companyName: string;
    serviceId: string;
    serviceName: string;
  } | null = null;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze boeking.");
    if (!canCompanyManageBooking(row)) {
      throw new Error("Deze boeking kan pas worden verwerkt nadat de betaling is afgerond.");
    }

    const targetStatus: BookingStatus = status === "declined" ? "cancelled" : status;
    assertStatusTransition(row.status, targetStatus, "company");
    notifyPayload = {
      customerId: row.customerId,
      companyId: row.companyId,
      companyName: row.companyName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    if (targetStatus === "cancelled") {
      releaseSlotLocks(transaction, getBookingLockIds(row));
    }

    transaction.update(ref, {
      status: targetStatus,
      ...(targetStatus === "confirmed"
        ? {
            companyConfirmedAt: serverTimestamp(),
            confirmedAt: serverTimestamp(),
          }
        : null),
      ...clearProposalPatch(),
      updatedAt: serverTimestamp(),
    });
  });

  const statusNotifyPayload = notifyPayload as
    | {
        customerId: string;
        companyId: string;
        companyName: string;
        serviceId: string;
        serviceName: string;
      }
    | null;
  if (statusNotifyPayload) {
    const actorId = auth.currentUser?.uid ?? companyId;
    const actorRole = actorId === companyId ? "company" : "employee";
    notifyCustomerOnBookingStatusByCompany({
      customerId: statusNotifyPayload.customerId,
      companyId: statusNotifyPayload.companyId,
      companyName: statusNotifyPayload.companyName,
      serviceId: statusNotifyPayload.serviceId,
      serviceName: statusNotifyPayload.serviceName,
      bookingId,
      status: status === "declined" ? "cancelled" : status,
      actorId,
      actorRole,
    }).catch(() => null);
  }
}

async function reserveLocksInTransaction(
  transaction: Transaction,
  params: {
    bookingId: string;
    companyId: string;
    staffId: string;
    customerId: string;
    bookingDate: string;
    occupiedStartAtMs: number;
    occupiedEndAtMs: number;
    capacity: number;
    ignoreLockIds?: string[];
  }
): Promise<{ lockIds: string[]; seat: number; slotKeys: string[] }> {
  const {
    bookingId,
    companyId,
    staffId,
    customerId,
    bookingDate,
    occupiedStartAtMs,
    occupiedEndAtMs,
    capacity,
    ignoreLockIds = [],
  } = params;

  const ignoreSet = new Set(ignoreLockIds);
  const slotKeys = buildSlotLockKeys(bookingDate, occupiedStartAtMs, occupiedEndAtMs);
  const seats = Math.max(1, normalizeCapacity(capacity, 1));

  for (let seat = 0; seat < seats; seat += 1) {
    const candidateLockIds = slotKeys.map((slotKey) =>
      buildSlotLockDocId(companyId, staffId, bookingDate, seat, slotKey)
    );
    const legacyLockIds =
      staffId === companyId
        ? slotKeys.map((slotKey) => buildLegacySlotLockDocId(companyId, bookingDate, seat, slotKey))
        : [];
    const lockCheckIds = [...candidateLockIds, ...legacyLockIds];
    const lockSnaps = await Promise.all(
      lockCheckIds.map((lockId) => transaction.get(doc(db, "booking_slot_locks", lockId)))
    );

    const isBlocked = lockSnaps.some((snap, index) => snap.exists() && !ignoreSet.has(lockCheckIds[index]));
    if (isBlocked) continue;

    candidateLockIds.forEach((lockId, index) => {
      transaction.set(doc(db, "booking_slot_locks", lockId), {
        companyId,
        staffId,
        bookingDate,
        slotKey: slotKeys[index],
        seat,
        bookingId,
        userId: customerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return {
      lockIds: candidateLockIds,
      seat,
      slotKeys,
    };
  }

  throw new Error("Dit voorgestelde tijdslot is niet meer beschikbaar.");
}

export async function proposeBookingTimeByCompany(params: {
  bookingId: string;
  companyId: string;
  proposedStartAtMs: number;
  proposalNote?: string;
}): Promise<void> {
  const { bookingId, companyId, proposedStartAtMs, proposalNote } = params;
  const snap = await getDoc(doc(db, "bookings", bookingId));
  if (!snap.exists()) throw new Error("Boeking niet gevonden.");

  const row = toBooking(snap.id, snap.data());
  if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze boeking.");
  if (!canCompanyManageBooking(row)) {
    throw new Error("Deze boeking kan pas worden aangepast nadat de betaling is afgerond.");
  }
  if (row.status !== "pending" && row.status !== "confirmed") {
    throw new Error("Alleen open of bevestigde afspraken kunnen een alternatief tijdstip krijgen.");
  }
  if (!Number.isFinite(proposedStartAtMs) || proposedStartAtMs <= Date.now() - 60_000) {
    throw new Error("Kies een geldig toekomstig tijdstip.");
  }
  if (Math.abs(proposedStartAtMs - row.startAtMs) < 60_000) {
    throw new Error("Kies een ander tijdstip dan de huidige aanvraag.");
  }

  const window = buildWindowFromStart(
    proposedStartAtMs,
    row.serviceDurationMin,
    row.serviceBufferBeforeMin,
    row.serviceBufferAfterMin
  );
  const cleanedProposalNote =
    typeof proposalNote === "string" ? proposalNote.trim().slice(0, 240) : "";

  await ensureWindowIsBookable({
    companyId,
    staffId: row.staffId,
    bookingDate: window.bookingDate,
    occupiedStartAtMs: window.occupiedStartAtMs,
    occupiedEndAtMs: window.occupiedEndAtMs,
    capacity: row.serviceCapacity,
    ignoreLockIds: row.lockIds,
  });

  await updateDoc(doc(db, "bookings", bookingId), {
    status: "reschedule_requested",
    proposalBy: "company",
    proposedBookingDate: window.bookingDate,
    proposedStartAt: new Date(window.startAtMs),
    proposedEndAt: new Date(window.endAtMs),
    proposedOccupiedStartAt: new Date(window.occupiedStartAtMs),
    proposedOccupiedEndAt: new Date(window.occupiedEndAtMs),
    proposedAt: serverTimestamp(),
    proposalNote: cleanedProposalNote,
    companyConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  notifyCustomerOnBookingProposalByCompany({
    customerId: row.customerId,
    companyId: row.companyId,
    companyName: row.companyName,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    bookingId,
    proposedStartAtMs: window.startAtMs,
    actorId: auth.currentUser?.uid ?? companyId,
    actorRole: (auth.currentUser?.uid ?? companyId) === companyId ? "company" : "employee",
  }).catch(() => null);
}

export async function proposeNextBookingTimeByCompany(
  bookingId: string,
  companyId: string
): Promise<{ proposedStartAtMs: number }> {
  const snap = await getDoc(doc(db, "bookings", bookingId));
  if (!snap.exists()) throw new Error("Boeking niet gevonden.");
  const row = toBooking(snap.id, snap.data());
  if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze boeking.");
  if (!canCompanyManageBooking(row)) {
    throw new Error("Deze boeking kan pas worden aangepast nadat de betaling is afgerond.");
  }
  if (row.status !== "pending" && row.status !== "confirmed") {
    throw new Error("Alleen open of bevestigde afspraken kunnen een alternatief tijdstip krijgen.");
  }

  const nextSlot = await suggestNextSlotForBooking(row);
  if (!nextSlot) throw new Error("Geen alternatief tijdslot beschikbaar op deze dag.");

  await proposeBookingTimeByCompany({
    bookingId,
    companyId,
    proposedStartAtMs: nextSlot.startAtMs,
  });

  return {
    proposedStartAtMs: nextSlot.startAtMs,
  };
}

export async function acceptCompanyProposalByCustomer(bookingId: string, customerId: string): Promise<void> {
  let notifyPayload: {
    companyId: string;
    customerId: string;
    customerName: string;
    serviceId: string;
    serviceName: string;
  } | null = null;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze boeking.");
    if (row.status !== "reschedule_requested" || row.proposalBy !== "company") {
      throw new Error("Er is geen voorstel van het bedrijf om te bevestigen.");
    }
    notifyPayload = {
      companyId: row.companyId,
      customerId: row.customerId,
      customerName: row.customerName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    const proposedStartAtMs = row.proposedStartAtMs || 0;
    const proposedEndAtMs = row.proposedEndAtMs || 0;
    const proposedOccupiedStartAtMs = row.proposedOccupiedStartAtMs || 0;
    const proposedOccupiedEndAtMs = row.proposedOccupiedEndAtMs || 0;
    const proposedBookingDate = row.proposedBookingDate || formatDateKey(new Date(proposedStartAtMs));

    if (!proposedStartAtMs || !proposedEndAtMs || !proposedOccupiedStartAtMs || !proposedOccupiedEndAtMs) {
      throw new Error("Voorstelgegevens ontbreken.");
    }

    const reservation = await reserveLocksInTransaction(transaction, {
      bookingId: row.id,
      companyId: row.companyId,
      staffId: row.staffId,
      customerId: row.customerId,
      bookingDate: proposedBookingDate,
      occupiedStartAtMs: proposedOccupiedStartAtMs,
      occupiedEndAtMs: proposedOccupiedEndAtMs,
      capacity: row.serviceCapacity,
      ignoreLockIds: row.lockIds,
    });

    releaseSlotLocks(transaction, getBookingLockIds(row));

    transaction.update(ref, {
      bookingDate: proposedBookingDate,
      startAt: new Date(proposedStartAtMs),
      endAt: new Date(proposedEndAtMs),
      occupiedStartAt: new Date(proposedOccupiedStartAtMs),
      occupiedEndAt: new Date(proposedOccupiedEndAtMs),
      lockIds: reservation.lockIds,
      lockSeat: reservation.seat,
      status: "confirmed",
      customerConfirmedAt: serverTimestamp(),
      confirmedAt: serverTimestamp(),
      ...clearProposalPatch(),
      updatedAt: serverTimestamp(),
    });
  });

  const proposalAcceptedNotifyPayload = notifyPayload as
    | {
        companyId: string;
        customerId: string;
        customerName: string;
        serviceId: string;
        serviceName: string;
      }
    | null;
  if (proposalAcceptedNotifyPayload) {
    notifyCompanyOnBookingProposalDecisionByCustomer({
      companyId: proposalAcceptedNotifyPayload.companyId,
      customerId: proposalAcceptedNotifyPayload.customerId,
      customerName: proposalAcceptedNotifyPayload.customerName,
      serviceId: proposalAcceptedNotifyPayload.serviceId,
      serviceName: proposalAcceptedNotifyPayload.serviceName,
      bookingId,
      decision: "accepted",
    }).catch(() => null);
  }
}

export async function declineCompanyProposalByCustomer(bookingId: string, customerId: string): Promise<void> {
  let notifyPayload: {
    companyId: string;
    customerId: string;
    customerName: string;
    serviceId: string;
    serviceName: string;
  } | null = null;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze boeking.");
    if (row.status !== "reschedule_requested" || row.proposalBy !== "company") {
      throw new Error("Er is geen voorstel om te weigeren.");
    }
    notifyPayload = {
      companyId: row.companyId,
      customerId: row.customerId,
      customerName: row.customerName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    releaseSlotLocks(transaction, getBookingLockIds(row));
    transaction.update(ref, {
      status: "cancelled",
      ...clearProposalPatch(),
      updatedAt: serverTimestamp(),
    });
  });

  const proposalDeclinedNotifyPayload = notifyPayload as
    | {
        companyId: string;
        customerId: string;
        customerName: string;
        serviceId: string;
        serviceName: string;
      }
    | null;
  if (proposalDeclinedNotifyPayload) {
    notifyCompanyOnBookingProposalDecisionByCustomer({
      companyId: proposalDeclinedNotifyPayload.companyId,
      customerId: proposalDeclinedNotifyPayload.customerId,
      customerName: proposalDeclinedNotifyPayload.customerName,
      serviceId: proposalDeclinedNotifyPayload.serviceId,
      serviceName: proposalDeclinedNotifyPayload.serviceName,
      bookingId,
      decision: "declined",
    }).catch(() => null);
  }
}

export async function requestSameDayRescheduleByCustomer(
  bookingId: string,
  customerId: string
): Promise<{ proposedStartAtMs: number }> {
  const snap = await getDoc(doc(db, "bookings", bookingId));
  if (!snap.exists()) throw new Error("Boeking niet gevonden.");
  const row = toBooking(snap.id, snap.data());
  if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze boeking.");
  if (row.status !== "confirmed") throw new Error("Alleen bevestigde afspraken kunnen verplaatst worden.");
  if (!isSameCalendarDay(row.bookingDate, Date.now())) {
    throw new Error("Verplaatsen kan alleen op de dag van de afspraak.");
  }
  if ((row.customerRescheduleCount || 0) >= SAME_DAY_RESCHEDULE_LIMIT) {
    throw new Error("Je kunt deze afspraak vandaag niet nog een keer verplaatsen.");
  }

  const nextSlot = await suggestNextSlotForBooking(row);
  if (!nextSlot) throw new Error("Geen alternatief tijdslot beschikbaar vandaag.");
  if (formatDateKey(new Date(nextSlot.startAtMs)) !== row.bookingDate) {
    throw new Error("Verplaatsen kan alleen naar een tijdslot op dezelfde dag.");
  }

  const window = buildWindowFromStart(
    nextSlot.startAtMs,
    row.serviceDurationMin,
    row.serviceBufferBeforeMin,
    row.serviceBufferAfterMin
  );

  await ensureWindowIsBookable({
    companyId: row.companyId,
    staffId: row.staffId,
    bookingDate: window.bookingDate,
    occupiedStartAtMs: window.occupiedStartAtMs,
    occupiedEndAtMs: window.occupiedEndAtMs,
    capacity: row.serviceCapacity,
    ignoreLockIds: row.lockIds,
  });

  await updateDoc(doc(db, "bookings", bookingId), {
    status: "reschedule_requested",
    proposalBy: "customer",
    proposedBookingDate: window.bookingDate,
    proposedStartAt: new Date(window.startAtMs),
    proposedEndAt: new Date(window.endAtMs),
    proposedOccupiedStartAt: new Date(window.occupiedStartAtMs),
    proposedOccupiedEndAt: new Date(window.occupiedEndAtMs),
    proposedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  notifyCompanyOnRescheduleRequestByCustomer({
    companyId: row.companyId,
    customerId: row.customerId,
    customerName: row.customerName,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    bookingId,
    proposedStartAtMs: window.startAtMs,
  }).catch(() => null);

  return {
    proposedStartAtMs: window.startAtMs,
  };
}

export async function respondToCustomerRescheduleByCompany(
  bookingId: string,
  companyId: string,
  decision: "approved" | "declined"
): Promise<void> {
  let notifyPayload: {
    customerId: string;
    companyId: string;
    companyName: string;
    serviceId: string;
    serviceName: string;
  } | null = null;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze boeking.");
    if (!canCompanyManageBooking(row)) {
      throw new Error("Deze boeking kan pas worden verwerkt nadat de betaling is afgerond.");
    }
    if (row.status !== "reschedule_requested" || row.proposalBy !== "customer") {
      throw new Error("Er staat geen verplaatsingsaanvraag open.");
    }
    notifyPayload = {
      customerId: row.customerId,
      companyId: row.companyId,
      companyName: row.companyName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    if (decision === "declined") {
      transaction.update(ref, {
        status: "confirmed",
        ...clearProposalPatch(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const proposedStartAtMs = row.proposedStartAtMs || 0;
    const proposedEndAtMs = row.proposedEndAtMs || 0;
    const proposedOccupiedStartAtMs = row.proposedOccupiedStartAtMs || 0;
    const proposedOccupiedEndAtMs = row.proposedOccupiedEndAtMs || 0;
    const proposedBookingDate = row.proposedBookingDate || formatDateKey(new Date(proposedStartAtMs));

    if (!proposedStartAtMs || !proposedEndAtMs || !proposedOccupiedStartAtMs || !proposedOccupiedEndAtMs) {
      throw new Error("Voorstelgegevens ontbreken.");
    }

    const reservation = await reserveLocksInTransaction(transaction, {
      bookingId: row.id,
      companyId: row.companyId,
      staffId: row.staffId,
      customerId: row.customerId,
      bookingDate: proposedBookingDate,
      occupiedStartAtMs: proposedOccupiedStartAtMs,
      occupiedEndAtMs: proposedOccupiedEndAtMs,
      capacity: row.serviceCapacity,
      ignoreLockIds: row.lockIds,
    });

    releaseSlotLocks(transaction, getBookingLockIds(row));

    transaction.update(ref, {
      bookingDate: proposedBookingDate,
      startAt: new Date(proposedStartAtMs),
      endAt: new Date(proposedEndAtMs),
      occupiedStartAt: new Date(proposedOccupiedStartAtMs),
      occupiedEndAt: new Date(proposedOccupiedEndAtMs),
      lockIds: reservation.lockIds,
      lockSeat: reservation.seat,
      customerRescheduleCount: (row.customerRescheduleCount || 0) + 1,
      status: "confirmed",
      companyConfirmedAt: serverTimestamp(),
      confirmedAt: serverTimestamp(),
      ...clearProposalPatch(),
      updatedAt: serverTimestamp(),
    });
  });

  const rescheduleNotifyPayload = notifyPayload as
    | {
        customerId: string;
        companyId: string;
        companyName: string;
        serviceId: string;
        serviceName: string;
      }
    | null;
  if (rescheduleNotifyPayload) {
    const actorId = auth.currentUser?.uid ?? companyId;
    const actorRole = actorId === companyId ? "company" : "employee";
    notifyCustomerOnRescheduleDecisionByCompany({
      customerId: rescheduleNotifyPayload.customerId,
      companyId: rescheduleNotifyPayload.companyId,
      companyName: rescheduleNotifyPayload.companyName,
      serviceId: rescheduleNotifyPayload.serviceId,
      serviceName: rescheduleNotifyPayload.serviceName,
      bookingId,
      decision,
      actorId,
      actorRole,
    }).catch(() => null);
  }
}

export async function cancelBookingByCustomer(
  bookingId: string,
  customerId: string
): Promise<{ feePercent: number; feeAmount: number }> {
  const nowMs = Date.now();
  let feeResult = { feePercent: 0, feeAmount: 0 };
  let notifyPayload: {
    companyId: string;
    customerId: string;
    customerName: string;
    serviceId: string;
    serviceName: string;
    feePercent: number;
    notifyCompany: boolean;
  } | null = null;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze boeking.");

    const paymentSettled = isPaymentSettledForCompany(row);
    const computed = paymentSettled
      ? computeCancellationFee(row.startAtMs, row.servicePrice, nowMs)
      : { percent: 0, amount: 0 };
    const nextStatus: BookingStatus = "cancelled";

    assertStatusTransition(row.status, nextStatus, "customer");

    releaseSlotLocks(transaction, getBookingLockIds(row));
    feeResult = {
      feePercent: computed.percent,
      feeAmount: computed.amount,
    };
    notifyPayload = {
      companyId: row.companyId,
      customerId: row.customerId,
      customerName: row.customerName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      feePercent: computed.percent,
      notifyCompany: paymentSettled,
    };

    transaction.update(ref, {
      status: nextStatus,
      cancellationFeePercent: computed.percent,
      cancellationFeeAmount: computed.amount,
      ...(row.paymentStatus && row.paymentStatus !== "paid" ? { paymentStatus: "canceled" } : null),
      ...clearProposalPatch(),
      updatedAt: serverTimestamp(),
    });
  });
  const cancelNotifyPayload = notifyPayload as
    | {
        companyId: string;
        customerId: string;
        customerName: string;
        serviceId: string;
        serviceName: string;
        feePercent: number;
        notifyCompany: boolean;
      }
    | null;
  if (cancelNotifyPayload?.notifyCompany) {
    notifyCompanyOnBookingCancelledByCustomer({
      companyId: cancelNotifyPayload.companyId,
      customerId: cancelNotifyPayload.customerId,
      customerName: cancelNotifyPayload.customerName,
      serviceId: cancelNotifyPayload.serviceId,
      serviceName: cancelNotifyPayload.serviceName,
      bookingId,
      feePercent: cancelNotifyPayload.feePercent,
    }).catch(() => null);
  }

  return feeResult;
}

function generateCheckInCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function generateBookingCheckInCodeByCompany(
  bookingId: string,
  companyId: string
): Promise<{ code: string; expiresAtMs: number }> {
  const nowMs = Date.now();
  const expiresAtMs = nowMs + CHECK_IN_CODE_TTL_MIN * 60_000;
  const code = generateCheckInCode();

  const notifyPayload = await runTransaction<
    | {
        customerId: string;
        companyId: string;
        companyName: string;
        serviceId: string;
        serviceName: string;
      }
    | null
  >(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze boeking.");
    if (row.status !== "confirmed") throw new Error("Check-in QR kan alleen voor bevestigde afspraken.");
    if (!canCompanyManageBooking(row)) {
      throw new Error("Deze boeking kan pas worden verwerkt nadat de betaling is afgerond.");
    }

    const payload = {
      customerId: row.customerId,
      companyId: row.companyId,
      companyName: row.companyName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    transaction.update(ref, {
      checkInCode: code,
      checkInCodeLast: code,
      checkInCodeExpiresAt: new Date(expiresAtMs),
      checkInQrGeneratedAt: serverTimestamp(),
      checkInRejectedAt: null,
      checkInRejectedReason: "",
      updatedAt: serverTimestamp(),
    });
    return payload;
  });

  if (notifyPayload) {
    notifyCustomerOnBookingCheckInReady({
      customerId: notifyPayload.customerId,
      companyId: notifyPayload.companyId,
      companyName: notifyPayload.companyName,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
  }

  return { code, expiresAtMs };
}

export async function confirmBookingCheckInByCustomer(params: {
  bookingId: string;
  customerId: string;
  code: string;
}): Promise<void> {
  const { bookingId, customerId, code } = params;
  const cleanCode = String(code || "").trim();
  if (!cleanCode) throw new Error("Check-in code ontbreekt.");

  const notifyPayload = await runTransaction<
    | {
        companyId: string;
        companyName: string;
        serviceId: string;
        serviceName: string;
        customerId: string;
        customerName: string;
      }
    | null
  >(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");
    const row = toBooking(snap.id, snap.data());

    if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze booking.");
    if (row.status === "checked_in") return null;
    if (row.status !== "confirmed") throw new Error("Deze afspraak kan nu niet ingecheckt worden.");
    if (!isPaymentSettledForCompany(row)) {
      throw new Error("Check-in kan pas nadat de betaling is afgerond.");
    }
    if (!row.checkInCode || row.checkInCode !== cleanCode) {
      throw new Error("Ongeldige check-in code.");
    }
    if (row.checkInCodeExpiresAtMs && row.checkInCodeExpiresAtMs < Date.now()) {
      throw new Error("Deze check-in code is verlopen.");
    }

    const payload = {
      companyId: row.companyId,
      companyName: row.companyName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      customerId: row.customerId,
      customerName: row.customerName,
    };

    transaction.update(ref, {
      status: "checked_in",
      checkInConfirmedAt: serverTimestamp(),
      checkInCodeLast: row.checkInCode || "",
      checkInCode: "",
      checkInCodeExpiresAt: null,
      checkInRejectedAt: null,
      checkInRejectedReason: "",
      updatedAt: serverTimestamp(),
    });
    return payload;
  });

  if (notifyPayload) {
    notifyCompanyOnBookingCheckedIn({
      companyId: notifyPayload.companyId,
      customerId: notifyPayload.customerId,
      customerName: notifyPayload.customerName,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
    notifyCustomerOnBookingCheckedIn({
      customerId: notifyPayload.customerId,
      companyId: notifyPayload.companyId,
      companyName: notifyPayload.companyName,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
  }
}

export async function rejectBookingCheckInByCustomer(params: {
  bookingId: string;
  customerId: string;
  code: string;
  reason: string;
}): Promise<void> {
  const { bookingId, customerId, code, reason } = params;
  const cleanCode = String(code || "").trim();
  const cleanReason = String(reason || "").trim().slice(0, 280);
  if (!cleanCode) throw new Error("Check-in code ontbreekt.");
  if (cleanReason.length < 3) throw new Error("Geef een reden op.");

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");
    const row = toBooking(snap.id, snap.data());

    if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze booking.");
    if (row.status !== "confirmed") throw new Error("Deze afspraak kan nu niet geweigerd worden.");
    if (!row.checkInCode || row.checkInCode !== cleanCode) {
      throw new Error("Ongeldige check-in code.");
    }
    if (row.checkInCodeExpiresAtMs && row.checkInCodeExpiresAtMs < Date.now()) {
      throw new Error("Deze check-in code is verlopen.");
    }

    transaction.update(ref, {
      checkInRejectedAt: serverTimestamp(),
      checkInRejectedReason: cleanReason,
      updatedAt: serverTimestamp(),
    });
  });

  await addDoc(collection(db, "admin_reports"), {
    type: "checkin_rejected",
    bookingId,
    customerId,
    reason: cleanReason,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => null);
}

export async function markBookingCompletedByCompany(
  bookingId: string,
  companyId: string
): Promise<void> {
  const notifyPayload = await runTransaction<
    | {
        customerId: string;
        companyId: string;
        companyName: string;
        serviceId: string;
        serviceName: string;
      }
    | null
  >(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");
    const row = toBooking(snap.id, snap.data());

    if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze booking.");
    if (!canCompanyManageBooking(row)) {
      throw new Error("Deze boeking kan pas worden verwerkt nadat de betaling is afgerond.");
    }
    if (row.status !== "checked_in") {
      throw new Error("Alleen ingecheckte afspraken kunnen worden afgerond.");
    }

    const payload = {
      customerId: row.customerId,
      companyId: row.companyId,
      companyName: row.companyName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    transaction.update(ref, {
      status: "completed",
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return payload;
  });

  if (notifyPayload) {
    notifyCompanyOnBookingCompleted({
      companyId: notifyPayload.companyId,
      customerId: notifyPayload.customerId,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
    notifyCustomerOnBookingCompleted({
      customerId: notifyPayload.customerId,
      companyId: notifyPayload.companyId,
      companyName: notifyPayload.companyName,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
  }
}

export async function reportBookingNoShowByCompany(params: {
  bookingId: string;
  companyId: string;
  reason?: string;
}): Promise<void> {
  const { bookingId, companyId, reason } = params;
  const cleanReason = String(reason || "").trim().slice(0, 240);

  const notifyPayload = await runTransaction<
    | {
        customerId: string;
        companyId: string;
        companyName: string;
        serviceId: string;
        serviceName: string;
      }
    | null
  >(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");
    const row = toBooking(snap.id, snap.data());

    if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze booking.");
    if (!canCompanyManageBooking(row)) {
      throw new Error("Deze boeking kan pas worden verwerkt nadat de betaling is afgerond.");
    }
    if (row.status !== "confirmed") {
      throw new Error("No-show kan alleen op bevestigde afspraken.");
    }
    if (Date.now() < row.startAtMs + NO_SHOW_GRACE_MIN * 60_000) {
      throw new Error(`No-show kan pas ${NO_SHOW_GRACE_MIN} minuten na de starttijd gemeld worden.`);
    }

    const payload = {
      customerId: row.customerId,
      companyId: row.companyId,
      companyName: row.companyName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
    };

    releaseSlotLocks(transaction, getBookingLockIds(row));
    transaction.update(ref, {
      status: "no_show",
      noShowReportedAt: serverTimestamp(),
      noShowReason: cleanReason,
      updatedAt: serverTimestamp(),
    });
    return payload;
  });

  if (notifyPayload) {
    notifyCompanyOnBookingNoShow({
      companyId: notifyPayload.companyId,
      customerId: notifyPayload.customerId,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
    notifyCustomerOnBookingNoShow({
      customerId: notifyPayload.customerId,
      companyId: notifyPayload.companyId,
      companyName: notifyPayload.companyName,
      serviceId: notifyPayload.serviceId,
      serviceName: notifyPayload.serviceName,
      bookingId,
    }).catch(() => null);
  }

  await addDoc(collection(db, "admin_reports"), {
    type: "booking_no_show",
    bookingId,
    companyId,
    reason: cleanReason,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }).catch(() => null);
}

export async function fetchCompanyBookingSlotsForDate(params: {
  companyId: string;
  staffId?: string;
  bookingDate: string;
  serviceDurationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  capacity?: number;
}): Promise<BookingSlot[]> {
  return listAvailableBookingSlots(params);
}

export async function fetchCompanySummaryForBooking(companyId: string): Promise<{ companyName: string }> {
  const company = await fetchCompanyById(companyId);
  return { companyName: company?.name ?? "Salon" };
}

// Dashboard-focused aliases keep screen code readable.
export async function fetchBookings(businessId: string, filter?: BookingQueryFilter): Promise<Booking[]> {
  return fetchCompanyBookings(businessId, filter);
}

export function subscribeBookings(
  businessId: string,
  onData: (items: Booking[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return subscribeCompanyBookings(businessId, onData, onError);
}

export async function acceptBooking(bookingId: string, businessId: string): Promise<void> {
  return setBookingStatusByCompany(bookingId, businessId, "confirmed");
}

export async function rejectBooking(bookingId: string, businessId: string): Promise<void> {
  return setBookingStatusByCompany(bookingId, businessId, "cancelled");
}
