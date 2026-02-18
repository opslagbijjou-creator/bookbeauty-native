import React, { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import { Image } from "expo-image";
import { FeedPost } from "../lib/feedRepo";

type VideoPostCardProps = {
  post: FeedPost;
  isActive: boolean;
  onOpenCompany: () => void;
  height: number;
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
  following?: boolean;
  followerCount?: number;
  onToggleLike?: () => void;
  onToggleFollow?: () => void;
  onOpenComments?: () => void;
};

export default function VideoPostCard({
  post,
  isActive,
  onOpenCompany,
  height,
  liked,
  likeCount,
  commentCount,
  following,
  followerCount,
  onToggleLike,
  onToggleFollow,
  onOpenComments,
}: VideoPostCardProps) {
  const ref = useRef<Video | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    if (isActive && post.videoUrl) {
      video.playAsync().catch(() => null);
    } else {
      video.pauseAsync().catch(() => null);
    }
  }, [isActive, post.videoUrl]);

  useEffect(() => {
    const video = ref.current;
    return () => {
      if (!video) return;
      video.pauseAsync().catch(() => null);
      video.unloadAsync().catch(() => null);
    };
  }, []);

  if (!post.videoUrl) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Video ontbreekt</Text>
          <Text style={styles.fallbackText}>Deze post heeft nog geen geldige videoUrl.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <Video
        ref={ref}
        source={{ uri: post.videoUrl }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        shouldPlay={isActive}
        isLooping
        isMuted={false}
      />

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
          <View style={styles.categoryPill}>
            <Text style={styles.category}>{post.category}</Text>
          </View>
          {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
          {post.hashtags?.length ? (
            <Text style={styles.hashtags} numberOfLines={2}>
              {post.hashtags.map((tag) => `#${tag}`).join(" ")}
            </Text>
          ) : null}
          <Pressable style={[styles.followBtn, following && styles.followBtnActive]} onPress={onToggleFollow}>
            <Ionicons name={following ? "checkmark-circle-outline" : "add-circle-outline"} size={14} color="#fff" />
            <Text style={styles.followText}>
              {following ? "Volgend" : "Volgen"} · {followerCount ?? 0}
            </Text>
          </Pressable>
          <Pressable style={styles.cta} onPress={onOpenCompany}>
            <Text style={styles.ctaText}>Bekijk salon</Text>
          </Pressable>
        </View>

        <View style={styles.sideActions}>
          <View style={styles.actionItem}>
            <Pressable style={[styles.iconBtn, liked && styles.iconBtnActive]} onPress={onToggleLike}>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={22} color="#fff" />
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
  container: {
    width: "100%",
    backgroundColor: "#000",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    flexDirection: "row",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  meta: {
    flex: 1,
    justifyContent: "flex-end",
    gap: 6,
  },
  companyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
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
  companyLogoImg: {
    width: "100%",
    height: "100%",
  },
  company: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 19,
  },
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  category: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  caption: {
    color: "#fff",
    lineHeight: 20,
  },
  hashtags: {
    color: "#f8d2e8",
    fontWeight: "700",
    fontSize: 12,
  },
  cta: {
    alignSelf: "flex-start",
    backgroundColor: "#df4f9a",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 8,
  },
  ctaText: {
    color: "#fff",
    fontWeight: "700",
  },
  followBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(223,79,154,0.9)",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  followBtnActive: {
    backgroundColor: "rgba(72,159,86,0.9)",
  },
  followText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  sideActions: {
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 12,
    marginLeft: 12,
    marginBottom: 12,
  },
  actionItem: {
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  iconBtnActive: {
    backgroundColor: "rgba(223,79,154,0.5)",
  },
  iconCount: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#191919",
    padding: 24,
  },
  fallbackTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  fallbackText: {
    color: "#d3d3d3",
    marginTop: 8,
    textAlign: "center",
  },
});
