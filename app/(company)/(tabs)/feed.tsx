import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Alert,
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
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
import WebInstallPromptOverlay from "../../../components/WebInstallPromptOverlay";
import { getUserRole, subscribeAuth } from "../../../lib/authRepo";
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

export default function CompanyFeedScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ companyId?: string; origin?: string }>();
  const companyFilter = typeof params.companyId === "string" ? params.companyId : undefined;
  const fromCompanyProfile = companyFilter && params.origin === "company-profile";
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [items, setItems] = useState<FeedPost[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("Alles");
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [role, setRole] = useState<AppRole>("company");
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
  const loadingMoreRef = useRef(false);
  const listRef = useRef<FlatList<FeedPost> | null>(null);

  const cardHeight = Math.max(320, Math.round(listHeight || 0));
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
    return subscribeAuth((user) => {
      setUid(user?.uid ?? null);
    });
  }, []);

  useEffect(() => {
    if (!uid) return;
    getUserRole(uid).then((r) => {
      if (r) setRole(r);
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
    setHasMore(true);

    fetchFeed({
      category: companyFilter ? undefined : category === "Alles" ? undefined : (category as any),
      companyId: companyFilter,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        if (!mounted) return;
        setItems(res.items);
        setLastDoc(res.lastDoc);
        setHasMore(Boolean(res.lastDoc));
        setIndexFallback(Boolean(res.usedFallback));
        setActiveId(res.items[0]?.id ?? null);
        loadSocial(res.items).catch(() => null);
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

  const snapToNearestItem = useCallback(
    (offsetY: number) => {
      if (cardHeight <= 0 || !items.length) return;
      const rawIndex = offsetY / cardHeight;
      const nextIndex = Math.max(0, Math.min(items.length - 1, Math.round(rawIndex)));
      const nextOffset = nextIndex * cardHeight;
      const nextId = items[nextIndex]?.id ?? null;
      if (allowPlaybackRef.current && nextId) {
        setActiveId(nextId);
      }
      if (Math.abs(nextOffset - offsetY) <= 2) return;
      listRef.current?.scrollToOffset({ offset: nextOffset, animated: true });
    },
    [cardHeight, items]
  );

  const onMomentumSnap = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      snapToNearestItem(event.nativeEvent.contentOffset.y);
    },
    [snapToNearestItem]
  );

  const onDragSnap = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityY = Number(event.nativeEvent.velocity?.y ?? 0);
      if (Math.abs(velocityY) > 0.15) return;
      snapToNearestItem(event.nativeEvent.contentOffset.y);
    },
    [snapToNearestItem]
  );

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
    if (!lastDoc || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetchFeed({
        category: companyFilter ? undefined : category === "Alles" ? undefined : (category as any),
        companyId: companyFilter,
        pageSize: PAGE_SIZE,
        lastDoc,
      });
      let appendedItems: FeedPost[] = [];
      setItems((prev) => {
        if (!res.items.length) return prev;
        const seen = new Set(prev.map((row) => row.id));
        appendedItems = res.items.filter((row) => !seen.has(row.id));
        return appendedItems.length ? [...prev, ...appendedItems] : prev;
      });
      setLastDoc(res.lastDoc ?? null);
      setHasMore(Boolean(res.lastDoc) && appendedItems.length > 0);
      if (res.usedFallback) {
        setIndexFallback(true);
      }
      if (appendedItems.length > 0) {
        await loadSocial(appendedItems);
      }
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }

  async function onToggleLike(postId: string) {
    if (!uid) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om te liken.");
      return;
    }
    if (likeBusyMap[postId]) return;
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
    if (!uid) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om te volgen.");
      return;
    }
    if (followBusyMap[companyId]) return;
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
        <View style={styles.feedHeaderRow}>
          <Text style={styles.feedHeaderTitle}>Publieke feed</Text>
          <Pressable style={styles.uploadBtn} onPress={() => router.push("/(company)/(tabs)/studio" as never)}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.uploadBtnText}>Upload</Text>
          </Pressable>
        </View>

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
              <Pressable style={styles.clearBtn} onPress={() => router.replace("/(company)/(tabs)/feed" as never)}>
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
            ref={listRef}
            data={items}
            keyExtractor={(item) => item.id}
            pagingEnabled
            snapToInterval={cardHeight}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate={Platform.OS === "ios" ? "fast" : 0.98}
            onMomentumScrollEnd={onMomentumSnap}
            onScrollEndDrag={onDragSnap}
            onEndReachedThreshold={0.35}
            onEndReached={loadMore}
            showsVerticalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            getItemLayout={(_, index) => ({ length: cardHeight, offset: cardHeight * index, index })}
            initialNumToRender={3}
            windowSize={5}
            maxToRenderPerBatch={4}
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
                      ? () => router.push(`/(customer)/service/${item.companyId}/${linkedServiceId}` as never)
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
              ) : !hasMore && items.length > 0 ? (
                <View style={styles.footerEnd}>
                  <Ionicons name="checkmark-circle-outline" size={14} color="#9fd3ff" />
                  <Text style={styles.footerEndText}>Je hebt alles gezien.</Text>
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
      <WebInstallPromptOverlay />
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
  feedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  feedHeaderTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  uploadBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
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
  footerEnd: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  footerEndText: {
    color: "#9fd3ff",
    fontSize: 12,
    fontWeight: "700",
  },
});
