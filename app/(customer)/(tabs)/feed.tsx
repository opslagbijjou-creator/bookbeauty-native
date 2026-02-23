import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Alert,
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import CategoryChips from "../../../components/CategoryChips";
import CommentsSheet from "../../../components/CommentsSheet";
import VideoPostCard from "../../../components/VideoPostCard";
import { getUserRole } from "../../../lib/authRepo";
import { auth } from "../../../lib/firebase";
import { fetchFeed, FeedPost } from "../../../lib/feedRepo";
import { AppRole } from "../../../lib/roles";
import {
  getCompanyFollowersCount,
  getPostCommentCount,
  getPostLikeCount,
  isFollowingCompany,
  isPostLiked,
  toggleFollowCompany,
  togglePostLike,
} from "../../../lib/socialRepo";
import { CATEGORIES, COLORS } from "../../../lib/ui";

const PAGE_SIZE = 6;

export default function CustomerFeedScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ companyId?: string; origin?: string }>();
  const companyFilter = typeof params.companyId === "string" ? params.companyId : undefined;
  const fromCompanyProfile = companyFilter && params.origin === "company-profile";
  const uid = auth.currentUser?.uid ?? null;
  const [items, setItems] = useState<FeedPost[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("Alles");
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [role, setRole] = useState<AppRole>("customer");
  const [listHeight, setListHeight] = useState(0);
  const [indexFallback, setIndexFallback] = useState(false);
  const [isAppActive, setIsAppActive] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [commentCountMap, setCommentCountMap] = useState<Record<string, number>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});
  const [followersCountMap, setFollowersCountMap] = useState<Record<string, number>>({});
  const [likeBusyMap, setLikeBusyMap] = useState<Record<string, boolean>>({});
  const [followBusyMap, setFollowBusyMap] = useState<Record<string, boolean>>({});
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const allowPlayback = isFocused && isAppActive && !commentsPostId;
  const allowPlaybackRef = useRef(allowPlayback);

  const cardHeight = Math.max(320, listHeight || 0);
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

  const loadSocial = useCallback(async (itemsToHydrate: FeedPost[]) => {
    if (!uid || !itemsToHydrate.length) return;

    const likeStates = await Promise.all(itemsToHydrate.map((x) => isPostLiked(x.id, uid)));
    const likeCounts = await Promise.all(itemsToHydrate.map((x) => getPostLikeCount(x.id)));
    const commentCounts = await Promise.all(itemsToHydrate.map((x) => getPostCommentCount(x.id)));
    const followStates = await Promise.all(itemsToHydrate.map((x) => isFollowingCompany(x.companyId, uid)));
    const followerCounts = await Promise.all(itemsToHydrate.map((x) => getCompanyFollowersCount(x.companyId)));

    const likesNext: Record<string, boolean> = {};
    const likeCountNext: Record<string, number> = {};
    const commentCountNext: Record<string, number> = {};
    const followNext: Record<string, boolean> = {};
    const followerCountNext: Record<string, number> = {};

    itemsToHydrate.forEach((item, idx) => {
      likesNext[item.id] = likeStates[idx];
      likeCountNext[item.id] = likeCounts[idx];
      commentCountNext[item.id] = commentCounts[idx];
      followNext[item.companyId] = followStates[idx];
      followerCountNext[item.companyId] = followerCounts[idx];
    });

    setLikedMap((prev) => ({ ...prev, ...likesNext }));
    setLikeCountMap((prev) => ({ ...prev, ...likeCountNext }));
    setCommentCountMap((prev) => ({ ...prev, ...commentCountNext }));
    setFollowingMap((prev) => ({ ...prev, ...followNext }));
    setFollowersCountMap((prev) => ({ ...prev, ...followerCountNext }));
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    getUserRole(uid)
      .then((r) => {
        if (r) setRole(r);
      })
      .catch((error) => {
        console.warn("[customer/feed] getUserRole failed", error);
      });
  }, [uid]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setIsAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    allowPlaybackRef.current = allowPlayback;
  }, [allowPlayback]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchFeed({
      category: companyFilter ? undefined : category === "Alles" ? undefined : (category as any),
      companyId: companyFilter,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (!mounted) return;
        setItems(res.items);
        setLastDoc(res.lastDoc);
        setIndexFallback(Boolean(res.usedFallback));
        setActiveId(res.items[0]?.id ?? null);
        loadSocial(res.items).catch(() => null);
      })
      .catch((error) => {
        if (!mounted) return;
        console.warn("[customer/feed] fetchFeed failed", error);
        setItems([]);
        setLastDoc(null);
        setActiveId(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [category, loadSocial, companyFilter]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (!allowPlaybackRef.current) {
      setActiveId(null);
      return;
    }
    const current = viewableItems[0]?.item as FeedPost | undefined;
    if (current?.id) setActiveId(current.id);
  }).current;

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 80 }), []);

  useEffect(() => {
    if (!allowPlayback) {
      setActiveId(null);
      return;
    }
    if (!activeId && items.length) {
      setActiveId(items[0].id);
    }
  }, [allowPlayback, activeId, items]);

  async function loadMore() {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchFeed({
        category: companyFilter ? undefined : category === "Alles" ? undefined : (category as any),
        companyId: companyFilter,
        pageSize: PAGE_SIZE,
        lastDoc,
      });
      setItems((prev) => [...prev, ...res.items]);
      setLastDoc(res.lastDoc);
      if (res.usedFallback) {
        setIndexFallback(true);
      }
      await loadSocial(res.items);
    } finally {
      setLoadingMore(false);
    }
  }

  async function onToggleLike(postId: string) {
    if (!uid || likeBusyMap[postId]) return;
    const prevLiked = Boolean(likedMap[postId]);
    const prevCount = likeCountMap[postId] ?? 0;
    const optimisticLiked = !prevLiked;
    const optimisticCount = Math.max(0, prevCount + (optimisticLiked ? 1 : -1));
    setLikeBusyMap((prev) => ({ ...prev, [postId]: true }));
    setLikedMap((prev) => ({ ...prev, [postId]: optimisticLiked }));
    setLikeCountMap((prev) => ({ ...prev, [postId]: optimisticCount }));
    try {
      const nextLiked = await togglePostLike(postId, uid, role);
      setLikedMap((prev) => ({ ...prev, [postId]: nextLiked }));
      getPostLikeCount(postId)
        .then((count) => setLikeCountMap((prev) => ({ ...prev, [postId]: count })))
        .catch(() => null);
    } catch (error: any) {
      setLikedMap((prev) => ({ ...prev, [postId]: prevLiked }));
      setLikeCountMap((prev) => ({ ...prev, [postId]: prevCount }));
      Alert.alert("Like mislukt", error?.message ?? "Kon like niet aanpassen.");
    } finally {
      setLikeBusyMap((prev) => ({ ...prev, [postId]: false }));
    }
  }

  async function onToggleFollow(companyId: string) {
    if (!uid || followBusyMap[companyId]) return;
    const prevFollowing = Boolean(followingMap[companyId]);
    const prevCount = followersCountMap[companyId] ?? 0;
    const optimisticFollowing = !prevFollowing;
    const optimisticCount = Math.max(0, prevCount + (optimisticFollowing ? 1 : -1));
    setFollowBusyMap((prev) => ({ ...prev, [companyId]: true }));
    setFollowingMap((prev) => ({ ...prev, [companyId]: optimisticFollowing }));
    setFollowersCountMap((prev) => ({ ...prev, [companyId]: optimisticCount }));
    try {
      const next = await toggleFollowCompany(companyId, uid, role);
      setFollowingMap((prev) => ({ ...prev, [companyId]: next }));
      getCompanyFollowersCount(companyId)
        .then((count) => setFollowersCountMap((prev) => ({ ...prev, [companyId]: count })))
        .catch(() => null);
    } catch (error: any) {
      setFollowingMap((prev) => ({ ...prev, [companyId]: prevFollowing }));
      setFollowersCountMap((prev) => ({ ...prev, [companyId]: prevCount }));
      Alert.alert("Volgen mislukt", error?.message ?? "Kon salon niet volgen.");
    } finally {
      setFollowBusyMap((prev) => ({ ...prev, [companyId]: false }));
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.chipsWrap}>
        {indexFallback ? (
          <View style={styles.warnPill}>
            <Ionicons name="information-circle-outline" size={14} color="#fff" />
            <Text style={styles.warnText}>Index ontbreekt: tijdelijke fallback actief</Text>
          </View>
        ) : null}

        {companyFilter ? (
          <View style={styles.companyFilterRow}>
            <View style={styles.companyFilterPill}>
              <Ionicons name="business-outline" size={13} color="#fff" />
              <Text style={styles.companyFilterText}>Feed van salon</Text>
            </View>
            <View style={styles.companyFilterActions}>
              {fromCompanyProfile ? (
                <Pressable
                  style={styles.clearBtn}
                  onPress={() => router.push(`/(customer)/company/${companyFilter}` as never)}
                >
                  <Ionicons name="arrow-back-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.clearText}>Profiel</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.clearBtn} onPress={() => router.replace("/(customer)/(tabs)/feed" as never)}>
                <Ionicons name="close-outline" size={14} color={COLORS.primary} />
                <Text style={styles.clearText}>Alles</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <CategoryChips
            items={["Alles", ...CATEGORIES]}
            active={category}
            onChange={setCategory}
            iconMap={categoryIcons}
          />
        )}
      </View>

      <View style={styles.listWrap} onLayout={(event) => setListHeight(event.nativeEvent.layout.height)}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            pagingEnabled
            onEndReachedThreshold={0.35}
            onEndReached={loadMore}
            showsVerticalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            renderItem={({ item }) => {
              const rawServiceId = typeof item.serviceId === "string" ? item.serviceId.trim() : "";
              const linkedServiceId =
                rawServiceId && rawServiceId !== "undefined" && rawServiceId !== "null" ? rawServiceId : "";

              return (
                <VideoPostCard
                  post={item}
                  isActive={allowPlayback && item.id === activeId}
                  height={cardHeight}
                  liked={likedMap[item.id]}
                  likeCount={likeCountMap[item.id]}
                  commentCount={commentCountMap[item.id]}
                  following={followingMap[item.companyId]}
                  followerCount={followersCountMap[item.companyId]}
                  likeBusy={Boolean(likeBusyMap[item.id])}
                  followBusy={Boolean(followBusyMap[item.companyId])}
                  onToggleLike={() => onToggleLike(item.id)}
                  onOpenComments={() => setCommentsPostId(item.id)}
                  onToggleFollow={() => onToggleFollow(item.companyId)}
                  onOpenCompany={() => router.push(`/(customer)/company/${item.companyId}` as never)}
                  onOpenLinkedService={
                    linkedServiceId
                      ? () => router.push(`/(customer)/book/${item.companyId}/${linkedServiceId}` as never)
                      : undefined
                  }
                />
              );
            }}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footer}>
                  <ActivityIndicator color={COLORS.primary} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.empty}>Nog geen feed posts.</Text>
              </View>
            }
          />
        )}
      </View>

      <CommentsSheet
        visible={Boolean(commentsPostId)}
        postId={commentsPostId}
        uid={uid}
        role={role}
        onClose={() => setCommentsPostId(null)}
        onCountChange={(postId, count) => setCommentCountMap((prev) => ({ ...prev, [postId]: count }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#000",
  },
  chipsWrap: {
    paddingTop: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: "#0d0d0d",
    gap: 8,
  },
  warnPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(223,79,154,0.8)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  warnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 11,
  },
  companyFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  companyFilterActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  companyFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  companyFilterText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clearText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listWrap: {
    flex: 1,
  },
  empty: {
    color: "#fff",
    fontWeight: "700",
  },
  footer: {
    paddingVertical: 16,
  },
});
