import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, ViewToken, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { getUserRole, subscribeAuth } from "../lib/authRepo";
import { auth } from "../lib/firebase";
import {
  MarketplaceFeedItem,
  buildFeedSeo,
  fetchMarketplaceFeed,
} from "../lib/marketplace";
import type { AppRole } from "../lib/roles";
import { getPostLikeCount, isPostLiked, togglePostLike } from "../lib/socialRepo";
import { COLORS } from "../lib/ui";

export default function PublicFeedScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const seo = buildFeedSeo();
  const [items, setItems] = useState<MarketplaceFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [role, setRole] = useState<AppRole>("customer");
  const [muted, setMuted] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [likeBusyMap, setLikeBusyMap] = useState<Record<string, boolean>>({});
  const [failedVideoMap, setFailedVideoMap] = useState<Record<string, boolean>>({});
  const slideHeight = Math.max(560, height - 78);

  useEffect(() => {
    return subscribeAuth((user) => {
      setUid(user?.uid ?? null);
    });
  }, []);

  useEffect(() => {
    if (!uid) {
      setRole("customer");
      setLikedMap({});
      return;
    }
    getUserRole(uid)
      .then((nextRole) => {
        if (nextRole) {
          setRole(nextRole);
        }
      })
      .catch(() => {
        setRole("customer");
      });
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceFeed(8)
      .then((result) => {
        if (cancelled) return;
        setItems(result);
        setActiveId(result[0]?.id ?? null);
        setFailedVideoMap({});
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setActiveId(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const liveItems = items.filter((item) => !item.isDemo);
    if (!liveItems.length) return;

    let cancelled = false;

    Promise.all(liveItems.map((item) => getPostLikeCount(item.id).catch(() => 0)))
      .then((counts) => {
        if (cancelled) return;
        const nextCounts: Record<string, number> = {};
        liveItems.forEach((item, index) => {
          nextCounts[item.id] = counts[index];
        });
        setLikeCountMap((prev) => ({ ...prev, ...nextCounts }));
      })
      .catch(() => null);

    if (!uid) return () => {
      cancelled = true;
    };

    Promise.all(liveItems.map((item) => isPostLiked(item.id, uid).catch(() => false)))
      .then((likes) => {
        if (cancelled) return;
        const nextLiked: Record<string, boolean> = {};
        liveItems.forEach((item, index) => {
          nextLiked[item.id] = likes[index];
        });
        setLikedMap((prev) => ({ ...prev, ...nextLiked }));
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [items, uid]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const current = viewableItems[0]?.item as MarketplaceFeedItem | undefined;
    setActiveId(current?.id ?? null);
  }).current;

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 78 }), []);

  const onToggleLike = useCallback(
    async (item: MarketplaceFeedItem) => {
      if (!uid) {
        router.push("/(auth)/login" as never);
        return;
      }
      if (likeBusyMap[item.id]) return;

      const prevLiked = Boolean(likedMap[item.id]);
      const prevCount = likeCountMap[item.id] ?? 0;
      const optimisticLiked = !prevLiked;
      const optimisticCount = Math.max(0, prevCount + (optimisticLiked ? 1 : -1));

      setLikeBusyMap((prev) => ({ ...prev, [item.id]: true }));
      setLikedMap((prev) => ({ ...prev, [item.id]: optimisticLiked }));
      setLikeCountMap((prev) => ({ ...prev, [item.id]: optimisticCount }));

      if (item.isDemo) {
        setLikeBusyMap((prev) => ({ ...prev, [item.id]: false }));
        return;
      }

      try {
        const nextLiked = await togglePostLike(item.id, uid, role);
        setLikedMap((prev) => ({ ...prev, [item.id]: nextLiked }));
        const nextCount = await getPostLikeCount(item.id).catch(() => optimisticCount);
        setLikeCountMap((prev) => ({ ...prev, [item.id]: nextCount }));
      } catch {
        setLikedMap((prev) => ({ ...prev, [item.id]: prevLiked }));
        setLikeCountMap((prev) => ({ ...prev, [item.id]: prevCount }));
      } finally {
        setLikeBusyMap((prev) => ({ ...prev, [item.id]: false }));
      }
    },
    [likeBusyMap, likeCountMap, likedMap, role, router, uid]
  );

  function renderItem({ item }: { item: MarketplaceFeedItem }) {
    const failedVideo = Boolean(failedVideoMap[item.id]);
    const videoUrl = item.videoUrl?.trim() || "";
    const imageUrl = item.imageUrl?.trim() || item.posterUrl;
    const canPlayVideo = item.mediaType === "video" && Boolean(videoUrl) && !failedVideo;
    const isActive = activeId === item.id;
    const isLiked = Boolean(likedMap[item.id]);
    const likeCount = likeCountMap[item.id] ?? 0;

    return (
      <View style={[styles.slide, { height: slideHeight }]}>
        <Image source={{ uri: item.posterUrl }} style={styles.media} contentFit="cover" transition={220} />

        {canPlayVideo ? (
          <Video
            source={{ uri: videoUrl }}
            style={styles.media}
            resizeMode={ResizeMode.COVER}
            shouldPlay={isActive}
            isLooping
            isMuted={muted}
            volume={muted ? 0 : 1}
            onError={() => {
              setFailedVideoMap((prev) => ({ ...prev, [item.id]: true }));
            }}
          />
        ) : imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.media} contentFit="cover" transition={220} />
        ) : null}

        <LinearGradient
          colors={["rgba(8,14,22,0.08)", "rgba(8,14,22,0.74)"]}
          style={StyleSheet.absoluteFillObject}
        />

        <View style={styles.actionsRail}>
          <Pressable
            onPress={() => onToggleLike(item).catch(() => null)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          >
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={26}
              color={isLiked ? COLORS.accent : "#ffffff"}
            />
            <Text style={styles.iconLabel}>{likeBusyMap[item.id] ? "..." : String(likeCount)}</Text>
          </Pressable>

          {canPlayVideo ? (
            <Pressable
              onPress={() => setMuted((current) => !current)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            >
              <Ionicons name={muted ? "volume-mute-outline" : "volume-high-outline"} size={24} color="#ffffff" />
              <Text style={styles.iconLabel}>{muted ? "Stil" : "Geluid"}</Text>
            </Pressable>
          ) : (
            <View style={styles.iconButtonPassive}>
              <Ionicons name="image-outline" size={22} color="#ffffff" />
              <Text style={styles.iconLabel}>Foto</Text>
            </View>
          )}
        </View>

        <View style={styles.overlay}>
          <View style={styles.copyWrap}>
            <Text style={styles.categoryLabel}>{item.categoryLabel}</Text>
            <View style={styles.brandRow}>
              <View style={styles.brandBadge}>
                {item.companyLogoUrl ? (
                  <Image source={{ uri: item.companyLogoUrl }} style={styles.brandLogo} contentFit="cover" />
                ) : (
                  <Ionicons name="business-outline" size={14} color="#ffffff" />
                )}
              </View>
              <Text style={styles.salonName}>{item.companyName}</Text>
            </View>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.caption}>{item.caption}</Text>
          </View>

          <Pressable
            onPress={() => router.push(`/salon/${item.companySlug}` as never)}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>Bekijk salon</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <MarketplaceShell active="feed" scroll={false} fullBleed>
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />

      <View style={styles.screen}>
        {loading ? (
          <View style={[styles.slide, { height: slideHeight, backgroundColor: "#0b1018" }]} />
        ) : (
          <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            pagingEnabled
            snapToInterval={slideHeight}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => ({
              length: slideHeight,
              offset: slideHeight * index,
              index,
            })}
          />
        )}
      </View>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0b1018",
  },
  slide: {
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "#0b1018",
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0b1018",
  },
  actionsRail: {
    position: "absolute",
    right: 16,
    bottom: 112,
    zIndex: 3,
    alignItems: "center",
    gap: 18,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  iconButtonPassive: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    opacity: 0.9,
  },
  iconButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  iconLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  overlay: {
    paddingHorizontal: 18,
    paddingBottom: 26,
    paddingRight: 88,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    zIndex: 2,
  },
  copyWrap: {
    flex: 1,
    gap: 6,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandLogo: {
    width: "100%",
    height: "100%",
  },
  categoryLabel: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  salonName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  caption: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 560,
  },
  cta: {
    minHeight: 52,
    paddingHorizontal: 18,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: {
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
});
