import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
    <MarketplaceShell active="discover" scroll={false}>
      {seo && salon ? (
        <MarketplaceSeo
          title={seo.title}
          description={seo.description}
          pathname={seo.pathname}
          image={salon.coverImageUrl}
          structuredData={buildLocalBusinessSchema(salon)}
        />
      ) : null}

      <View style={styles.screen}>
        {loading ? (
          <View style={styles.loadingStack}>
            <SkeletonBlock height={420} radius={0} />
            <SkeletonBlock height={28} width="42%" radius={6} />
            <SkeletonBlock height={18} width="26%" radius={6} />
            <SkeletonBlock height={110} radius={0} />
          </View>
        ) : !salon ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Salon niet gevonden</Text>
            <Text style={styles.emptyText}>Deze salonpagina kon niet worden geladen.</Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.hero}>
                <Image source={{ uri: salon.coverImageUrl }} style={styles.cover} contentFit="cover" transition={220} />
                <LinearGradient
                  colors={["rgba(8,14,22,0.06)", "rgba(8,14,22,0.74)"]}
                  style={StyleSheet.absoluteFillObject}
                />

                <View style={styles.heroTopRow}>
                  <Pressable onPress={onFollow} style={styles.followButton}>
                    <Ionicons name={followed ? "heart" : "heart-outline"} size={16} color="#ffffff" />
                    <Text style={styles.followButtonText}>{followed ? "Gevolgd" : "Volg"}</Text>
                  </Pressable>
                </View>

                <View style={styles.heroCopy}>
                  <Text style={styles.heroName}>{salon.name}</Text>
                  <Text style={styles.heroMeta}>
                    {salon.categoryLabel} • {salon.city}
                  </Text>
                  <Text style={styles.heroSubline}>
                    {salon.rating.toFixed(1)} rating • {salon.reviewCount} reviews • Vanaf {formatCurrency(salon.minPrice)}
                  </Text>
                </View>
              </View>

              <View style={styles.tabBar}>
                {[
                  { key: "services" as const, label: "Behandelingen" },
                  { key: "videos" as const, label: "Video's" },
                  { key: "info" as const, label: "Info" },
                ].map((tab) => {
                  const selected = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      onPress={() => setActiveTab(tab.key)}
                      style={[styles.tabButton, selected && styles.tabButtonActive]}
                    >
                      <Text style={[styles.tabButtonText, selected && styles.tabButtonTextActive]}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {activeTab === "services" ? (
                <View style={styles.section}>
                  {salon.services.map((service) => {
                    const selected = selectedService?.id === service.id;
                    return (
                      <Pressable
                        key={service.id}
                        onPress={() => setSelectedService(service)}
                        style={[styles.serviceRow, selected && styles.serviceRowSelected]}
                      >
                        <View style={styles.serviceInfo}>
                          <Text style={styles.serviceName}>{service.name}</Text>
                          <Text style={styles.serviceMeta}>
                            {formatCurrency(service.price)} • {service.durationMin} min
                          </Text>
                          <Text style={styles.serviceDescription} numberOfLines={2}>
                            {service.description}
                          </Text>
                        </View>

                        <Pressable
                          onPress={() => onBook(service)}
                          style={({ pressed }) => [styles.rowAction, pressed && styles.rowActionPressed]}
                        >
                          <Text style={styles.rowActionText}>Boek</Text>
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {activeTab === "videos" ? (
                <View style={styles.section}>
                  {salon.feed.map((item) => (
                    <View key={item.id} style={styles.mediaRow}>
                      <Image source={{ uri: item.posterUrl }} style={styles.mediaThumb} contentFit="cover" transition={220} />
                      <View style={styles.mediaInfo}>
                        <Text style={styles.mediaTitle}>{item.title}</Text>
                        <Text style={styles.mediaCaption} numberOfLines={3}>
                          {item.caption}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {activeTab === "info" ? (
                <View style={styles.section}>
                  <Text style={styles.infoText}>{salon.bio}</Text>
                  <Text style={styles.infoText}>
                    Bekijk eerst de sfeer, kies daarna een behandeling en verstuur direct een boekingsaanvraag zonder loginwall.
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.stickyBar}>
              <View style={styles.stickyMeta}>
                <Text style={styles.stickyLabel}>{primaryBookableService?.name || "Kies een behandeling"}</Text>
                <Text style={styles.stickyPrice}>
                  {primaryBookableService ? formatCurrency(primaryBookableService.price) : formatCurrency(salon.minPrice)}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  if (primaryBookableService) onBook(primaryBookableService);
                }}
                style={({ pressed }) => [styles.stickyCta, pressed && styles.rowActionPressed]}
              >
                <Text style={styles.stickyCtaText}>Boek nu</Text>
              </Pressable>
            </View>

            <BookingRequestModal
              visible={bookingOpen}
              salon={salon}
              service={selectedService}
              onClose={() => setBookingOpen(false)}
            />
          </>
        )}
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  loadingStack: {
    gap: 14,
  },
  emptyState: {
    paddingVertical: 24,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  hero: {
    width: "100%",
    height: 430,
    backgroundColor: COLORS.surface,
    justifyContent: "space-between",
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopRow: {
    paddingHorizontal: 18,
    paddingTop: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  followButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.44)",
    backgroundColor: "rgba(8,14,22,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  followButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  heroCopy: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    gap: 4,
  },
  heroName: {
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "700",
  },
  heroSubline: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "600",
  },
  tabBar: {
    marginTop: 18,
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: COLORS.text,
  },
  tabButtonText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  tabButtonTextActive: {
    color: COLORS.text,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  serviceRowSelected: {
    backgroundColor: COLORS.surface,
  },
  serviceInfo: {
    flex: 1,
    gap: 4,
  },
  serviceName: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  serviceMeta: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  serviceDescription: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  rowAction: {
    minHeight: 42,
    paddingHorizontal: 16,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  rowActionPressed: {
    transform: [{ scale: 0.98 }],
  },
  rowActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  mediaRow: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  mediaThumb: {
    width: 128,
    height: 128,
    backgroundColor: COLORS.surface,
  },
  mediaInfo: {
    flex: 1,
    gap: 6,
    justifyContent: "center",
  },
  mediaTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  mediaCaption: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  infoText: {
    paddingVertical: 18,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 23,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  stickyMeta: {
    flex: 1,
    gap: 2,
  },
  stickyLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  stickyPrice: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  stickyCta: {
    minHeight: 50,
    paddingHorizontal: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyCtaText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
});
