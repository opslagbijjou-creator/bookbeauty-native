import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import type { PickedMedia } from "../lib/mediaRepo";
import { COLORS } from "../lib/ui";

export type PickedLibraryMedia = PickedMedia & {
  kind: "image" | "video";
};

type MediaLibraryPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  onPick: (media: PickedLibraryMedia) => void;
};

const PAGE_SIZE = 60;

function normalizeDurationSec(raw?: number): number {
  if (!raw || !Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1000 ? raw / 1000 : raw;
}

function formatVideoDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function detectMediaKind(asset: MediaLibrary.Asset): "image" | "video" {
  const raw = String((asset as { mediaType?: unknown }).mediaType ?? "").toLowerCase();
  if (raw.includes("video")) return "video";
  if ((asset as { mediaType?: unknown }).mediaType === MediaLibrary.MediaType.video) return "video";
  return "image";
}

function mimeTypeFromFileName(fileName: string, kind: "image" | "video"): string {
  const lower = fileName.toLowerCase();
  if (kind === "video") {
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".webm")) return "video/webm";
    return "video/mp4";
  }
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export default function MediaLibraryPickerModal({
  visible,
  onClose,
  onPick,
}: MediaLibraryPickerModalProps) {
  const [items, setItems] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setItems(result.assets);
      setCursor(result.endCursor ?? null);
      setHasNextPage(result.hasNextPage);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || loadingMore || !cursor) return;
    setLoadingMore(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: PAGE_SIZE,
        after: cursor,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      setItems((prev) => [...prev, ...result.assets]);
      setCursor(result.endCursor ?? null);
      setHasNextPage(result.hasNextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [hasNextPage, loadingMore, cursor]);

  useEffect(() => {
    if (!visible) return;
    loadFirstPage().catch(() => null);
  }, [visible, loadFirstPage]);

  async function onSelectAsset(asset: MediaLibrary.Asset) {
    if (busyId) return;
    setBusyId(asset.id);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      const kind = detectMediaKind(asset);
      const fileName =
        asset.filename ??
        `${asset.id}.${kind === "video" ? "mp4" : "jpg"}`;
      const durationSec = normalizeDurationSec(
        typeof asset.duration === "number" ? asset.duration : undefined
      );
      const localUri = info.localUri || asset.uri;
      onPick({
        kind,
        uri: localUri,
        fileName,
        mimeType: mimeTypeFromFileName(fileName, kind),
        durationMs: kind === "video" && durationSec > 0 ? Math.round(durationSec * 1000) : null,
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Ionicons name="images-outline" size={18} color={COLORS.primary} />
              <Text style={styles.title}>Kies uit je galerij</Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={16} color={COLORS.muted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              numColumns={3}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              onEndReachedThreshold={0.4}
              onEndReached={loadMore}
              renderItem={({ item }) => {
                const kind = detectMediaKind(item);
                const busy = busyId === item.id;
                const durationSec = normalizeDurationSec(
                  typeof item.duration === "number" ? item.duration : undefined
                );

                return (
                  <Pressable
                    style={[styles.thumbWrap, busy && styles.thumbBusy]}
                    onPress={() => onSelectAsset(item).catch(() => null)}
                    disabled={Boolean(busyId)}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
                    <View style={styles.thumbOverlay}>
                      {kind === "video" ? (
                        <View style={styles.videoBadge}>
                          <Ionicons name="videocam-outline" size={11} color="#fff" />
                          <Text style={styles.videoBadgeText}>
                            {durationSec > 0 ? formatVideoDuration(durationSec) : "video"}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.imageBadge}>
                          <Ionicons name="image-outline" size={11} color="#fff" />
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              }}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={COLORS.primary} size="small" />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.stateWrap}>
                  <Text style={styles.emptyText}>Geen media gevonden.</Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    paddingBottom: 20,
    gap: 8,
  },
  gridRow: {
    gap: 8,
  },
  thumbWrap: {
    flex: 1,
    aspectRatio: 0.8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  thumbBusy: {
    opacity: 0.6,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbOverlay: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  videoBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  videoBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  imageBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  stateWrap: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  footer: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
