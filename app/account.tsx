import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Toast from "../components/ui/Toast";
import { getUserRole, logout, subscribeAuth } from "../lib/authRepo";
import {
  acceptBooking,
  fetchCompanyBookingInsights,
  fetchCustomerBookingsByIdentity,
  proposeNextBookingTimeByCompany,
  rejectBooking,
  respondToCustomerRescheduleByCompany,
  subscribeCompanyBookings,
  type Booking,
  type CompanyBookingInsights,
} from "../lib/bookingRepo";
import { fetchCompanyById, upsertMyCompanyPublic, type CompanyPublic } from "../lib/companyRepo";
import { auth } from "../lib/firebase";
import { slugifySegment } from "../lib/marketplace";
import type { AppRole } from "../lib/roles";
import { fetchMyServices } from "../lib/serviceRepo";
import { getEmployeeCompanyId } from "../lib/staffRepo";
import { COLORS } from "../lib/ui";

type AccountAction = {
  key: string;
  label: string;
  subtitle: string;
  href?: string;
  destructive?: boolean;
};

type BannerTone = "success" | "danger" | null;

type CompanyDraft = {
  name: string;
  city: string;
  bio: string;
  logoUrl: string;
  coverImageUrl: string;
};

const EMPTY_DRAFT: CompanyDraft = {
  name: "",
  city: "",
  bio: "",
  logoUrl: "",
  coverImageUrl: "",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Aanvraag",
  confirmed: "Bevestigd",
  reschedule_requested: "Verplaatsen",
  checked_in: "Ingecheckt",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
  no_show: "Niet gekomen",
};

function normalizeRole(role: AppRole | null | undefined): AppRole | null {
  if (role === "company" || role === "employee" || role === "influencer" || role === "admin") return role;
  if (role === "customer") return role;
  return null;
}

function formatDateTime(row: Booking): string {
  const date = row.startAtMs ? new Date(row.startAtMs) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return row.bookingDate || "Onbekend moment";
  }
  return date.toLocaleString("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(row: Booking): string {
  return STATUS_LABELS[row.status] || row.status;
}

function buildCompanyProfilePath(companyId: string, company?: CompanyPublic | null): string | null {
  if (!companyId) return null;
  const suffix = slugifySegment(companyId).slice(0, 4) || "bbty";
  const slug = [slugifySegment(company?.name), slugifySegment(company?.city), suffix].filter(Boolean).join("-");
  if (!slug) return null;
  return `/salon/${slug}`;
}

export default function PublicAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string; bookingId?: string }>();
  const { width } = useWindowDimensions();
  const desktop = width >= 768;
  const focusedSection = String(params.section ?? "").trim().toLowerCase();
  const focusedBookingId = String(params.bookingId ?? "").trim();

  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyPublic | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(EMPTY_DRAFT);
  const [servicesCount, setServicesCount] = useState(0);
  const [serviceLabels, setServiceLabels] = useState<string[]>([]);
  const [companyBookings, setCompanyBookings] = useState<Booking[]>([]);
  const [customerBookings, setCustomerBookings] = useState<Booking[]>([]);
  const [bookingInsights, setBookingInsights] = useState<CompanyBookingInsights>({
    totalBookings: 0,
    topServices: [],
  });
  const [loadingCompany, setLoadingCompany] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [actionBookingId, setActionBookingId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState("");
  const [bannerTone, setBannerTone] = useState<BannerTone>(null);

  useEffect(() => {
    return subscribeAuth((user) => {
      setUid(user?.uid ?? null);
      if (!user?.uid) {
        setRole(null);
        setCompanyId(null);
        setCompany(null);
        setCompanyDraft(EMPTY_DRAFT);
        setCompanyBookings([]);
        setCustomerBookings([]);
      }
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    getUserRole(uid)
      .then((nextRole) => {
        setRole(normalizeRole(nextRole) ?? "customer");
      })
      .catch(() => {
        setRole("customer");
      });
  }, [uid]);

  useEffect(() => {
    if (!uid || (role !== "company" && role !== "employee")) {
      setCompanyId(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        if (role === "company") {
          if (!cancelled) setCompanyId(uid);
          return;
        }
        const linkedCompanyId = await getEmployeeCompanyId(uid);
        if (!cancelled) setCompanyId(linkedCompanyId || uid);
      } catch {
        if (!cancelled) setCompanyId(uid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role, uid]);

  useEffect(() => {
    if (!uid || role !== "customer") {
      setCustomerBookings([]);
      return;
    }

    let cancelled = false;
    fetchCustomerBookingsByIdentity(uid, auth.currentUser?.email ?? "")
      .then((rows) => {
        if (cancelled) return;
        setCustomerBookings(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setCustomerBookings([]);
      });

    return () => {
      cancelled = true;
    };
  }, [role, uid]);

  useEffect(() => {
    if (!companyId || (role !== "company" && role !== "employee")) {
      setCompany(null);
      setCompanyDraft(EMPTY_DRAFT);
      setServicesCount(0);
      setServiceLabels([]);
      setBookingInsights({ totalBookings: 0, topServices: [] });
      return;
    }

    let cancelled = false;
    setLoadingCompany(true);

    Promise.all([
      fetchCompanyById(companyId).catch(() => null),
      fetchMyServices(companyId).catch(() => []),
      fetchCompanyBookingInsights(companyId).catch(() => ({ totalBookings: 0, topServices: [] })),
    ])
      .then(([companyRow, services, insights]) => {
        if (cancelled) return;
        setCompany(companyRow);
        setCompanyDraft({
          name: companyRow?.name || "",
          city: companyRow?.city || "",
          bio: companyRow?.bio || "",
          logoUrl: companyRow?.logoUrl || "",
          coverImageUrl: companyRow?.coverImageUrl || "",
        });
        setServicesCount(services.length);
        setServiceLabels(services.slice(0, 4).map((item) => item.name));
        setBookingInsights(insights);
      })
      .catch(() => {
        if (cancelled) return;
        setCompany(null);
        setCompanyDraft(EMPTY_DRAFT);
        setServicesCount(0);
        setServiceLabels([]);
        setBookingInsights({ totalBookings: 0, topServices: [] });
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingCompany(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, role]);

  useEffect(() => {
    if (!companyId || (role !== "company" && role !== "employee")) {
      setCompanyBookings([]);
      setLoadingBookings(false);
      return;
    }

    setLoadingBookings(true);
    const unsub = subscribeCompanyBookings(
      companyId,
      (rows) => {
        setCompanyBookings(rows);
        setLoadingBookings(false);
      },
      () => {
        setLoadingBookings(false);
      }
    );

    return unsub;
  }, [companyId, role]);

  const companyProfilePath = useMemo(() => buildCompanyProfilePath(companyId || "", company), [company, companyId]);
  const isCompanyFlow = role === "company" || role === "employee";
  const canEditCompany = role === "company";

  const actions = useMemo<AccountAction[]>(() => {
    if (!uid) {
      return [
        {
          key: "login",
          label: "Inloggen of account maken",
          subtitle: "Log in voor likes, favorieten en boekingen met statusupdates.",
          href: "/(auth)/login",
        },
        {
          key: "register-salon",
          label: "Meld je salon gratis aan",
          subtitle: "Maak direct een salonprofiel aan en sta meteen live in discover.",
          href: "/(auth)/register",
        },
      ];
    }

    if (!role) {
      return [];
    }

    if (role === "admin") {
      return [
        {
          key: "admin",
          label: "Open admin",
          subtitle: "Beheer platformdata, profielen en support.",
          href: "/(admin)/(tabs)/index",
        },
        {
          key: "logout",
          label: "Uitloggen",
          subtitle: "Sluit deze sessie veilig af op dit apparaat.",
          destructive: true,
        },
      ];
    }

    return [
      {
        key: "customer-bookings",
        label: "Mijn boekingen",
        subtitle: "Bekijk de status van je lopende beauty-aanvragen.",
        href: "/account-bookings",
      },
      {
        key: "customer-profile",
        label: "Mijn profiel",
        subtitle: "Beheer favorieten, instellingen en je accountgegevens.",
        href: "/account-profile",
      },
      {
        key: "logout",
        label: "Uitloggen",
        subtitle: "Sluit deze sessie veilig af op dit apparaat.",
        destructive: true,
      },
    ];
  }, [role, uid]);

  function showBanner(message: string, tone: BannerTone) {
    setBannerMessage(message);
    setBannerTone(tone);
  }

  async function onPressAction(action: AccountAction) {
    if (action.destructive) {
      try {
        await logout();
      } catch (error: any) {
        Alert.alert("Uitloggen mislukt", error?.message ?? "Probeer het opnieuw.");
      }
      return;
    }
    if (!action.href) return;
    router.push(action.href as never);
  }

  async function onSaveCompanyProfile() {
    if (!companyId || !canEditCompany || savingCompany) return;

    const nextName = companyDraft.name.trim();
    const nextCity = companyDraft.city.trim();
    if (nextName.length < 2 || nextCity.length < 2) {
      showBanner("Vul minstens een salonnaam en stad in.", "danger");
      return;
    }

    setSavingCompany(true);
    setBannerMessage("");
    try {
      await upsertMyCompanyPublic(companyId, {
        name: nextName,
        city: nextCity,
        bio: companyDraft.bio.trim(),
        logoUrl: companyDraft.logoUrl.trim(),
        coverImageUrl: companyDraft.coverImageUrl.trim(),
      });

      setCompany((prev) =>
        prev
          ? {
              ...prev,
              name: nextName,
              city: nextCity,
              bio: companyDraft.bio.trim(),
              logoUrl: companyDraft.logoUrl.trim(),
              coverImageUrl: companyDraft.coverImageUrl.trim(),
            }
          : prev
      );
      showBanner("Je bedrijfsprofiel is bijgewerkt.", "success");
    } catch (error: any) {
      showBanner(error?.message ?? "Opslaan mislukt. Probeer opnieuw.", "danger");
    } finally {
      setSavingCompany(false);
    }
  }

  async function runBookingAction(bookingId: string, action: () => Promise<void>, successMessage: string) {
    if (!companyId || actionBookingId) return;
    setActionBookingId(bookingId);
    setBannerMessage("");
    try {
      await action();
      showBanner(successMessage, "success");
    } catch (error: any) {
      showBanner(error?.message ?? "Actie mislukt. Probeer opnieuw.", "danger");
    } finally {
      setActionBookingId(null);
    }
  }

  function renderBookingActions(row: Booking) {
    if (!companyId) return null;
    const busy = actionBookingId === row.id;

    if (row.status === "pending") {
      return (
        <View style={styles.actionRow}>
          <Pressable
            disabled={busy}
            onPress={() => runBookingAction(row.id, () => acceptBooking(row.id, companyId), "Boeking bevestigd.")}
            style={[styles.actionPill, styles.actionPrimary, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionPrimaryText}>{busy ? "Bezig..." : "Bevestig"}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => runBookingAction(row.id, () => rejectBooking(row.id, companyId), "Boeking afgewezen.")}
            style={[styles.actionPill, styles.actionSecondary, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionSecondaryText}>Weiger</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() =>
              runBookingAction(
                row.id,
                () => proposeNextBookingTimeByCompany(row.id, companyId).then(() => undefined),
                "Nieuw voorstel gestuurd naar de klant."
              )
            }
            style={[styles.actionPill, styles.actionSecondary, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionSecondaryText}>Nieuw moment</Text>
          </Pressable>
        </View>
      );
    }

    if (row.status === "confirmed") {
      return (
        <View style={styles.actionRow}>
          <Pressable
            disabled={busy}
            onPress={() =>
              runBookingAction(
                row.id,
                () => proposeNextBookingTimeByCompany(row.id, companyId).then(() => undefined),
                "Nieuw voorstel gestuurd naar de klant."
              )
            }
            style={[styles.actionPill, styles.actionSecondary, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionSecondaryText}>{busy ? "Bezig..." : "Verplaats"}</Text>
          </Pressable>
        </View>
      );
    }

    if (row.status === "reschedule_requested" && row.proposalBy === "customer") {
      return (
        <View style={styles.actionRow}>
          <Pressable
            disabled={busy}
            onPress={() =>
              runBookingAction(
                row.id,
                () => respondToCustomerRescheduleByCompany(row.id, companyId, "approved"),
                "Nieuwe tijd is goedgekeurd."
              )
            }
            style={[styles.actionPill, styles.actionPrimary, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionPrimaryText}>{busy ? "Bezig..." : "Goedkeuren"}</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() =>
              runBookingAction(
                row.id,
                () => respondToCustomerRescheduleByCompany(row.id, companyId, "declined"),
                "Verplaatsingsverzoek geweigerd."
              )
            }
            style={[styles.actionPill, styles.actionSecondary, busy && styles.actionDisabled]}
          >
            <Text style={styles.actionSecondaryText}>Weigeren</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  }

  return (
    <MarketplaceShell scroll={false}>
      <MarketplaceSeo
        title="Account | BookBeauty"
        description="Log in, beheer je boekingen of werk je salon bij in dezelfde rustige BookBeauty-omgeving."
        pathname="/account"
      />

      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, desktop && styles.contentDesktop]} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>{uid ? "Je account" : "Welkom"}</Text>
        <Text style={styles.title}>
          {!uid
            ? "Log in wanneer je iets wilt doen."
            : isCompanyFlow
              ? "Beheer je salon zonder terug te springen naar de oude app."
              : "Alles van je account blijft in dezelfde marketplace-flow."}
        </Text>
        <Text style={styles.subtitle}>
          {!uid
            ? "Browsen blijft openbaar. Login is alleen nodig voor boekingen, favorieten of salonbeheer."
            : isCompanyFlow
              ? "Je boekingen, klantgegevens en publieke salonprofiel blijven hier bij elkaar. Geen losse oude dashboard-weergave meer."
              : "Je boekingen, favorieten en profiel blijven in dezelfde rustige BookBeauty-stijl."}
        </Text>

        {bannerMessage && bannerTone ? <Toast message={bannerMessage} tone={bannerTone} /> : null}

        {!uid ? (
          <View style={[styles.simpleList, desktop && styles.simpleListDesktop]}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => onPressAction(action).catch(() => null)}
                style={({ pressed }) => [styles.simpleRow, pressed && styles.rowPressed]}
              >
                <View style={styles.simpleCopy}>
                  <Text style={styles.simpleTitle}>{action.label}</Text>
                  <Text style={styles.simpleSubtitle}>{action.subtitle}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={COLORS.text} />
              </Pressable>
            ))}
          </View>
        ) : isCompanyFlow ? (
          <View style={[styles.dashboard, desktop && styles.dashboardDesktop]}>
            <View style={styles.mainCol}>
              <Card style={styles.heroCard}>
                <View style={styles.heroHeader}>
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroEyebrow}>Bedrijfsprofiel</Text>
                    <Text style={styles.heroTitle}>{company?.name || companyDraft.name || "Jouw salon"}</Text>
                    <Text style={styles.heroSubtitle}>
                      {company?.city || companyDraft.city || "Kies je stad"} • {company?.isActive === false ? "Niet live" : "Live in discover"}
                    </Text>
                  </View>
                  <View style={styles.livePill}>
                    <Text style={styles.livePillText}>{company?.isActive === false ? "Offline" : "Live"}</Text>
                  </View>
                </View>

                <View style={[styles.statsRow, desktop && styles.statsRowDesktop]}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{companyBookings.filter((row) => row.status === "pending").length}</Text>
                    <Text style={styles.statLabel}>Open aanvragen</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{servicesCount}</Text>
                    <Text style={styles.statLabel}>Diensten live</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{bookingInsights.totalBookings || company?.bookingCountTotal || 0}</Text>
                    <Text style={styles.statLabel}>Boekingen totaal</Text>
                  </View>
                </View>

                <View style={styles.quickActionRow}>
                  {companyProfilePath ? (
                    <Pressable
                      onPress={() => router.push(companyProfilePath as never)}
                      style={({ pressed }) => [styles.quickLink, pressed && styles.rowPressed]}
                    >
                      <Ionicons name="globe-outline" size={15} color={COLORS.text} />
                      <Text style={styles.quickLinkText}>Publiek profiel</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => router.push("/discover" as never)}
                    style={({ pressed }) => [styles.quickLink, pressed && styles.rowPressed]}
                  >
                    <Ionicons name="search-outline" size={15} color={COLORS.text} />
                    <Text style={styles.quickLinkText}>Controleer discover</Text>
                  </Pressable>
                </View>

                {role === "employee" ? (
                  <Text style={styles.helperNote}>Je bent ingelogd als medewerker. Boekingbeheer werkt hier, profielwijzigingen blijven read-only.</Text>
                ) : null}
              </Card>

              <Card
                style={[
                  styles.sectionCard,
                  focusedSection === "bookings" && styles.sectionCardActive,
                ]}
              >
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={styles.sectionTitle}>Boekingen</Text>
                    <Text style={styles.sectionText}>
                      Aanvragen en verplaatsingen blijven direct gekoppeld aan de juiste klant in Firestore.
                    </Text>
                  </View>
                </View>

                {loadingBookings ? (
                  <View style={styles.stateBox}>
                    <Text style={styles.stateText}>Boekingen laden...</Text>
                  </View>
                ) : companyBookings.length ? (
                  <View style={styles.bookingList}>
                    {companyBookings.slice(0, 8).map((row) => (
                      <View
                        key={row.id}
                        style={[
                          styles.bookingCard,
                          row.id === focusedBookingId && styles.bookingCardActive,
                        ]}
                      >
                        <View style={styles.bookingTop}>
                          <View style={styles.bookingCopy}>
                            <Text style={styles.bookingTitle}>{row.serviceName}</Text>
                            <Text style={styles.bookingMeta}>
                              {row.customerName || "Klant"} • {row.customerEmail || row.customerPhone || "contact volgt"}
                            </Text>
                            <Text style={styles.bookingMeta}>{formatDateTime(row)}</Text>
                          </View>
                          <View style={styles.bookingStatus}>
                            <Text style={styles.bookingStatusText}>{getStatusLabel(row)}</Text>
                          </View>
                        </View>

                        {row.status === "reschedule_requested" && row.proposalBy === "company" ? (
                          <Text style={styles.bookingHint}>Je hebt een nieuw tijdstip voorgesteld. De klant moet nog reageren.</Text>
                        ) : null}

                        {renderBookingActions(row)}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.stateBox}>
                    <Text style={styles.stateTitle}>Nog geen boekingen</Text>
                    <Text style={styles.stateText}>
                      Nieuwe gast- en accountboekingen komen hier direct binnen zodra klanten reserveren.
                    </Text>
                  </View>
                )}
              </Card>
            </View>

            <View style={styles.sideCol}>
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Publiek profiel bewerken</Text>
                <Text style={styles.sectionText}>
                  Werk je zichtbare salongegevens bij zonder uit de marketplace-flow te gaan.
                </Text>

                <View style={styles.form}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Salonnaam</Text>
                    <TextInput
                      value={companyDraft.name}
                      onChangeText={(value) => setCompanyDraft((prev) => ({ ...prev, name: value }))}
                      placeholder="Jouw salon"
                      placeholderTextColor={COLORS.placeholder}
                      style={styles.input}
                      editable={canEditCompany}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Stad</Text>
                    <TextInput
                      value={companyDraft.city}
                      onChangeText={(value) => setCompanyDraft((prev) => ({ ...prev, city: value }))}
                      placeholder="Rotterdam"
                      placeholderTextColor={COLORS.placeholder}
                      style={styles.input}
                      editable={canEditCompany}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Korte bio</Text>
                    <TextInput
                      value={companyDraft.bio}
                      onChangeText={(value) => setCompanyDraft((prev) => ({ ...prev, bio: value }))}
                      placeholder="Vertel kort waar je salon om bekend staat."
                      placeholderTextColor={COLORS.placeholder}
                      style={[styles.input, styles.textArea]}
                      multiline
                      editable={canEditCompany}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Logo URL</Text>
                    <TextInput
                      value={companyDraft.logoUrl}
                      onChangeText={(value) => setCompanyDraft((prev) => ({ ...prev, logoUrl: value }))}
                      placeholder="https://..."
                      placeholderTextColor={COLORS.placeholder}
                      style={styles.input}
                      autoCapitalize="none"
                      editable={canEditCompany}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Coverfoto URL</Text>
                    <TextInput
                      value={companyDraft.coverImageUrl}
                      onChangeText={(value) => setCompanyDraft((prev) => ({ ...prev, coverImageUrl: value }))}
                      placeholder="https://..."
                      placeholderTextColor={COLORS.placeholder}
                      style={styles.input}
                      autoCapitalize="none"
                      editable={canEditCompany}
                    />
                  </View>
                </View>

                <Button
                  label={savingCompany ? "Opslaan..." : canEditCompany ? "Wijzigingen opslaan" : "Alleen-lezen"}
                  onPress={() => onSaveCompanyProfile().catch(() => null)}
                  disabled={!canEditCompany || savingCompany || loadingCompany}
                />
              </Card>

              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Diensten & klantzicht</Text>
                <Text style={styles.sectionText}>
                  {servicesCount
                    ? `${servicesCount} diensten staan nu live voor klanten.`
                    : "Voeg diensten toe via je onboarding of services-collectie zodat klanten direct kunnen boeken."}
                </Text>
                {serviceLabels.length ? (
                  <View style={styles.serviceTags}>
                    {serviceLabels.map((label) => (
                      <View key={label} style={styles.serviceTag}>
                        <Text style={styles.serviceTagText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.sideButtonStack}>
                  {companyProfilePath ? (
                    <Button label="Open publiek profiel" variant="secondary" onPress={() => router.push(companyProfilePath as never)} />
                  ) : null}
                  <Button
                    label="Uitloggen"
                    variant="destructive"
                    onPress={() =>
                      onPressAction({
                        key: "logout",
                        label: "Uitloggen",
                        subtitle: "",
                        destructive: true,
                      }).catch(() => null)
                    }
                  />
                </View>
              </Card>
            </View>
          </View>
        ) : (
          <View style={[styles.simpleList, desktop && styles.simpleListDesktop]}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => onPressAction(action).catch(() => null)}
                style={({ pressed }) => [styles.simpleRow, pressed && styles.rowPressed]}
              >
                <View style={styles.simpleCopy}>
                  <Text style={[styles.simpleTitle, action.destructive && styles.dangerText]}>{action.label}</Text>
                  <Text style={styles.simpleSubtitle}>{action.subtitle}</Text>
                </View>
                <Ionicons
                  name={action.destructive ? "log-out-outline" : "arrow-forward"}
                  size={18}
                  color={action.destructive ? COLORS.danger : COLORS.text}
                />
              </Pressable>
            ))}

            {role === "customer" && customerBookings.length ? (
              <Card style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Recente boekingen</Text>
                <Text style={styles.sectionText}>
                  Ook eerdere gastboekingen op hetzelfde e-mailadres blijven hier zichtbaar.
                </Text>
                <View style={styles.bookingList}>
                  {customerBookings.slice(0, 3).map((row) => (
                    <View key={row.id} style={styles.bookingCard}>
                      <View style={styles.bookingTop}>
                        <View style={styles.bookingCopy}>
                          <Text style={styles.bookingTitle}>{row.companyName}</Text>
                          <Text style={styles.bookingMeta}>{row.serviceName}</Text>
                        </View>
                        <View style={styles.bookingStatus}>
                          <Text style={styles.bookingStatusText}>{getStatusLabel(row)}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}
          </View>
        )}
      </ScrollView>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  contentDesktop: {
    paddingBottom: 36,
  },
  kicker: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  title: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.7,
    maxWidth: 760,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 760,
  },
  dashboard: {
    gap: 14,
  },
  dashboardDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  mainCol: {
    flex: 1.3,
    gap: 14,
  },
  sideCol: {
    flex: 1,
    gap: 14,
  },
  heroCard: {
    gap: 14,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  livePill: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  livePillText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statsRowDesktop: {
    flexWrap: "nowrap",
  },
  statCard: {
    flex: 1,
    minWidth: 110,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 3,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  quickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickLink: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quickLinkText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  helperNote: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionCard: {
    gap: 12,
  },
  sectionCardActive: {
    borderColor: "rgba(215,138,169,0.28)",
    backgroundColor: "#fffdfd",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  bookingList: {
    gap: 10,
  },
  bookingCard: {
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  bookingCardActive: {
    backgroundColor: "rgba(215,138,169,0.08)",
    borderWidth: 1,
    borderColor: "rgba(215,138,169,0.25)",
  },
  bookingTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bookingCopy: {
    flex: 1,
    gap: 3,
  },
  bookingTitle: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  bookingMeta: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  bookingStatus: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  bookingStatusText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  bookingHint: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionPill: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPrimary: {
    backgroundColor: COLORS.text,
  },
  actionPrimaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  actionSecondary: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionSecondaryText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  stateBox: {
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  stateTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  stateText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  form: {
    gap: 10,
  },
  field: {
    gap: 5,
  },
  fieldLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "500",
  },
  textArea: {
    minHeight: 96,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  serviceTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  serviceTag: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceTagText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "600",
  },
  sideButtonStack: {
    gap: 10,
  },
  simpleList: {
    marginTop: 10,
    gap: 12,
  },
  simpleListDesktop: {
    maxWidth: 760,
  },
  simpleRow: {
    minHeight: 88,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  simpleCopy: {
    flex: 1,
    gap: 5,
  },
  simpleTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  simpleSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  dangerText: {
    color: COLORS.danger,
  },
});
