import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { getCompanyBookingSettings, listAvailableBookingSlots } from "./bookingRepo";
import { fetchCompanyById } from "./companyRepo";
import { fetchCompanyServiceById } from "./serviceRepo";

export type PublicBookingRequestInput = {
  companyId: string;
  serviceId: string;
  companyName?: string;
  companyLogoUrl?: string;
  serviceName?: string;
  serviceCategory?: string;
  servicePrice?: number;
  serviceDurationMin?: number;
  email: string;
  requestedDate: string;
  requestedTime: string;
  customerUid?: string;
  customerName?: string;
  note?: string;
};

export type PublicBookingStatus = {
  id: string;
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceName: string;
  status: string;
  requestedDate: string;
  requestedTime: string;
  createdAtMs: number;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function toMillis(value: unknown): number {
  const node = value as { toMillis?: () => number } | undefined;
  return typeof node?.toMillis === "function" ? node.toMillis() : 0;
}

function startLabelFromSlot(slotLabel: string): string {
  return (
    String(slotLabel || "")
    .split("-")[0]
    ?.trim() || ""
  );
}

function buildDateFromKeyAndTime(dateKey: string, time: string): Date {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const [hour, minute] = time.split(":").map((value) => Number(value));
  return new Date(year, Math.max(0, month - 1), day, hour || 0, minute || 0, 0, 0);
}

function readStatusSnapshot(
  bookingId: string,
  data: Record<string, unknown>,
  email: string
): PublicBookingStatus | null {
  const customerEmail = String(data.customerEmail ?? (data.customer as Record<string, unknown> | undefined)?.email ?? "")
    .trim()
    .toLowerCase();

  if (!customerEmail || customerEmail !== email.trim().toLowerCase()) {
    return null;
  }

  const schedule = (data.schedule as Record<string, unknown> | undefined) ?? {};

  return {
    id: bookingId,
    companyId: String(data.companyId ?? ""),
    companyName: String(data.companyName ?? "Salon"),
    serviceId: String(data.serviceId ?? ""),
    serviceName: String(data.serviceName ?? "Dienst"),
    status: String(data.status ?? "requested"),
    requestedDate: String(schedule.requestedDate ?? data.bookingDate ?? ""),
    requestedTime:
      String(schedule.requestedTime ?? "").trim() ||
      String(data.requestedTime ?? "").trim() ||
      new Date(toMillis(data.startAt))
        .toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
        .replace(".", ":"),
    createdAtMs: toMillis(data.createdAt),
  };
}

export async function createPublicBookingRequest(
  input: PublicBookingRequestInput
): Promise<{ bookingId: string; status: "requested" }> {
  const companyId = input.companyId.trim();
  const serviceId = input.serviceId.trim();
  const email = input.email.trim().toLowerCase();

  if (!companyId || !serviceId) {
    throw new Error("Salon of dienst ontbreekt.");
  }
  if (!isValidEmail(email)) {
    throw new Error("Vul een geldig e-mailadres in.");
  }

  const requestedDate = input.requestedDate.trim();
  const requestedTime = input.requestedTime.trim();
  const [company, service, settings] = await Promise.all([
    fetchCompanyById(companyId).catch(() => null),
    fetchCompanyServiceById(companyId, serviceId).catch(() => null),
    getCompanyBookingSettings(companyId).catch(() => null),
  ]);

  const effectiveCompanyName = company?.name || input.companyName?.trim() || "Salon";
  const effectiveCompanyLogoUrl = company?.logoUrl || input.companyLogoUrl?.trim() || "";
  const effectiveServiceName = service?.name || input.serviceName?.trim() || "Dienst";
  const effectiveServiceCategory =
    String(service?.category || input.serviceCategory || company?.categories?.[0] || "Beauty");
  const effectiveServicePrice = Math.max(
    0,
    Number(service?.price ?? input.servicePrice ?? 0)
  );
  const effectiveServiceDurationMin = Math.max(
    15,
    Number(service?.durationMin ?? input.serviceDurationMin ?? 30)
  );
  const effectiveBufferBeforeMin = Math.max(0, Number(service?.bufferBeforeMin || 0));
  const effectiveBufferAfterMin = Math.max(0, Number(service?.bufferAfterMin || 0));
  const effectiveCapacity = Math.max(1, Number(service?.capacity || 1));

  if (company && settings && !settings.enabled) {
    throw new Error("Online boeken staat uit voor deze salon.");
  }
  if (service && !service.isActive) {
    throw new Error("Dienst niet beschikbaar.");
  }

  let selectedSlot:
    | {
        startAtMs: number;
        endAtMs: number;
      }
    | null = null;

  if (company && service) {
    const slots = await listAvailableBookingSlots({
      companyId,
      bookingDate: requestedDate,
      serviceDurationMin: effectiveServiceDurationMin,
      bufferBeforeMin: effectiveBufferBeforeMin,
      bufferAfterMin: effectiveBufferAfterMin,
      capacity: effectiveCapacity,
    });

    const match = slots.find((slot) => startLabelFromSlot(slot.label) === requestedTime) ?? null;
    if (!match) {
      throw new Error("Dit tijdslot is niet meer beschikbaar. Kies een ander moment.");
    }

    selectedSlot = {
      startAtMs: match.startAtMs,
      endAtMs: match.endAtMs,
    };
  } else {
    const startAt = buildDateFromKeyAndTime(requestedDate, requestedTime);
    const startAtMs = startAt.getTime();

    if (!Number.isFinite(startAtMs)) {
      throw new Error("Kies een geldig moment.");
    }

    selectedSlot = {
      startAtMs,
      endAtMs: startAtMs + effectiveServiceDurationMin * 60_000,
    };
  }

  if (!selectedSlot) {
    throw new Error("Kies een geldig moment.");
  }

  const bookingRef = doc(collection(db, "bookings"));
  const startAt = new Date(selectedSlot.startAtMs);
  const endAt = new Date(selectedSlot.endAtMs);
  const customerName = input.customerName?.trim() || "Gast";

  await setDoc(bookingRef, {
    companyId,
    companyName: effectiveCompanyName,
    companyLogoUrl: effectiveCompanyLogoUrl,
    staffId: companyId,
    staffName: effectiveCompanyName,
    serviceId,
    serviceName: effectiveServiceName,
    serviceCategory: effectiveServiceCategory,
    serviceDurationMin: effectiveServiceDurationMin,
    serviceBufferBeforeMin: effectiveBufferBeforeMin,
    serviceBufferAfterMin: effectiveBufferAfterMin,
    serviceCapacity: effectiveCapacity,
    servicePrice: effectiveServicePrice,
    bookingDate: requestedDate,
    startAt,
    endAt,
    occupiedStartAt: startAt,
    occupiedEndAt: endAt,
    status: "requested",
    paymentStatus: "",
    proposalBy: "",
    proposedBookingDate: "",
    proposedStartAt: null,
    proposedEndAt: null,
    proposedOccupiedStartAt: null,
    proposedOccupiedEndAt: null,
    proposedAt: null,
    customerRescheduleCount: 0,
    customerConfirmedAt: null,
    companyConfirmedAt: null,
    confirmedAt: null,
    reminder24hAt: null,
    reminderSameDayAt: null,
    checkInCode: "",
    checkInCodeExpiresAt: null,
    checkInQrGeneratedAt: null,
    checkInConfirmedAt: null,
    checkInRejectedAt: null,
    checkInRejectedReason: "",
    completedAt: null,
    noShowReportedAt: null,
    customerId: input.customerUid?.trim() || `guest:${email}`,
    customerName,
    customerPhone: "",
    customerEmail: email,
    note: input.note?.trim() || "",
    cancellationFeePercent: 0,
    cancellationFeeAmount: 0,
    referralPostId: "",
    referralInfluencerId: "",
    referralInfluencerName: "",
    referralCommissionPercent: 0,
    referralCommissionAmount: 0,
    amountCents: 0,
    breakdown: { amountCents: 0 },
    lockIds: [],
    customer: {
      email,
      uid: input.customerUid?.trim() || "",
    },
    schedule: {
      requestedDate,
      requestedTime,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    bookingId: bookingRef.id,
    status: "requested",
  };
}

export async function fetchPublicBookingStatus(
  bookingId: string,
  email: string
): Promise<PublicBookingStatus | null> {
  const snap = await getDoc(doc(db, "bookings", bookingId.trim()));
  if (!snap.exists()) return null;
  return readStatusSnapshot(snap.id, snap.data(), email);
}

export function subscribePublicBookingStatus(
  bookingId: string,
  email: string,
  onData: (status: PublicBookingStatus | null) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, "bookings", bookingId.trim()),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(readStatusSnapshot(snap.id, snap.data(), email));
    },
    (error) => {
      onError?.(error);
    }
  );
}
