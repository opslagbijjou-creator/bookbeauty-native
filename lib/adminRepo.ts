import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { fetchSupportSummary, type SupportSummary } from "./supportRepo";

export type AdminUserBreakdown = {
  total: number;
  customers: number;
  companies: number;
  employees: number;
  influencers: number;
  admins: number;
};

export type AdminBookingBreakdown = {
  total: number;
  pending: number;
  rescheduleRequested: number;
  confirmed: number;
  checkedIn: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

export type AdminNotificationInsights = {
  total: number;
  bookingRelated: number;
  perBooking: number;
};

export type AdminPlatformMetrics = {
  users: AdminUserBreakdown;
  companiesTotal: number;
  onlineNow: number;
  bookings: AdminBookingBreakdown;
  notifications: AdminNotificationInsights;
  support: SupportSummary;
};

export type AdminCompanySnapshot = {
  id: string;
  name: string;
  city: string;
  bookingCountTotal: number;
  badge?: string;
};

export async function fetchAdminPlatformMetrics(onlineWindowMinutes = 5): Promise<AdminPlatformMetrics> {
  const [
    usersTotalSnap,
    customerSnap,
    companySnap,
    employeeSnap,
    influencerSnap,
    adminSnap,
    companiesTotalSnap,
    onlineNowSnap,
    bookingsTotalSnap,
    pendingSnap,
    rescheduleRequestedSnap,
    confirmedSnap,
    checkedInSnap,
    completedSnap,
    cancelledSnap,
    noShowSnap,
    notificationsTotalSnap,
    bookingNotificationsSnap,
    supportSummary,
  ] = await Promise.all([
    getCountFromServer(collection(db, "users")),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "customer"))),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "company"))),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "employee"))),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "influencer"))),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "admin"))),
    getCountFromServer(collection(db, "companies_public")),
    getCountFromServer(
      query(collection(db, "presence"), where("lastActiveAt", ">=", new Date(Date.now() - onlineWindowMinutes * 60_000)))
    ),
    getCountFromServer(collection(db, "bookings")),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "pending"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "reschedule_requested"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "confirmed"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "checked_in"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "completed"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "cancelled"))),
    getCountFromServer(query(collection(db, "bookings"), where("status", "==", "no_show"))),
    getCountFromServer(collectionGroup(db, "notifications")),
    getCountFromServer(query(collectionGroup(db, "notifications"), where("bookingId", ">=", ""))),
    fetchSupportSummary(),
  ]);

  const totalBookings = bookingsTotalSnap.data().count;
  const bookingNotificationCount = bookingNotificationsSnap.data().count;

  return {
    users: {
      total: usersTotalSnap.data().count,
      customers: customerSnap.data().count,
      companies: companySnap.data().count,
      employees: employeeSnap.data().count,
      influencers: influencerSnap.data().count,
      admins: adminSnap.data().count,
    },
    companiesTotal: companiesTotalSnap.data().count,
    onlineNow: onlineNowSnap.data().count,
    bookings: {
      total: totalBookings,
      pending: pendingSnap.data().count,
      rescheduleRequested: rescheduleRequestedSnap.data().count,
      confirmed: confirmedSnap.data().count,
      checkedIn: checkedInSnap.data().count,
      completed: completedSnap.data().count,
      cancelled: cancelledSnap.data().count,
      noShow: noShowSnap.data().count,
    },
    notifications: {
      total: notificationsTotalSnap.data().count,
      bookingRelated: bookingNotificationCount,
      perBooking: totalBookings > 0 ? Number((bookingNotificationCount / totalBookings).toFixed(2)) : 0,
    },
    support: supportSummary,
  };
}

export async function fetchAdminTopCompaniesByBookings(take = 6): Promise<AdminCompanySnapshot[]> {
  const safeTake = Math.max(1, take);

  try {
    const ordered = query(collection(db, "companies_public"), orderBy("bookingCountTotal", "desc"), limit(safeTake));
    const snap = await getDocs(ordered);
    return snap.docs.map((row) => {
      const data = row.data() as Record<string, unknown>;
      return {
        id: row.id,
        name: String(data.name ?? "Onbekend bedrijf"),
        city: String(data.city ?? ""),
        bookingCountTotal: Math.max(0, Math.floor(Number(data.bookingCountTotal ?? 0) || 0)),
        badge: typeof data.badge === "string" ? data.badge : undefined,
      };
    });
  } catch {
    const fallback = query(collection(db, "companies_public"), limit(80));
    const snap = await getDocs(fallback);
    return snap.docs
      .map((row) => {
        const data = row.data() as Record<string, unknown>;
        return {
          id: row.id,
          name: String(data.name ?? "Onbekend bedrijf"),
          city: String(data.city ?? ""),
          bookingCountTotal: Math.max(0, Math.floor(Number(data.bookingCountTotal ?? 0) || 0)),
          badge: typeof data.badge === "string" ? data.badge : undefined,
        } as AdminCompanySnapshot;
      })
      .sort((a, b) => b.bookingCountTotal - a.bookingCountTotal || a.name.localeCompare(b.name, "nl-NL"))
      .slice(0, safeTake);
  }
}
