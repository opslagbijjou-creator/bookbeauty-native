import React from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { CompanyService } from "../lib/serviceRepo";
import { COLORS } from "../lib/ui";

type ServicesListProps = {
  items: CompanyService[];
  onEdit: (service: CompanyService) => void;
  onDelete: (service: CompanyService) => void;
  onToggleActive: (service: CompanyService, next: boolean) => void;
  loading?: boolean;
  emptyText?: string;
};

export default function ServicesList({
  items,
  onEdit,
  onDelete,
  onToggleActive,
  loading,
  emptyText = "Nog geen diensten toegevoegd.",
}: ServicesListProps) {
  function renderGalleryPhoto(photoUrl: string, index: number) {
    return (
      <View key={`${photoUrl}-${index}`} style={styles.galleryThumbWrap}>
        <Image source={{ uri: photoUrl }} style={styles.galleryThumb} contentFit="cover" />
      </View>
    );
  }

  function renderGalleryPlaceholder(key: string) {
    return (
      <View key={key} style={[styles.galleryThumbWrap, styles.galleryPlaceholder]}>
        <Ionicons name="add-outline" size={14} color={COLORS.muted} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        const photos = item.photoUrls ?? [];
        const thumbnail = photos[0] ?? "";
        const placeholders = Array.from({ length: Math.max(0, 3 - photos.length) });

        return (
          <View style={styles.card}>
            <Pressable style={styles.cardPressArea} onPress={() => onEdit(item)}>
              <View style={styles.thumbWrap}>
                {thumbnail ? (
                  <Image source={{ uri: thumbnail }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]}>
                    <Ionicons name="image-outline" size={16} color={COLORS.muted} />
                  </View>
                )}
              </View>

              <View style={styles.contentCol}>
                <View style={styles.topRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={[styles.statusPill, item.isActive ? styles.statusLive : styles.statusOff]}>
                    <Text style={styles.statusText}>{item.isActive ? "LIVE" : "VERBORGEN"}</Text>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Ionicons name="time-outline" size={12} color={COLORS.primary} />
                    <Text style={styles.metaPillText}>{item.durationMin} min</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Ionicons name="cash-outline" size={12} color={COLORS.primary} />
                    <Text style={styles.metaPillText}>EUR {item.price}</Text>
                  </View>
                </View>

                <Text style={styles.subMeta} numberOfLines={1}>
                  {item.category} • {photos.length}/3 foto&apos;s
                </Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <View style={styles.galleryRow}>
              {photos.slice(0, 3).map((url, index) => renderGalleryPhoto(url, index))}
              {placeholders.map((_, index) => renderGalleryPlaceholder(`placeholder-${item.id}-${index}`))}
            </View>

            <View style={styles.actionRow}>
              <View style={styles.actionLeft}>
                <Pressable style={styles.editBtn} onPress={() => onEdit(item)}>
                  <Ionicons name="images-outline" size={13} color={COLORS.primary} />
                  <Text style={styles.editText}>{photos.length ? "Bewerk dienst" : "Voeg foto&apos;s toe"}</Text>
                </Pressable>
              </View>

              <View style={styles.actionRight}>
                <View style={styles.switchWrap}>
                  <Text style={styles.switchLabel}>Live</Text>
                  <Switch
                    value={item.isActive}
                    onValueChange={(next) => onToggleActive(item, next)}
                    disabled={Boolean(loading)}
                  />
                </View>
                <Pressable style={styles.deleteBtn} onPress={() => onDelete(item)} disabled={Boolean(loading)}>
                  <Ionicons name="trash-outline" size={13} color={COLORS.danger} />
                </Pressable>
              </View>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    gap: 12,
    paddingBottom: 20,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardPressArea: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  thumbWrap: {
    width: 96,
    height: 96,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  contentCol: {
    flex: 1,
    gap: 6,
    minHeight: 92,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusLive: {
    backgroundColor: "#ddf2e5",
  },
  statusOff: {
    backgroundColor: "#ffe8ef",
  },
  statusText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "900",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  metaPillText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  subMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  description: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  galleryRow: {
    flexDirection: "row",
    gap: 8,
  },
  galleryThumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: "hidden",
  },
  galleryThumb: {
    width: "100%",
    height: "100%",
  },
  galleryPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  actionLeft: {
    flex: 1,
  },
  actionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editBtn: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  editText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  switchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 6,
  },
  switchLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f3c7d6",
    backgroundColor: "#fff1f6",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
});
