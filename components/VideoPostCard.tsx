import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { FeedPost } from "../lib/feedRepo";
import { buildCloudinaryEditedUrl } from "../lib/mediaEdit";

type VideoPostCardProps = {
  post: FeedPost;
  isActive: boolean;
  onOpenCompany: () => void;
  onOpenLinkedService?: () => void;
  height: number;
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
  following?: boolean;
  followerCount?: number;
  likeBusy?: boolean;
  followBusy?: boolean;
  onToggleLike?: () => void;
  onToggleFollow?: () => void;
  onOpenComments?: () => void;
};

let globalWebMuted = true;

// Cloudinary “safe playback” step
const CLOUDINARY_TRANSCODE_STEP = "f_mp4,vc_h264,ac_aac,q_auto,a_auto";

function normalizeCloudinaryVideoPlaybackUrl(rawUrl: string): string {
  const source = String(rawUrl ?? "").trim();
  if (!source) return "";
  if (!source.includes("/upload/")) return source;

  // Alleen doen als het echt video is
  const isVideoUrl = source.includes("/video/upload/") || /\.(mp4|mov|m4v|webm|avi)(\?|$)/i.test(source);
  if (!isVideoUrl) return source;

  const [rawPath, rawQuery = ""] = source.split("?");
  const marker = "/upload/";
  const markerIndex = rawPath.indexOf(marker);
  if (markerIndex < 0) return source;

  const basePath = rawPath.slice(0, markerIndex + marker.length);
  const suffixPath = rawPath.slice(markerIndex + marker.length);

  // Als er al transforms zitten, niet opnieuw injecten
  const firstSegment = suffixPath.split("/")[0] || "";
  const alreadyHasTransforms = firstSegment.includes(",");
  if (alreadyHasTransforms) return source;

  const nextPath = `${basePath}${CLOUDINARY_TRANSCODE_STEP}/${suffixPath}`;
  return rawQuery ? `${nextPath}?${rawQuery}` : nextPath;
}

function buildVideoCandidates(post: FeedPost): string[] {
  const rawVideo = String(post.videoUrl ?? "").trim();
  const rawSourceVideo = String(post.sourceVideoUrl ?? "").trim();

  // Edited url alleen op source, maar dit kan ook de oorzaak zijn van zoom als transforms fout zijn
  const editedFromSource = rawSourceVideo
    ? buildCloudinaryEditedUrl(rawSourceVideo, {
        cropPreset: post.cropPreset,
        filterPreset: post.filterPreset,
      })
    : "";

  // BELANGRIJK:
  // Zet originele source vóór edited. Zo behoud je oorspronkelijke framing.
  const candidates = [
    rawSourceVideo,
    rawVideo,
    normalizeCloudinaryVideoPlaybackUrl(rawSourceVideo),
    normalizeCloudinaryVideoPlaybackUrl(rawVideo),
    editedFromSource,
    normalizeCloudinaryVideoPlaybackUrl(editedFromSource),
  ].filter(Boolean);

  const unique: string[] = [];
  for (const c of candidates) {
    if (!unique.includes(c)) unique.push(c);
  }
  return unique;
}

export default function VideoPostCard(props: VideoPostCardProps) {
  const {
    post,
    isActive,
    onOpenCompany,
    onOpenLinkedService,
    height,
    liked,
    likeCount,
    commentCount,
    following,
    followerCount,
    likeBusy,
    followBusy,
    onToggleLike,
    onToggleFollow,
    onOpenComments,
  } = props;

  const ref = useRef<Video | null>(null);

  const isWeb = Platform.OS === "web";
  const mediaType = post.mediaType === "image" ? "image" : "video";

  const videoCandidates = useMemo(() => buildVideoCandidates(post), [post]);
  const canPlayVideo = mediaType === "video" && videoCandidates.length > 0;

  const [videoSourceIndex, setVideoSourceIndex] = useState(0);
  const activeVideoUrl = canPlayVideo ? videoCandidates[Math.min(videoSourceIndex, videoCandidates.length - 1)] : "";

  const [muted, setMuted] = useState(isWeb ? globalWebMuted : false);
  const [videoReady, setVideoReady] = useState(false);

  const imageUri = String(post.imageUrl || post.thumbnailUrl || "").trim();

  const clipStartMs = Math.max(0, Math.round(Number(post.clipStartSec ?? 0) * 1000));
  const clipEndMs = Math.max(0, Math.round(Number(post.clipEndSec ?? 0) * 1000));
  const hasClipWindow = clipEndMs > clipStartMs + 250;

  const linkedServiceId = typeof post.serviceId === "string" ? post.serviceId.trim() : "";
  const hasLinkedService = Boolean(linkedServiceId && onOpenLinkedService);
  const linkedServiceName = typeof post.serviceName === "string" ? post.serviceName.trim() : "";

  const influencerName = typeof post.influencerName === "string" ? post.influencerName.trim() : "";
  const isInfluencerPost = post.creatorRole === "influencer" && Boolean(influencerName);

  // Web snap
  const webSnapStyle: any = isWeb ? { scrollSnapAlign: "start", scrollSnapStop: "always" } : undefined;

  // Video style: altijd full container, contain gedrag via resizeMode + (web) objectFit
  const videoStyle: any = useMemo(() => {
    if (isWeb) return { ...StyleSheet.absoluteFillObject, objectFit: "contain" as any };
    return StyleSheet.absoluteFillObject;
  }, [isWeb]);

  useEffect(() => {
    setVideoSourceIndex(0);
    setVideoReady(false);
  }, [post.id]);

  useEffect(() => {
    if (!isWeb) return;
    setMuted(globalWebMuted);
  }, [isWeb, post.id]);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (!isActive || !hasClipWindow) return;

      if (status.positionMillis >= clipEndMs - 80) {
        ref.current?.setPositionAsync(clipStartMs).then(() => ref.current?.playAsync()).catch(() => null);
      }
    },
    [isActive, hasClipWindow, clipStartMs, clipEndMs]
  );

  const onVideoError = useCallback(() => {
    setVideoReady(false);
    setVideoSourceIndex((prev) => {
      const next = prev + 1;
      if (next >= videoCandidates.length) return prev;
      return next;
    });
  }, [videoCandidates.length]);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;

    if (isActive && canPlayVideo && activeVideoUrl) {
      const start = hasClipWindow ? clipStartMs : 0;
      player
        .setPositionAsync(start)
        .then(() => player.playAsync())
        .catch(() => null);
    } else {
      player.pauseAsync().catch(() => null);
    }
  }, [isActive, canPlayVideo, activeVideoUrl, hasClipWindow, clipStartMs]);

  async function onToggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (isWeb) globalWebMuted = nextMuted;
    if (!nextMuted && isActive && canPlayVideo && activeVideoUrl) {
      await ref.current?.playAsync().catch(() => null);
    }
  }

  useEffect(() => {
    const player = ref.current;
    return () => {
      player?.pauseAsync().catch(() => null);
      player?.unloadAsync().catch(() => null);
    };
  }, []);

  if (!canPlayVideo && !imageUri) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Media ontbreekt</Text>
          <Text style={styles.fallbackText}>Deze post heeft nog geen geldige media.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }, webSnapStyle]}>
      {/* Fallback afbeelding zolang video nog niet ready is */}
      {imageUri && (mediaType === "image" || !videoReady) ? (
        <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} contentFit="contain" />
      ) : null}

      {canPlayVideo && activeVideoUrl ? (
        <Video
          ref={ref}
          source={{ uri: activeVideoUrl }}
          style={videoStyle}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={isActive}
          isLooping={!hasClipWindow} // clip-window loop je zelf
          isMuted={muted}
          volume={muted ? 0 : 1}
          progressUpdateIntervalMillis={90}
          onLoadStart={() => setVideoReady(false)}
          onReadyForDisplay={() => setVideoReady(true)}
          onError={onVideoError}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      ) : null}

      {canPlayVideo && !videoReady && imageUri ? <View style={styles.mediaShade} /> : null}

      {canPlayVideo && isWeb && muted ? (
        <Pressable style={styles.tapForSound} onPress={() => onToggleMute().catch(() => null)}>
          <Ionicons name="volume-high-outline" size={14} color="#fff" />
          <Text style={styles.tapForSoundText}>Tik voor geluid</Text>
        </Pressable>
      ) : null}

      <View style={styles.overlay}>
        <View style={styles.meta}>
          <View style={styles.companyRow}>
            <View style={styles.companyIcon}>
              {post.companyLogoUrl ? (
                <Image source={{ uri: post.companyLogoUrl }} style={styles.companyLogoImg} contentFit="cover" />
              ) : (
                <Ionicons name="business-outline" size={13} color="#fff" />
              )}
            </View>
            <Text style={styles.company}>{post.companyName}</Text>
          </View>

          {isInfluencerPost ? (
            <View style={styles.influencerPill}>
              <Ionicons name="megaphone-outline" size={12} color="#fff" />
              <Text style={styles.influencerPillText}>Creator: {influencerName}</Text>
            </View>
          ) : null}

          <View style={styles.categoryPill}>
            <Text style={styles.category}>{post.category}</Text>
          </View>

          {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}

          {post.hashtags?.length ? (
            <Text style={styles.hashtags} numberOfLines={2}>
              {post.hashtags.map((tag) => `#${tag}`).join(" ")}
            </Text>
          ) : null}

          <Pressable
            style={[styles.followBtn, following && styles.followBtnActive, followBusy && styles.touchBusy]}
            onPress={onToggleFollow}
            disabled={followBusy}
          >
            {followBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name={following ? "checkmark-circle-outline" : "add-circle-outline"} size={14} color="#fff" />
            )}
            <Text style={styles.followText}>
              {following ? "Volgend" : "Volgen"} · {followerCount ?? 0}
            </Text>
          </Pressable>

          <View style={styles.ctaRow}>
            {hasLinkedService ? (
              <Pressable style={styles.bookServiceBtn} onPress={onOpenLinkedService}>
                <Ionicons name="calendar-clear-outline" size={15} color="#fff" />
                <View style={styles.bookServiceTextWrap}>
                  <Text style={styles.bookServiceTitle}>Boek deze dienst</Text>
                  {linkedServiceName ? (
                    <Text style={styles.bookServiceMeta} numberOfLines={1}>
                      {linkedServiceName}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
              </Pressable>
            ) : null}

            <Pressable style={styles.cta} onPress={onOpenCompany}>
              <Text style={styles.ctaText}>Bekijk salon</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sideActions}>
          {canPlayVideo ? (
            <View style={styles.actionItem}>
              <Pressable style={[styles.iconBtn, !muted && styles.iconBtnActive]} onPress={() => onToggleMute().catch(() => null)}>
                <Ionicons name={muted ? "volume-mute-outline" : "volume-high-outline"} size={21} color="#fff" />
              </Pressable>
              <Text style={styles.iconCount}>{muted ? "Geluid uit" : "Geluid aan"}</Text>
            </View>
          ) : null}

          <View style={styles.actionItem}>
            <Pressable
              style={[styles.iconBtn, liked && styles.iconBtnActive, likeBusy && styles.touchBusy]}
              onPress={onToggleLike}
              disabled={likeBusy}
            >
              {likeBusy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={liked ? "heart" : "heart-outline"} size={22} color="#fff" />}
            </Pressable>
            <Text style={styles.iconCount}>{likeCount ?? 0}</Text>
          </View>

          <View style={styles.actionItem}>
            <Pressable style={styles.iconBtn} onPress={onOpenComments}>
              <Ionicons name="chatbubble-outline" size={21} color="#fff" />
            </Pressable>
            <Text style={styles.iconCount}>{commentCount ?? 0}</Text>
          </View>

          <View style={styles.actionItem}>
            <Pressable style={styles.iconBtn}>
              <Ionicons name="share-social-outline" size={21} color="#fff" />
            </Pressable>
            <Text style={styles.iconCount}>Delen</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", backgroundColor: "#000" },
  overlay: { flex: 1, justifyContent: "flex-end", flexDirection: "row", padding: 16, backgroundColor: "rgba(0,0,0,0.22)" },
  mediaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.2)" },
  tapForSound: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  tapForSoundText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  meta: { flex: 1, justifyContent: "flex-end", gap: 6 },

  companyRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  companyIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    overflow: "hidden",
  },
  companyLogoImg: { width: "100%", height: "100%" },
  company: { color: "#fff", fontWeight: "800", fontSize: 19 },

  categoryPill: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  category: { color: "#fff", fontWeight: "700", fontSize: 12 },

  influencerPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(82,132,255,0.32)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  influencerPillText: { color: "#fff", fontWeight: "800", fontSize: 11 },

  caption: { color: "#fff", lineHeight: 20 },
  hashtags: { color: "#f8d2e8", fontWeight: "700", fontSize: 12 },

  cta: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  ctaRow: { marginTop: 8, gap: 8, alignSelf: "stretch", width: "100%", maxWidth: 330 },

  bookServiceBtn: {
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: "rgba(223,79,154,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  bookServiceTextWrap: { gap: 0 },
  bookServiceTitle: { color: "#fff", fontSize: 12, fontWeight: "900" },
  bookServiceMeta: { color: "rgba(255,255,255,0.88)", fontSize: 10, fontWeight: "700", maxWidth: 172 },

  followBtn: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(223,79,154,0.9)", borderRadius: 11, paddingHorizontal: 10, paddingVertical: 6, marginTop: 4 },
  followBtnActive: { backgroundColor: "rgba(72,159,86,0.9)" },
  followText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  sideActions: { justifyContent: "flex-end", alignItems: "center", gap: 12, marginLeft: 12, marginBottom: 12 },
  actionItem: { alignItems: "center", gap: 4 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" },
  iconBtnActive: { backgroundColor: "rgba(223,79,154,0.5)" },
  iconCount: { color: "#fff", fontSize: 11, fontWeight: "700" },
  touchBusy: { opacity: 0.75 },

  fallback: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#191919", padding: 24 },
  fallbackTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  fallbackText: { color: "#d3d3d3", marginTop: 8, textAlign: "center" },
});