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
import { db } from "./firebase";
import { fetchCompanyById } from "./companyRepo";
import { notifyCompanyOnBookingRequest } from "./notificationRepo";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled_by_customer";

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
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  note?: string;
  lockIds: string[];
  lockSeat?: number;
  createdAtMs: number;
  updatedAtMs: number;
};

export type CreateBookingPayload = {
  companyId: string;
  serviceId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  note?: string;
  startAtMs: number;
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
};

const DEFAULT_RANGE = { start: "09:00", end: "18:00" } as const;
const VALID_INTERVALS = [10, 15, 20, 30, 45, 60];
const ACTIVE_STATUSES: BookingStatus[] = ["pending", "confirmed"];
const SLOT_LOCK_STEP_MIN = 5;

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
  const value = String(raw ?? "pending");
  return value === "confirmed" || value === "declined" || value === "cancelled_by_customer"
    ? value
    : "pending";
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

function buildSlotLockDocId(companyId: string, bookingDate: string, seat: number, slotKey: string): string {
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

  return {
    id,
    companyId: String(data.companyId ?? ""),
    companyName: String(data.companyName ?? "Onbekende salon"),
    companyLogoUrl: typeof data.companyLogoUrl === "string" ? data.companyLogoUrl : undefined,
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
    customerId: String(data.customerId ?? ""),
    customerName: String(data.customerName ?? ""),
    customerPhone: String(data.customerPhone ?? ""),
    customerEmail: typeof data.customerEmail === "string" ? data.customerEmail : undefined,
    note: typeof data.note === "string" ? data.note : undefined,
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

function overlapCount(rows: Booking[], occupiedStartMs: number, occupiedEndMs: number): number {
  return rows.filter((row) => {
    if (!ACTIVE_STATUSES.includes(row.status)) return false;
    const window = getBookingOccupiedWindow(row);
    return overlaps(occupiedStartMs, occupiedEndMs, window.occupiedStartAtMs, window.occupiedEndAtMs);
  }).length;
}

async function fetchCompanyBookingsRaw(companyId: string): Promise<Booking[]> {
  const q = query(collection(db, "bookings"), where("companyId", "==", companyId));
  const snap = await getDocs(q);
  return snap.docs.map((row) => toBooking(row.id, row.data()));
}

async function fetchCompanyBlocksRaw(companyId: string): Promise<BookingBlock[]> {
  const snap = await getDocs(collection(db, "companies", companyId, "booking_blocks"));
  const rows = snap.docs.map((row) => toBookingBlock(row.id, companyId, row.data()));
  return rows.sort((a, b) => a.startAtMs - b.startAtMs);
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
    if (filter.dateFrom && !isSameOrAfterDate(row.bookingDate, filter.dateFrom)) return false;
    if (filter.dateTo && !isSameOrBeforeDate(row.bookingDate, filter.dateTo)) return false;
    return true;
  });
}

export async function fetchCompanyBookings(companyId: string, filter?: BookingQueryFilter): Promise<Booking[]> {
  const rows = await fetchCompanyBookingsRaw(companyId);
  return sortBookingsByStartAsc(normalizeBookingRows(filterBookings(rows, filter)));
}

export async function fetchCustomerBookings(customerId: string): Promise<Booking[]> {
  const q = query(collection(db, "bookings"), where("customerId", "==", customerId));
  const snap = await getDocs(q);
  const rows = snap.docs.map((row) => toBooking(row.id, row.data()));
  return sortBookingsByCreatedDesc(normalizeBookingRows(rows));
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
      const rows = snap.docs.map((row: QueryDocumentSnapshot<DocumentData>) => toBooking(row.id, row.data()));
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

async function fetchDayState(companyId: string, bookingDate: string): Promise<{
  settings: BookingSettings;
  bookings: Booking[];
  blocks: BookingBlock[];
}> {
  const dayBookingsQuery = query(
    collection(db, "bookings"),
    where("companyId", "==", companyId),
    where("bookingDate", "==", bookingDate)
  );

  const [settings, dayBookingsSnap, allBlocks] = await Promise.all([
    getCompanyBookingSettings(companyId),
    getDocs(dayBookingsQuery),
    fetchCompanyBlocksRaw(companyId),
  ]);

  const dayBookings = normalizeBookingRows(dayBookingsSnap.docs.map((row) => toBooking(row.id, row.data())));
  const { dayStartMs, dayEndMs } = buildDayRangeMs(bookingDate);
  const dayBlocks = allBlocks.filter((block) => overlaps(block.startAtMs, block.endAtMs, dayStartMs, dayEndMs));

  return {
    settings,
    bookings: dayBookings,
    blocks: dayBlocks,
  };
}

function roundToNextInterval(totalMinutes: number, intervalMin: number): number {
  const safe = Math.max(1, intervalMin);
  return Math.ceil(totalMinutes / safe) * safe;
}

export async function listAvailableBookingSlots(params: {
  companyId: string;
  bookingDate: string;
  serviceDurationMin: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  capacity?: number;
}): Promise<BookingSlot[]> {
  const {
    companyId,
    bookingDate,
    serviceDurationMin,
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
    capacity = 1,
  } = params;

  const { settings, bookings, blocks } = await fetchDayState(companyId, bookingDate);
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

      const reserved = overlapCount(bookings, occupiedStartAtMs, occupiedEndAtMs);
      const remainingCapacity = slotCapacity - reserved;
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
    if (current !== "pending") throw new Error("Alleen aanvragen in afwachting kunnen worden beoordeeld.");
    if (next !== "confirmed" && next !== "declined") throw new Error("Ongeldige status.");
    return;
  }

  if (next !== "cancelled_by_customer") throw new Error("Ongeldige status.");
  if (current !== "pending" && current !== "confirmed") {
    throw new Error("Deze boeking kan niet meer geannuleerd worden.");
  }
}

export async function createBooking(payload: CreateBookingPayload): Promise<{ bookingId: string; status: BookingStatus }> {
  if (!payload.companyId || !payload.serviceId || !payload.customerId) {
    throw new Error("Onvolledige boekingsgegevens.");
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

  const bookingRef = doc(collection(db, "bookings"));

  const result = await runTransaction(db, async (transaction) => {
    const companyRef = doc(db, "companies_public", payload.companyId);
    const serviceRef = doc(db, "companies_public", payload.companyId, "services_public", payload.serviceId);

    const [companySnap, serviceSnap] = await Promise.all([transaction.get(companyRef), transaction.get(serviceRef)]);
    if (!companySnap.exists()) throw new Error("Bedrijf niet gevonden.");
    if (!serviceSnap.exists()) throw new Error("Dienst niet gevonden.");

    const companyData = companySnap.data() as Record<string, unknown>;
    const serviceData = serviceSnap.data() as Record<string, unknown>;

    if (!Boolean(companyData.isActive)) throw new Error("Dit bedrijf is momenteel niet beschikbaar.");
    if (!Boolean(serviceData.isActive)) throw new Error("Deze dienst is niet beschikbaar.");

    const settings = normalizeBookingSettings(companyData);
    if (!settings.enabled) throw new Error("Online boeken staat uit voor dit bedrijf.");

    const serviceDurationMin = Math.max(5, normalizeNonNegativeInt(serviceData.durationMin, 0));
    const serviceBufferBeforeMin = normalizeNonNegativeInt(serviceData.bufferBeforeMin, 0);
    const serviceBufferAfterMin = normalizeNonNegativeInt(serviceData.bufferAfterMin, 0);
    const serviceCapacity = effectiveBookingCapacity(settings, serviceData);

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

    const blocksSnap = await getDocs(collection(db, "companies", payload.companyId, "booking_blocks"));
    const blocks = blocksSnap.docs.map((row) => toBookingBlock(row.id, payload.companyId, row.data()));

    if (overlapsAnyBlock(blocks, occupiedStartAtMs, occupiedEndAtMs)) {
      throw new Error("Dit tijdslot is geblokkeerd.");
    }

    const dayBookingsSnap = await getDocs(
      query(
        collection(db, "bookings"),
        where("companyId", "==", payload.companyId),
        where("bookingDate", "==", bookingDate)
      )
    );
    const dayBookings = normalizeBookingRows(dayBookingsSnap.docs.map((row) => toBooking(row.id, row.data())));
    const reservedByExistingBookings = overlapCount(dayBookings, occupiedStartAtMs, occupiedEndAtMs);
    if (reservedByExistingBookings >= serviceCapacity) {
      throw new Error("Dit tijdslot is net bezet. Kies een ander moment.");
    }

    const lockSlotKeys = buildSlotLockKeys(bookingDate, occupiedStartAtMs, occupiedEndAtMs);
    let chosenSeat = -1;
    let lockIds: string[] = [];

    for (let seat = 0; seat < serviceCapacity; seat += 1) {
      const candidateLockIds = lockSlotKeys.map((slotKey) =>
        buildSlotLockDocId(payload.companyId, bookingDate, seat, slotKey)
      );

      const lockSnaps = await Promise.all(
        candidateLockIds.map((lockId) => transaction.get(doc(db, "booking_slot_locks", lockId)))
      );

      if (lockSnaps.every((snap) => !snap.exists())) {
        chosenSeat = seat;
        lockIds = candidateLockIds;
        break;
      }
    }

    if (chosenSeat < 0 || !lockIds.length) {
      throw new Error("Dit tijdslot is net bezet. Kies een ander moment.");
    }

    const status: BookingStatus = settings.autoConfirm ? "confirmed" : "pending";

    lockIds.forEach((lockId, index) => {
      transaction.set(doc(db, "booking_slot_locks", lockId), {
        companyId: payload.companyId,
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
      serviceId: payload.serviceId,
      serviceName: String(serviceData.name ?? "Dienst"),
      serviceCategory: String(serviceData.category ?? "Overig"),
      serviceDurationMin,
      serviceBufferBeforeMin,
      serviceBufferAfterMin,
      serviceCapacity,
      servicePrice: Number(serviceData.price ?? 0),
      bookingDate,
      startAt,
      endAt: new Date(endAtMs),
      occupiedStartAt: new Date(occupiedStartAtMs),
      occupiedEndAt: new Date(occupiedEndAtMs),
      status,
      customerId: payload.customerId,
      customerName: payload.customerName.trim(),
      customerPhone: payload.customerPhone.trim(),
      customerEmail: payload.customerEmail?.trim() ?? "",
      note: payload.note?.trim() ?? "",
      lockIds,
      lockSeat: chosenSeat,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      status,
      companyName: String(companyData.name ?? "Salon"),
    };
  });

  // Keep user experience stable even if notification write fails.
  notifyCompanyOnBookingRequest({
    companyId: payload.companyId,
    customerId: payload.customerId,
    customerName: payload.customerName,
    serviceId: payload.serviceId,
    bookingId: bookingRef.id,
    isAutoConfirmed: result.status === "confirmed",
  }).catch(() => null);

  return {
    bookingId: bookingRef.id,
    status: result.status,
  };
}

export async function setBookingStatusByCompany(
  bookingId: string,
  companyId: string,
  status: "confirmed" | "declined"
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.companyId !== companyId) throw new Error("Je hebt geen toegang tot deze boeking.");

    assertStatusTransition(row.status, status, "company");

    if (status === "declined") {
      releaseSlotLocks(transaction, getBookingLockIds(row));
    }

    transaction.update(ref, {
      status,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function cancelBookingByCustomer(bookingId: string, customerId: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "bookings", bookingId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Boeking niet gevonden.");

    const row = toBooking(snap.id, snap.data());
    if (row.customerId !== customerId) throw new Error("Je hebt geen toegang tot deze boeking.");

    assertStatusTransition(row.status, "cancelled_by_customer", "customer");

    releaseSlotLocks(transaction, getBookingLockIds(row));

    transaction.update(ref, {
      status: "cancelled_by_customer",
      updatedAt: serverTimestamp(),
    });
  });
}

export async function fetchCompanyBookingSlotsForDate(params: {
  companyId: string;
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
  return setBookingStatusByCompany(bookingId, businessId, "declined");
}
