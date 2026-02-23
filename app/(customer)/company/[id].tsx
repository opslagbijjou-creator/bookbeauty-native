import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import CategoryChips from "../../../components/CategoryChips";
import ServiceCard from "../../../components/ServiceCard";
import { getUserRole } from "../../../lib/authRepo";
import { CompanyPublic, fetchCompanyById } from "../../../lib/companyRepo";
import { fetchCompanyFeedPublic, FeedPost } from "../../../lib/feedRepo";
import { auth } from "../../../lib/firebase";
import { AppRole } from "../../../lib/roles";
import { CompanyService, fetchCompanyServicesPublic } from "../../../lib/serviceRepo";
import {
  getCompanyFollowersCount,
  getCompanyProfileRating,
  getCompanyTotalLikes,
  getMyServiceRating,
  getServiceRating,
  isFollowingCompany,
  rateService,
  toggleFollowCompany,
} from "../../../lib/socialRepo";
import { COLORS } from "../../../lib/ui";

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Alles: "apps-outline",
  Kapper: "cut-outline",
  Nagels: "flower-outline",
  Wimpers: "eye-outline",
  Wenkbrauwen: "sparkles-outline",
  "Make-up": "color-palette-outline",
  Massage: "body-outline",
  Spa: "water-outline",
  Barber: "man-outline",
  Overig: "grid-outline",
};

function cloudinaryVideoThumbnailFromUrl(videoUrl?: string): string {
  if (!videoUrl) return "";
  const [rawPath, rawQuery = ""] = videoUrl.split("?");
  let path = rawPath;

  if (path.includes("/upload/")) {
    path = path.replace("/upload/", "/upload/so_1,w_540,h_920,c_fill,q_auto,f_jpg/");
  }

  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(path)) {
    path = path.replace(/\.(mp4|mov|m4v|webm|avi)$/i, ".jpg");
  } else if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) {
    path = `${path}.jpg`;
  }

  return rawQuery ? `${path}?${rawQuery}` : path;
}

function videoPreviewText(item: FeedPost): string {
  if (item.caption?.trim()) return item.caption.trim();
  if (item.hashtags?.length) return item.hashtags.map((tag) => `#${tag}`).join(" ");
  return item.category;
}

function feedPreviewImage(item: FeedPost): string {
  if (item.thumbnailUrl?.trim()) return item.thumbnailUrl.trim();
  if (item.imageUrl?.trim()) return item.imageUrl.trim();
  return cloudinaryVideoThumbnailFromUrl(item.videoUrl);
}

export default function CompanyProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = auth.currentUser?.uid ?? null;

  const [company, setCompany] = useState<CompanyPublic | null>(null);
  const [services, setServices] = useState<CompanyService[]>([]);
  const [videos, setVideos] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("Alles");
  const [activeContent, setActiveContent] = useState<"services" | "videos">("services");
  const [role, setRole] = useState<AppRole>("customer");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [likesTotal, setLikesTotal] = useState(0);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [ratingMinReviews, setRatingMinReviews] = useState(10);
  const [serviceRatingMap, setServiceRatingMap] = useState<Record<string, { avg: number; count: number }>>({});
  const [myServiceRatingMap, setMyServiceRatingMap] = useState<Record<string, number | null>>({});

  const loadSocial = useCallback(
    async (companyId: string) => {
      const [followers, likes, rating] = await Promise.all([
        getCompanyFollowersCount(companyId),
        getCompanyTotalLikes(companyId),
        getCompanyProfileRating(companyId),
      ]);
      setFollowersCount(followers);
      setLikesTotal(likes);
      setRatingAvg(rating.avg);
      setRatingCount(rating.count);
      setRatingMinReviews(rating.minReviewCount);

      if (uid) {
        const [followingState] = await Promise.all([isFollowingCompany(companyId, uid)]);
        setFollowing(followingState);
      }
    },
    [uid]
  );

  const loadServiceRatings = useCallback(
    async (companyId: string, serviceItems: CompanyService[]) => {
      if (!serviceItems.length) {
        setServiceRatingMap({});
        setMyServiceRatingMap({});
        return;
      }

      const summaries = await Promise.all(serviceItems.map((service) => getServiceRating(companyId, service.id)));
      const nextSummary: Record<string, { avg: number; count: number }> = {};
      serviceItems.forEach((service, index) => {
        nextSummary[service.id] = summaries[index];
      });
      setServiceRatingMap(nextSummary);

      if (!uid) {
        setMyServiceRatingMap({});
        return;
      }

      const myScores = await Promise.all(
        serviceItems.map((service) => getMyServiceRating(companyId, service.id, uid))
      );
      const nextMine: Record<string, number | null> = {};
      serviceItems.forEach((service, index) => {
        nextMine[service.id] = myScores[index];
      });
      setMyServiceRatingMap(nextMine);
    },
    [uid]
  );

  useEffect(() => {
    if (!uid) return;
    getUserRole(uid)
      .then((r) => {
        if (r) setRole(r);
      })
      .catch((error) => {
        console.warn("[customer/company-profile] getUserRole failed", error);
      });
  }, [uid]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setLoading(true);

    Promise.all([fetchCompanyById(id), fetchCompanyServicesPublic(id), fetchCompanyFeedPublic(id)])
      .then(([companyData, serviceData, videoData]) => {
        if (!mounted) return;
        setCompany(companyData);
        setServices(serviceData);
        setVideos(videoData);
        loadSocial(id).catch(() => null);
        loadServiceRatings(id, serviceData).catch(() => null);
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn("[customer/company-profile] load failed", error);
        setCompany(null);
        setServices([]);
        setVideos([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, loadSocial, loadServiceRatings]);

  const categories = useMemo(() => {
    const unique = new Set(services.map((s) => s.category));
    return ["Alles", ...Array.from(unique)];
  }, [services]);

  const filtered = useMemo(() => {
    if (activeCategory === "Alles") return services;
    return services.filter((s) => s.category === activeCategory);
  }, [services, activeCategory]);
  const serviceCount = services.length;
  const videoCount = videos.length;
  const hasEnoughProfileReviews = ratingCount >= ratingMinReviews;
  const profileRatingValue = hasEnoughProfileReviews ? ratingAvg.toFixed(1) : "-";
  const profileRatingLabel = hasEnoughProfileReviews
    ? `${ratingCount} ${ratingCount === 1 ? "review" : "reviews"}`
    : `${ratingCount}/${ratingMinReviews} reviews`;

  async function onToggleFollow() {
    if (!id || !uid || followBusy) return;
    const previousFollow = following;
    const previousCount = followersCount;
    const optimisticFollow = !previousFollow;
    setFollowBusy(true);
    setFollowing(optimisticFollow);
    setFollowersCount(Math.max(0, previousCount + (optimisticFollow ? 1 : -1)));
    try {
      const next = await toggleFollowCompany(id, uid, role);
      setFollowing(next);
      getCompanyFollowersCount(id)
        .then((count) => setFollowersCount(count))
        .catch(() => null);
    } catch (error: any) {
      setFollowing(previousFollow);
      setFollowersCount(previousCount);
      Alert.alert("Volgen mislukt", error?.message ?? "Kon salon niet volgen.");
    } finally {
      setFollowBusy(false);
    }
  }

  async function onRateService(serviceId: string, score: number) {
    if (!id || !uid || role !== "customer") return;
    try {
      await rateService(id, serviceId, uid, score);
      const [summary, mine, companyRating] = await Promise.all([
        getServiceRating(id, serviceId),
        getMyServiceRating(id, serviceId, uid),
        getCompanyProfileRating(id),
      ]);
      setServiceRatingMap((prev) => ({ ...prev, [serviceId]: summary }));
      setMyServiceRatingMap((prev) => ({ ...prev, [serviceId]: mine }));
      setRatingAvg(companyRating.avg);
      setRatingCount(companyRating.count);
      setRatingMinReviews(companyRating.minReviewCount);
    } catch (error: any) {
      Alert.alert("Beoordeling mislukt", error?.message ?? "Kon beoordeling niet opslaan.");
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back-outline" size={18} color={COLORS.primary} />
        <Text style={styles.back}>Terug</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !company ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Salon niet gevonden.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={["#f05a9f", "#d83e88"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.logoWrap}>
                {company.logoUrl ? (
                  <Image source={{ uri: company.logoUrl }} style={styles.logoImg} contentFit="cover" />
                ) : (
                  <Ionicons name="business-outline" size={28} color="#fff" />
                )}
              </View>
              <View style={styles.nameBlock}>
                <View style={styles.nameBadgeRow}>
                  <Text style={styles.name}>{company.name}</Text>
                  {company.badge ? (
                    <View style={styles.badge}>
                      <Ionicons name="shield-checkmark" size={12} color="#fff" />
                      <Text style={styles.badgeText}>{company.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cityRow}>
                  <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.92)" />
                  <Text style={styles.city}>{company.city || "Stad onbekend"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.catWrap}>
              {(company.categories?.length ? company.categories : ["Overig"]).map((cat) => (
                <View key={cat} style={styles.catPill}>
                  <Text style={styles.catText}>{cat}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.bio}>{company.bio || "Geen bio toegevoegd."}</Text>
          </LinearGradient>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Ionicons name="people-outline" size={16} color={COLORS.primary} />
              <Text style={styles.statValue}>{followersCount}</Text>
              <Text style={styles.statLabel}>Volgers</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="heart-outline" size={16} color={COLORS.primary} />
              <Text style={styles.statValue}>{likesTotal}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="star-outline" size={16} color={COLORS.primary} />
              <Text style={styles.statValue}>{profileRatingValue}</Text>
              <Text style={styles.statLabel}>{profileRatingLabel}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            {uid ? (
              <Pressable
                style={[styles.followBtn, following && styles.followBtnActive, followBusy && styles.disabled]}
                onPress={onToggleFollow}
                disabled={followBusy}
              >
                <Ionicons
                  name={followBusy ? "hourglass-outline" : following ? "checkmark-circle" : "add-circle"}
                  size={19}
                  color="#fff"
                />
                <Text style={styles.followText}>{followBusy ? "Even..." : following ? "Volgend" : "Volgen"}</Text>
              </Pressable>
            ) : null}
            {id ? (
              <Pressable
                style={styles.openFeedBtn}
                onPress={() => router.push(`/(customer)/(tabs)/feed?companyId=${id}&origin=company-profile` as never)}
              >
                <Ionicons name="play" size={16} color="#fff" />
                <Text style={styles.openFeedText}>Bekijk feed</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.tabShell}>
            <Pressable
              style={[styles.tabBtn, activeContent === "services" && styles.tabBtnActive]}
              onPress={() => setActiveContent("services")}
            >
              <Ionicons
                name={activeContent === "services" ? "cut" : "cut-outline"}
                size={16}
                color={activeContent === "services" ? "#fff" : COLORS.primary}
              />
              <Text style={[styles.tabText, activeContent === "services" && styles.tabTextActive]}>
                Diensten ({serviceCount})
              </Text>
            </Pressable>

            <Pressable
              style={[styles.tabBtn, activeContent === "videos" && styles.tabBtnActive]}
              onPress={() => setActiveContent("videos")}
            >
              <Ionicons
                name={activeContent === "videos" ? "play" : "play-outline"}
                size={16}
                color={activeContent === "videos" ? "#fff" : COLORS.primary}
              />
              <Text style={[styles.tabText, activeContent === "videos" && styles.tabTextActive]}>
                Video&apos;s ({videoCount})
              </Text>
            </Pressable>
          </View>

          {activeContent === "services" ? (
            <>
              <View style={styles.panelHeader}>
                <Ionicons name="pricetags-outline" size={15} color={COLORS.primary} />
                <Text style={styles.section}>Beschikbare diensten</Text>
              </View>

              <CategoryChips
                items={categories}
                active={activeCategory}
                onChange={setActiveCategory}
                iconMap={categoryIcons}
              />

              <View style={styles.serviceList}>
                {filtered.length ? (
                  filtered.map((item) => (
                    <ServiceCard
                      key={item.id}
                      service={item}
                      ratingAvg={serviceRatingMap[item.id]?.avg}
                      ratingCount={serviceRatingMap[item.id]?.count}
                      myRating={myServiceRatingMap[item.id]}
                      canRate={Boolean(uid && role === "customer")}
                      onRate={(score) => onRateService(item.id, score)}
                      onMoreInfo={() => router.push(`/(customer)/service/${id}/${item.id}` as never)}
                      onBookNow={() => router.push(`/(customer)/book/${id}/${item.id}` as never)}
                    />
                  ))
                ) : (
                  <Text style={styles.empty}>Geen diensten in deze categorie.</Text>
                )}
              </View>
            </>
          ) : (
            <>
              <View style={styles.panelHeader}>
                <Ionicons name="albums-outline" size={15} color={COLORS.primary} />
                <Text style={styles.section}>Recente posts</Text>
              </View>

              {videos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.videoList}>
                  {videos.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.videoCard}
                      onPress={() => router.push(`/(customer)/(tabs)/feed?companyId=${item.companyId}&origin=company-profile` as never)}
                    >
                      <Image
                        source={{ uri: feedPreviewImage(item) }}
                        style={styles.videoThumb}
                        contentFit="cover"
                      />
                      <View style={styles.videoGradient} />
                      <View style={styles.videoCardTop}>
                        <View style={styles.videoMiniLogo}>
                          {company.logoUrl ? (
                            <Image source={{ uri: company.logoUrl }} style={styles.videoMiniLogoImg} contentFit="cover" />
                          ) : (
                            <Ionicons name="business-outline" size={12} color="#fff" />
                          )}
                        </View>
                        {item.mediaType !== "image" ? (
                          <View style={styles.playCircle}>
                            <Ionicons name="play" size={14} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.videoTitle} numberOfLines={2}>
                        {videoPreviewText(item)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.empty}>Nog geen posts.</Text>
              )}
            </>
          )}
        </ScrollView>
      )}
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
  content: {
    paddingBottom: 28,
    gap: 10,
  },
  back: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginBottom: 10,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    gap: 9,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: {
    color: "#fff",
    fontSize: 25,
    fontWeight: "900",
  },
  nameBlock: {
    flex: 1,
    gap: 5,
  },
  nameBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImg: {
    width: "100%",
    height: "100%",
  },
  cityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  city: {
    color: "rgba(255,255,255,0.96)",
    fontWeight: "700",
    fontSize: 13,
  },
  bio: {
    color: "rgba(255,255,255,0.94)",
    lineHeight: 20,
    fontWeight: "500",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  catWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  catPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  catText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  followBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  followBtnActive: {
    backgroundColor: "#4f9f66",
  },
  followText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  openFeedBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.text,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  openFeedText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.65,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  starBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  tabShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 6,
    flexDirection: "row",
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 8,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  tabTextActive: {
    color: "#fff",
  },
  section: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 15,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  serviceRatingCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 7,
  },
  serviceRatingTop: {
    gap: 2,
  },
  serviceRatingTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "800",
  },
  serviceRatingHint: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  videoList: {
    gap: 8,
    paddingBottom: 4,
  },
  videoCard: {
    width: 182,
    height: 212,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: "#121212",
    padding: 10,
    justifyContent: "space-between",
    overflow: "hidden",
    position: "relative",
  },
  videoThumb: {
    ...StyleSheet.absoluteFillObject,
  },
  videoGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  videoCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  videoMiniLogo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  videoMiniLogoImg: {
    width: "100%",
    height: "100%",
  },
  playCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
  },
  videoTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  serviceList: {
    paddingTop: 2,
    gap: 8,
  },
  empty: {
    textAlign: "center",
    color: COLORS.muted,
    fontWeight: "600",
    marginVertical: 14,
  },
});
