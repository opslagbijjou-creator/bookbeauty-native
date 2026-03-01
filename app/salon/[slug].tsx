import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import BookingRequestModal from "../../components/BookingRequestModal";
import MarketplaceSeo from "../../components/MarketplaceSeo";
import MarketplaceShell from "../../components/MarketplaceShell";
import SkeletonBlock from "../../components/SkeletonBlock";
import {
  DEMO_MARKETPLACE_SALONS,
  MarketplaceSalon,
  MarketplaceService,
  buildLocalBusinessSchema,
  buildSalonSeo,
  fetchMarketplaceSalonBySlug,
  formatCurrency,
} from "../../lib/marketplace";
import { auth } from "../../lib/firebase";
import { COLORS } from "../../lib/ui";

export function generateStaticParams() {
  return DEMO_MARKETPLACE_SALONS.map((salon) => ({ slug: salon.slug }));
}

type ProfileTab = "services" | "videos" | "info";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);
}

export default function PublicSalonProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [salon, setSalon] = useState<MarketplaceSalon | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("services");
  const [followed, setFollowed] = useState(false);
  const [selectedService, setSelectedService] = useState<MarketplaceService | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceSalonBySlug(slug)
      .then((result) => {
        if (cancelled) return;
        setSalon(result);
        setSelectedService(result?.services[0] ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setSalon(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const seo = useMemo(() => (salon ? buildSalonSeo(salon) : null), [salon]);
  const primaryBookableService = selectedService || salon?.services[0] || null;

  function onFollow() {
    if (!auth.currentUser) {
      router.push("/(auth)/login" as never);
      return;
    }
    setFollowed((current) => !current);
  }

  function onBook(service: MarketplaceService) {
    setSelectedService(service);
    setBookingOpen(true);
  }

  return (
    <MarketplaceShell active="discover">
      {seo && salon ? (
        <MarketplaceSeo
          title={seo.title}
          description={seo.description}
          pathname={seo.pathname}
          image={salon.coverImageUrl}
          structuredData={buildLocalBusinessSchema(salon)}
        />
      ) : null}

      {loading ? (
        <View style={styles.loadingStack}>
          <SkeletonBlock height={320} radius={28} />
          <SkeletonBlock height={28} width="46%" radius={10} />
          <SkeletonBlock height={20} width="32%" radius={10} />
          <SkeletonBlock height={120} radius={20} />
        </View>
      ) : !salon ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Salon niet gevonden</Text>
          <Text style={styles.emptyText}>Deze salonpagina kon niet worden geladen.</Text>
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Image source={{ uri: salon.coverImageUrl }} style={styles.cover} contentFit="cover" transition={220} />

            <View style={styles.heroOverlay}>
              <View style={styles.profileRow}>
                <View style={styles.avatarWrap}>
                  {salon.logoUrl ? (
                    <Image source={{ uri: salon.logoUrl }} style={styles.avatarImage} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarText}>{initials(salon.name)}</Text>
                  )}
                </View>

                <View style={styles.profileText}>
                  <Text style={styles.name}>{salon.name}</Text>
                  <Text style={styles.cityText}>
                    {salon.city} • {salon.categoryLabel}
                  </Text>
                  <View style={styles.tagRow}>
                    {salon.categoryTags.map((tag) => (
                      <View key={tag} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.ctaRow}>
                <Pressable onPress={onFollow} style={styles.followBtn}>
                  <Ionicons name={followed ? "heart" : "heart-outline"} size={16} color={COLORS.primary} />
                  <Text style={styles.followBtnText}>{followed ? "Gevolgd" : "Volg"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (primaryBookableService) onBook(primaryBookableService);
                  }}
                  style={styles.bookBtn}
                >
                  <Text style={styles.bookBtnText}>Boek</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{salon.rating.toFixed(1)}</Text>
              <Text style={styles.metricLabel}>Rating</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{formatCurrency(salon.minPrice)}</Text>
              <Text style={styles.metricLabel}>Vanaf prijs</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricValue}>{salon.reviewCount}</Text>
              <Text style={styles.metricLabel}>Reviews</Text>
            </View>
          </View>

          <View style={styles.tabRow}>
            {[
              { key: "services" as const, label: "Diensten" },
              { key: "videos" as const, label: "Video's" },
              { key: "info" as const, label: "Info" },
            ].map((tab) => (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {activeTab === "services" ? (
            <View style={styles.panelGrid}>
              {salon.services.map((service) => (
                <View key={service.id} style={styles.serviceCard}>
                  <View style={styles.serviceHeader}>
                    <View style={styles.serviceTextWrap}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      <Text style={styles.serviceMeta}>
                        {formatCurrency(service.price)} • {service.durationMin} min
                      </Text>
                    </View>
                    <Pressable onPress={() => onBook(service)} style={styles.serviceBookBtn}>
                      <Text style={styles.serviceBookBtnText}>Boek</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.serviceDescription}>{service.description}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {activeTab === "videos" ? (
            <View style={styles.panelGrid}>
              {salon.feed.map((item) => (
                <View key={item.id} style={styles.videoCard}>
                  <Image source={{ uri: item.posterUrl }} style={styles.videoPoster} contentFit="cover" transition={220} />
                  <View style={styles.videoBody}>
                    <Text style={styles.videoTitle}>{item.title}</Text>
                    <Text style={styles.videoCaption}>{item.caption}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {activeTab === "info" ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoHeading}>Over deze salon</Text>
              <Text style={styles.infoBody}>{salon.bio}</Text>
              <Text style={styles.infoBody}>
                BookBeauty laat salons publiek zichtbaar zijn zonder loginwall, zodat klanten eerst kunnen oriënteren en daarna pas beslissen.
              </Text>
            </View>
          ) : null}

          <BookingRequestModal
            visible={bookingOpen}
            salon={salon}
            service={selectedService}
            onClose={() => setBookingOpen(false)}
          />
        </>
      )}
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  loadingStack: {
    gap: 14,
  },
  emptyState: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    gap: 8,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  emptyText: {
    color: COLORS.muted,
    lineHeight: 22,
  },
  hero: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  cover: {
    width: "100%",
    height: 360,
    backgroundColor: COLORS.surface,
  },
  heroOverlay: {
    padding: 20,
    gap: 18,
    backgroundColor: COLORS.card,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 24,
  },
  profileText: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: COLORS.text,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "800",
  },
  cityText: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 15,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  tag: {
    borderRadius: 999,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 11,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  followBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  followBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  bookBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  bookBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  metricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: 120,
    padding: 16,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    gap: 4,
  },
  metricValue: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 24,
  },
  metricLabel: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 16,
  },
  tabBtn: {
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  tabBtnText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  tabBtnTextActive: {
    color: "#ffffff",
  },
  panelGrid: {
    marginTop: 16,
    gap: 14,
  },
  serviceCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    gap: 12,
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  serviceTextWrap: {
    flex: 1,
    gap: 4,
  },
  serviceName: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
  },
  serviceMeta: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  serviceDescription: {
    color: COLORS.muted,
    lineHeight: 22,
  },
  serviceBookBtn: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceBookBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 12,
  },
  videoCard: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  videoPoster: {
    width: "100%",
    height: 280,
    backgroundColor: COLORS.surface,
  },
  videoBody: {
    padding: 16,
    gap: 6,
  },
  videoTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
  },
  videoCaption: {
    color: COLORS.muted,
    lineHeight: 22,
  },
  infoPanel: {
    marginTop: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    gap: 10,
  },
  infoHeading: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 22,
  },
  infoBody: {
    color: COLORS.muted,
    lineHeight: 23,
  },
});
