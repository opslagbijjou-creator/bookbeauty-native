import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { getUserRole, subscribeAuth } from "../lib/authRepo";
import { auth } from "../lib/firebase";
import {
  MarketplaceFeedItem,
  buildCanonicalUrl,
  buildFeedSeo,
  fetchMarketplaceFeed,
  getFeedPostPath,
} from "../lib/marketplace";
import type { AppRole } from "../lib/roles";
import { getPostLikeCount, isPostLiked, togglePostLike } from "../lib/socialRepo";
import { COLORS } from "../lib/ui";

type FeedSlideProps = {
  item: MarketplaceFeedItem;
  height: number;
  viewportWidth: number;
  isActive: boolean;
  muted: boolean;
  liked: boolean;
  saved: boolean;
  likeBusy: boolean;
  likeCount: number;
  failedVideo: boolean;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onToggleMuted: () => void;
  onShare: () => void;
  onOpenSalon: () => void;
  onVideoError: () => void;
};

function FeedSlide({
  item,
  height,
  viewportWidth,
  isActive,
  muted,
  liked,
  saved,
  likeBusy,
  likeCount,
  failedVideo,
  onToggleLike,
  onToggleSave,
  onToggleMuted,
  onShare,
  onOpenSalon,
  onVideoError,
}: FeedSlideProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<Video | null>(null);
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoSourceIndex, setVideoSourceIndex] = useState(0);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fade, item.id]);

  const videoSources = item.videoSources?.length ? item.videoSources : item.videoUrl ? [item.videoUrl] : [];
  const videoUrl = videoSources[Math.min(videoSourceIndex, Math.max(0, videoSources.length - 1))]?.trim() || "";
  const imageUrl = item.imageUrl?.trim() || item.posterUrl;
  const canPlayVideo = item.mediaType === "video" && Boolean(videoUrl) && !failedVideo;
  const usesVideoFrame = item.mediaType === "video";
  const isWeb = Platform.OS === "web";
  const videoStyle = isWeb ? [styles.absoluteMedia, styles.webContain] : styles.absoluteMedia;
  const compact = viewportWidth < 768;
  const wide = viewportWidth >= 1180;
  const actionPrimarySize = compact ? 24 : 28;
  const actionSecondarySize = compact ? 22 : 24;
  const reservedBottom = compact ? 212 : 152;
  const reservedTop = compact ? 18 : 28;
  const availableFrameHeight = Math.max(260, height - reservedBottom - reservedTop);
  const rightRailAllowance = compact ? 24 : 132;
  const horizontalPadding = compact ? 24 : 56;
  const availableFrameWidth = Math.max(220, viewportWidth - horizontalPadding - rightRailAllowance);
  const targetAspectRatio = usesVideoFrame ? 9 / 16 : 4 / 5;
  const widthFromHeight = availableFrameHeight * targetAspectRatio;
  const frameWidth = Math.min(wide ? 720 : 680, availableFrameWidth, widthFromHeight);
  const frameHeight = Math.min(availableFrameHeight, frameWidth / targetAspectRatio);

  useEffect(() => {
    setVideoSourceIndex(0);
    setVideoReady(false);
    setIsBuffering(false);
    setProgress(0);
  }, [item.id]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsBuffering(false);
      return;
    }

    setIsBuffering(Boolean(status.isBuffering));

    const duration = Number(status.durationMillis ?? 0);
    if (duration > 0) {
      setProgress(Math.max(0, Math.min(1, status.positionMillis / duration)));
    }
  }, []);

  useEffect(() => {
    if (!canPlayVideo) return;

    if (isWeb) {
      const webVideo = webVideoRef.current;
      if (!webVideo) return;

      if (isActive) {
        webVideo.play().catch(() => null);
        return;
      }

      webVideo.pause();
      try {
        webVideo.currentTime = 0;
      } catch {
        // noop
      }
      setProgress(0);
      return;
    }

    const nativeVideo = videoRef.current;
    if (!nativeVideo) return;

    if (isActive) {
      nativeVideo.playAsync().catch(() => null);
      return;
    }

    nativeVideo
      .pauseAsync()
      .then(() => nativeVideo.setPositionAsync(0))
      .catch(() => null);
    setProgress(0);
  }, [isActive, canPlayVideo, isWeb, item.id, videoUrl]);

  useEffect(() => {
    const webVideo = webVideoRef.current;
    const nativeVideo = videoRef.current;
    return () => {
      if (webVideo) {
        webVideo.pause();
        webVideo.removeAttribute("src");
        webVideo.load();
      }

      if (!nativeVideo) return;
      nativeVideo.pauseAsync().catch(() => null);
      nativeVideo.unloadAsync().catch(() => null);
    };
  }, [isWeb]);

  return (
    <Animated.View style={[styles.slide, { height, opacity: fade }]}>
      <View style={styles.stage}>
        {!compact ? (
          <Image source={{ uri: item.posterUrl }} style={styles.mediaBackdrop} contentFit="cover" transition={180} />
        ) : null}
        <View style={styles.mediaBackdropShade} />

        <View style={styles.frameWrap}>
          <View
            style={[
              styles.mediaFrame,
              {
                width: frameWidth,
                height: frameHeight,
              },
            ]}
          >
            {canPlayVideo ? (
              <>
                <Image
                  source={{ uri: item.posterUrl }}
                  style={styles.absoluteMedia}
                  contentFit="contain"
                  transition={0}
                />
                {isWeb ? (
                  <video
                    ref={(node) => {
                      webVideoRef.current = node;
                    }}
                    src={videoUrl}
                    muted={muted}
                    loop
                    playsInline
                    autoPlay={isActive}
                    preload="metadata"
                    style={styles.webVideoElement as any}
                    onLoadStart={() => {
                      setVideoReady(false);
                      setIsBuffering(true);
                    }}
                    onCanPlay={() => {
                      setVideoReady(true);
                      setIsBuffering(false);
                      if (isActive) {
                        webVideoRef.current?.play().catch(() => null);
                      }
                    }}
                    onWaiting={() => {
                      setIsBuffering(true);
                    }}
                    onPlaying={() => {
                      setIsBuffering(false);
                    }}
                    onTimeUpdate={() => {
                      const player = webVideoRef.current;
                      if (!player) return;
                      const duration = Number(player.duration || 0);
                      if (duration > 0) {
                        setProgress(Math.max(0, Math.min(1, player.currentTime / duration)));
                      }
                    }}
                    onError={() => {
                      setVideoReady(false);
                      setIsBuffering(false);
                      setProgress(0);
                      setVideoSourceIndex((current) => {
                        if (current + 1 < videoSources.length) {
                          return current + 1;
                        }
                        onVideoError();
                        return current;
                      });
                    }}
                  />
                ) : (
                  <Video
                    ref={videoRef}
                    source={{ uri: videoUrl }}
                    style={videoStyle}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                    isLooping
                    isMuted={muted}
                    volume={muted ? 0 : 1}
                    progressUpdateIntervalMillis={100}
                    onLoadStart={() => {
                      setVideoReady(false);
                      setIsBuffering(true);
                    }}
                    onReadyForDisplay={() => {
                      setVideoReady(true);
                      setIsBuffering(false);
                    }}
                    onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                    onError={() => {
                      setVideoReady(false);
                      setIsBuffering(false);
                      setProgress(0);
                      setVideoSourceIndex((current) => {
                        if (current + 1 < videoSources.length) {
                          return current + 1;
                        }
                        onVideoError();
                        return current;
                      });
                    }}
                  />
                )}
              </>
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.absoluteMedia} contentFit="cover" transition={180} />
            ) : null}

            {canPlayVideo && (!videoReady || isBuffering) ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <LinearGradient
        colors={["rgba(5,8,12,0.02)", "rgba(5,8,12,0.12)", "rgba(5,8,12,0.74)"]}
        locations={[0.34, 0.58, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.actionsRail, compact && styles.actionsRailCompact]}>
        <Pressable
          onPress={onToggleLike}
          style={({ pressed }) => [styles.iconButton, compact && styles.iconButtonCompact, pressed && styles.iconPressed]}
        >
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={actionPrimarySize}
            color={liked ? COLORS.accent : "#ffffff"}
          />
          <Text style={[styles.iconLabel, compact && styles.iconLabelCompact]}>{likeBusy ? "..." : String(likeCount)}</Text>
        </Pressable>

        <Pressable
          onPress={onToggleSave}
          style={({ pressed }) => [styles.iconButton, compact && styles.iconButtonCompact, pressed && styles.iconPressed]}
        >
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={actionSecondarySize} color="#ffffff" />
          <Text style={[styles.iconLabel, compact && styles.iconLabelCompact]}>Bewaar</Text>
        </Pressable>

        <Pressable
          onPress={onShare}
          style={({ pressed }) => [styles.iconButton, compact && styles.iconButtonCompact, pressed && styles.iconPressed]}
        >
          <Ionicons name="share-social-outline" size={actionSecondarySize} color="#ffffff" />
          <Text style={[styles.iconLabel, compact && styles.iconLabelCompact]}>Deel</Text>
        </Pressable>

        <Pressable
          onPress={canPlayVideo ? onToggleMuted : onOpenSalon}
          style={({ pressed }) => [styles.iconButton, compact && styles.iconButtonCompact, pressed && styles.iconPressed]}
        >
          <Ionicons
            name={canPlayVideo ? (muted ? "volume-mute-outline" : "volume-high-outline") : "sparkles-outline"}
            size={actionSecondarySize}
            color="#ffffff"
          />
          <Text style={[styles.iconLabel, compact && styles.iconLabelCompact]}>
            {canPlayVideo ? (muted ? "Stil" : "Geluid") : "Salon"}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.overlay, compact && styles.overlayCompact]}>
        <View style={[styles.copyWrap, compact && styles.copyWrapCompact]}>
          <Text style={[styles.categoryLabel, compact && styles.categoryLabelCompact]}>{item.categoryLabel}</Text>
          <View style={styles.brandRow}>
            <View style={styles.brandBadge}>
              {item.companyLogoUrl ? (
                <Image source={{ uri: item.companyLogoUrl }} style={styles.brandLogo} contentFit="cover" />
              ) : (
                <Ionicons name="business-outline" size={15} color="#ffffff" />
              )}
            </View>
            <Text style={[styles.salonName, compact && styles.salonNameCompact]} numberOfLines={1}>
              {item.companyName}
            </Text>
          </View>
          {item.companyCity ? (
            <Text style={[styles.metaLine, compact && styles.metaLineCompact]} numberOfLines={1}>
              {item.companyCity}
            </Text>
          ) : null}
          <Text style={[styles.title, compact && styles.titleCompact, wide && styles.titleWide]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.caption, compact && styles.captionCompact]} numberOfLines={2}>
            {item.caption}
          </Text>
        </View>

        <Pressable
          onPress={onOpenSalon}
          style={({ pressed }) => [styles.cta, compact && styles.ctaCompact, pressed && styles.iconPressed]}
        >
          <Text style={styles.ctaText}>Bekijk salon</Text>
        </Pressable>
      </View>

      {canPlayVideo ? (
        <View style={[styles.progressTrack, compact && styles.progressTrackCompact]}>
          <View style={[styles.progressFill, { width: `${Math.max(4, progress * 100)}%` }]} />
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function PublicFeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ post?: string | string[] }>();
  const { height, width } = useWindowDimensions();
  const seo = buildFeedSeo();
  const [items, setItems] = useState<MarketplaceFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [role, setRole] = useState<AppRole>("customer");
  const [muted, setMuted] = useState(true);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [likeBusyMap, setLikeBusyMap] = useState<Record<string, boolean>>({});
  const [failedVideoMap, setFailedVideoMap] = useState<Record<string, boolean>>({});
  const slideHeight = Math.max(1, height - 76);
  const focusPostId = useMemo(() => {
    const raw = Array.isArray(params.post) ? params.post[0] : params.post;
    const clean = String(raw ?? "").trim();
    return clean || null;
  }, [params.post]);

  useEffect(() => {
    return subscribeAuth((user) => {
      setUid(user?.uid ?? null);
    });
  }, []);

  useEffect(() => {
    if (!uid) {
      setRole("customer");
      setLikedMap({});
      setSavedMap({});
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

    fetchMarketplaceFeed(10, focusPostId)
      .then((result) => {
        if (cancelled) return;
        setItems(result);
        setActiveId(result[0]?.id ?? null);
        setFailedVideoMap({});
        const nextSaved: Record<string, boolean> = {};
        result.forEach((item) => {
          nextSaved[item.id] = false;
        });
        setSavedMap(nextSaved);
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
  }, [focusPostId]);

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
    if (current?.id) {
      setActiveId(current.id);
    }
  }).current;

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 70 }), []);

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

  function onToggleSave(item: MarketplaceFeedItem) {
    if (!uid) {
      router.push("/(auth)/login" as never);
      return;
    }
    setSavedMap((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
  }

  async function onShareItem(item: MarketplaceFeedItem) {
    const url = buildCanonicalUrl(getFeedPostPath(item.id));
    await Share.share({
      message: `${item.companyName} op BookBeauty\nOpen direct deze video:\n${url}`,
      url,
    }).catch(() => null);
  }

  function syncActiveFromOffset(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!items.length || slideHeight <= 0) return;
    const offsetY = event.nativeEvent.contentOffset.y;
    const nextIndex = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / slideHeight)));
    setActiveId(items[nextIndex]?.id ?? null);
  }

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
                viewportWidth={width}
                isActive={activeId === item.id}
                muted={muted}
                liked={Boolean(likedMap[item.id])}
                saved={Boolean(savedMap[item.id])}
                likeBusy={Boolean(likeBusyMap[item.id])}
                likeCount={likeCountMap[item.id] ?? 0}
                failedVideo={Boolean(failedVideoMap[item.id])}
                onToggleLike={() => onToggleLike(item).catch(() => null)}
                onToggleSave={() => onToggleSave(item)}
                onToggleMuted={() => setMuted((current) => !current)}
                onShare={() => onShareItem(item).catch(() => null)}
                onOpenSalon={() => router.push(`/salon/${item.companySlug}` as never)}
                onVideoError={() => {
                  setFailedVideoMap((prev) => ({ ...prev, [item.id]: true }));
                }}
              />
            )}
            pagingEnabled
            snapToInterval={slideHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={2}
            removeClippedSubviews
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onScrollBeginDrag={() => {
              setActiveId(null);
            }}
            onScrollEndDrag={syncActiveFromOffset}
            onMomentumScrollEnd={syncActiveFromOffset}
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
    backgroundColor: "#06080c",
    overflow: "hidden",
  },
  frameMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#06080c",
  },
  absoluteMedia: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#06080c",
  },
  webContain: {
    objectFit: "contain",
  },
  webVideoElement: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#06080c",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  actionsRail: {
    position: "absolute",
    right: 16,
    bottom: 138,
    zIndex: 3,
    alignItems: "center",
    gap: 16,
  },
  actionsRailCompact: {
    left: 18,
    right: 18,
    bottom: 146,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  iconButtonCompact: {
    minWidth: 58,
    gap: 4,
  },
  iconPressed: {
    transform: [{ scale: 0.98 }],
  },
  iconLabel: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  iconLabelCompact: {
    fontSize: 10,
  },
  overlay: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    paddingRight: 90,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    zIndex: 2,
  },
  overlayCompact: {
    paddingHorizontal: 18,
    paddingRight: 18,
    paddingBottom: 56,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-end",
    gap: 14,
  },
  copyWrap: {
    flex: 1,
    gap: 6,
  },
  copyWrapCompact: {
    gap: 4,
  },
  categoryLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  categoryLabelCompact: {
    fontSize: 11,
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
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandLogo: {
    width: "100%",
    height: "100%",
  },
  salonName: {
    flex: 1,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  salonNameCompact: {
    fontSize: 14,
  },
  metaLine: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "600",
  },
  metaLineCompact: {
    fontSize: 11,
  },
  title: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  titleWide: {
    fontSize: 32,
    lineHeight: 36,
  },
  caption: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
  },
  captionCompact: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: undefined,
  },
  cta: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaCompact: {
    width: "100%",
    minHeight: 48,
  },
  ctaText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "900",
  },
  progressTrack: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 8,
    height: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    zIndex: 4,
  },
  progressTrackCompact: {
    left: 12,
    right: 12,
    bottom: 6,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
});
