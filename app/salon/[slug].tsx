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
  const mediaItems = useMemo(() => {
    if (!salon) return [];
    return [salon.coverImageUrl, ...salon.feed.map((item) => item.posterUrl)]
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .slice(0, 5);
  }, [salon]);

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
            <SkeletonBlock height={420} radius={24} />
            <SkeletonBlock height={32} width="46%" radius={8} />
            <SkeletonBlock height={18} width="28%" radius={8} />
            <SkeletonBlock height={120} radius={24} />
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
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.heroRail}
              >
                {mediaItems.map((uri, index) => (
                  <View key={`${uri}-${index}`} style={styles.heroCard}>
                    <Image source={{ uri }} style={styles.heroImage} contentFit="cover" transition={220} />
                    <LinearGradient
                      colors={["rgba(8,14,22,0.02)", "rgba(8,14,22,0.5)"]}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>
                ))}
              </ScrollView>

              <View style={styles.summaryBlock}>
                <View style={styles.summaryHeader}>
                  <View style={styles.summaryCopy}>
                    <Text style={styles.heroName}>{salon.name}</Text>
                    <Text style={styles.heroMeta}>
                      {salon.categoryLabel} in {salon.city}
                    </Text>
                  </View>

                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={14} color="#f4b400" />
                    <Text style={styles.ratingText}>{salon.rating.toFixed(1)}</Text>
                  </View>
                </View>

                <Text style={styles.heroSubline}>
                  {salon.reviewCount} reviews • Vanaf {formatCurrency(salon.minPrice)}
                </Text>

                <View style={styles.tagRow}>
                  {salon.categoryTags.map((tag) => (
                    <View key={tag} style={styles.tagPill}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.actionRow}>
                  <Pressable onPress={onFollow} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
                    <Ionicons name={followed ? "heart" : "heart-outline"} size={16} color={COLORS.text} />
                    <Text style={styles.secondaryButtonText}>{followed ? "Gevolgd" : "Volg salon"}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (primaryBookableService) onBook(primaryBookableService);
                    }}
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.primaryButtonText}>Boek direct</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.tabBar}>
                {[
                  { key: "services" as const, label: "Behandelingen" },
                  { key: "videos" as const, label: "Media" },
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
                <View style={styles.stack}>
                  {salon.services.map((service) => {
                    const selected = selectedService?.id === service.id;
                    return (
                      <Pressable
                        key={service.id}
                        onPress={() => setSelectedService(service)}
                        style={[styles.serviceCard, selected && styles.serviceCardSelected]}
                      >
                        <View style={styles.serviceInfo}>
                          <Text style={styles.serviceName}>{service.name}</Text>
                          <Text style={styles.serviceMeta}>
                            {formatCurrency(service.price)} • {service.durationMin} min
                          </Text>
                          <Text style={styles.serviceDescription}>{service.description}</Text>
                        </View>

                        <Pressable
                          onPress={() => onBook(service)}
                          style={({ pressed }) => [styles.serviceCta, pressed && styles.buttonPressed]}
                        >
                          <Text style={styles.serviceCtaText}>Boek</Text>
                        </Pressable>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {activeTab === "videos" ? (
                <View style={styles.stack}>
                  {salon.feed.map((item) => (
                    <View key={item.id} style={styles.mediaCard}>
                      <Image source={{ uri: item.posterUrl }} style={styles.mediaThumb} contentFit="cover" transition={220} />
                      <View style={styles.mediaInfo}>
                        <Text style={styles.mediaTitle}>{item.title}</Text>
                        <Text style={styles.mediaCaption}>{item.caption}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {activeTab === "info" ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Over deze salon</Text>
                  <Text style={styles.infoText}>{salon.bio}</Text>
                  <Text style={styles.infoText}>
                    Bekijk eerst de sfeer, kies daarna een behandeling en verstuur direct een boekingsaanvraag zonder
                    loginwall.
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
                style={({ pressed }) => [styles.stickyCta, pressed && styles.buttonPressed]}
              >
                <Text style={styles.stickyCtaText}>Boek direct</Text>
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
    gap: 16,
  },
  emptyState: {
    paddingVertical: 24,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  scrollContent: {
    paddingBottom: 132,
  },
  heroRail: {
    gap: 12,
    paddingRight: 18,
  },
  heroCard: {
    width: 316,
    height: 420,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  summaryBlock: {
    marginTop: 18,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 20,
    gap: 12,
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  summaryCopy: {
    flex: 1,
    gap: 5,
  },
  heroName: {
    color: COLORS.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  heroMeta: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: "700",
  },
  ratingPill: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  heroSubline: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  secondaryButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  tabBar: {
    marginTop: 18,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tabButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: "rgba(23,35,48,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: COLORS.primary,
  },
  tabButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  tabButtonTextActive: {
    color: "#ffffff",
  },
  stack: {
    marginTop: 18,
    gap: 14,
  },
  serviceCard: {
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 14,
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  serviceCardSelected: {
    borderWidth: 1,
    borderColor: "rgba(23,59,99,0.14)",
  },
  serviceInfo: {
    gap: 6,
  },
  serviceName: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  serviceMeta: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  serviceDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  serviceCta: {
    alignSelf: "flex-start",
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceCtaText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  mediaCard: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  mediaThumb: {
    width: "100%",
    height: 220,
    backgroundColor: COLORS.surface,
  },
  mediaInfo: {
    padding: 18,
    gap: 6,
  },
  mediaTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  mediaCaption: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  infoCard: {
    marginTop: 18,
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10,
    shadowColor: "#172330",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  infoTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  infoText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 24,
  },
  stickyBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(232,225,215,0.9)",
    backgroundColor: "rgba(255,255,255,0.96)",
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
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  stickyPrice: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  stickyCta: {
    minHeight: 54,
    paddingHorizontal: 22,
    borderRadius: 27,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stickyCtaText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
});
