import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { getUserRole, subscribeAuth } from "../lib/authRepo";
import { auth } from "../lib/firebase";
import { MarketplaceFeedItem, buildFeedSeo, fetchMarketplaceFeed } from "../lib/marketplace";
import type { AppRole } from "../lib/roles";
import { getPostLikeCount, isPostLiked, togglePostLike } from "../lib/socialRepo";
import { COLORS } from "../lib/ui";

type FeedSlideProps = {
  item: MarketplaceFeedItem;
  height: number;
  isActive: boolean;
  muted: boolean;
  liked: boolean;
  likeBusy: boolean;
  likeCount: number;
  failedVideo: boolean;
  onToggleLike: () => void;
  onToggleMuted: () => void;
  onOpenSalon: () => void;
  onVideoError: () => void;
};

function FeedSlide({
  item,
  height,
  isActive,
  muted,
  liked,
  likeBusy,
  likeCount,
  failedVideo,
  onToggleLike,
  onToggleMuted,
  onOpenSalon,
  onVideoError,
}: FeedSlideProps) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [fade, item.id]);

  const videoUrl = item.videoUrl?.trim() || "";
  const imageUrl = item.imageUrl?.trim() || item.posterUrl;
  const canPlayVideo = item.mediaType === "video" && Boolean(videoUrl) && !failedVideo;
  const isWeb = Platform.OS === "web";
  const videoStyle = isWeb ? [styles.frameMedia, styles.webContain] : styles.frameMedia;

  return (
    <Animated.View style={[styles.slide, { height, opacity: fade }]}>
      <View style={styles.stage}>
        <Image source={{ uri: item.posterUrl }} style={styles.mediaBackdrop} contentFit="cover" transition={220} />
        <View style={styles.mediaBackdropShade} />

        <View style={styles.frameWrap}>
          <View style={[styles.mediaFrame, canPlayVideo ? styles.videoFrame : styles.photoFrame]}>
            {canPlayVideo ? (
              <Video
                source={{ uri: videoUrl }}
                style={videoStyle}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={isActive}
                isLooping
                isMuted={muted}
                volume={muted ? 0 : 1}
                progressUpdateIntervalMillis={120}
                onError={onVideoError}
              />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.frameMedia} contentFit="cover" transition={220} />
            ) : null}
          </View>
        </View>
      </View>

      <LinearGradient
        colors={["rgba(5,8,12,0.02)", "rgba(5,8,12,0.14)", "rgba(5,8,12,0.72)"]}
        locations={[0.35, 0.58, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={styles.actionsRail}>
        <Pressable onPress={onToggleLike} style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={28} color={liked ? COLORS.accent : "#ffffff"} />
          <Text style={styles.iconLabel}>{likeBusy ? "..." : String(likeCount)}</Text>
        </Pressable>

        <Pressable
          onPress={canPlayVideo ? onToggleMuted : onOpenSalon}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconPressed]}
        >
          <Ionicons
            name={canPlayVideo ? (muted ? "volume-mute-outline" : "volume-high-outline") : "sparkles-outline"}
            size={24}
            color="#ffffff"
          />
          <Text style={styles.iconLabel}>{canPlayVideo ? (muted ? "Stil" : "Geluid") : "Salon"}</Text>
        </Pressable>
      </View>

      <View style={styles.overlay}>
        <View style={styles.copyWrap}>
          <Text style={styles.categoryLabel}>{item.categoryLabel}</Text>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              {item.companyLogoUrl ? (
                <Image source={{ uri: item.companyLogoUrl }} style={styles.brandLogo} contentFit="cover" />
              ) : (
                <Ionicons name="business-outline" size={15} color="#ffffff" />
              )}
            </View>
            <Text style={styles.salonName} numberOfLines={1}>
              {item.companyName}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.caption} numberOfLines={3}>
            {item.caption}
          </Text>
        </View>

        <Pressable onPress={onOpenSalon} style={({ pressed }) => [styles.cta, pressed && styles.iconPressed]}>
          <Text style={styles.ctaText}>Bekijk salon</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

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
  const slideHeight = Math.max(640, height - 76);

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
        if (nextRole) setRole(nextRole);
      })
      .catch(() => {
        setRole("customer");
      });
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchMarketplaceFeed(10)
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

    if (!uid) {
      return () => {
        cancelled = true;
      };
    }

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

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 82 }), []);

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

  return (
    <MarketplaceShell active="feed" scroll={false} fullBleed>
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />

      <View style={styles.screen}>
        {loading ? (
          <View style={[styles.slide, { height: slideHeight }]} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <FeedSlide
                item={item}
                height={slideHeight}
                isActive={activeId === item.id}
                muted={muted}
                liked={Boolean(likedMap[item.id])}
                likeBusy={Boolean(likeBusyMap[item.id])}
                likeCount={likeCountMap[item.id] ?? 0}
                failedVideo={Boolean(failedVideoMap[item.id])}
                onToggleLike={() => onToggleLike(item).catch(() => null)}
                onToggleMuted={() => setMuted((current) => !current)}
                onOpenSalon={() => router.push(`/salon/${item.companySlug}` as never)}
                onVideoError={() => {
                  setFailedVideoMap((prev) => ({ ...prev, [item.id]: true }));
                }}
              />
            )}
            pagingEnabled
            snapToInterval={slideHeight}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
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
    backgroundColor: "#06080c",
  },
  slide: {
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "#06080c",
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#06080c",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mediaBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaBackdropShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  frameWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaFrame: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "100%",
    backgroundColor: "#06080c",
    overflow: "hidden",
  },
  videoFrame: {
    aspectRatio: 9 / 16,
  },
  photoFrame: {
    aspectRatio: 4 / 5,
  },
  frameMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#06080c",
  },
  webContain: {
    objectFit: "contain",
  },
  actionsRail: {
    position: "absolute",
    right: 18,
    bottom: 134,
    zIndex: 3,
    alignItems: "center",
    gap: 18,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  iconPressed: {
    transform: [{ scale: 0.98 }],
  },
  iconLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  overlay: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingRight: 92,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    zIndex: 2,
  },
  copyWrap: {
    flex: 1,
    gap: 7,
  },
  categoryLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandLogo: {
    width: "100%",
    height: "100%",
  },
  salonName: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  caption: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 560,
  },
  cta: {
    minHeight: 54,
    paddingHorizontal: 18,
    borderRadius: 27,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
});
