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
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        const thumbnail = item.photoUrls?.[0] ?? "";

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
                    <Text style={styles.statusText}>{item.isActive ? "LIVE" : "PENDING"}</Text>
                  </View>
                </View>

                <Text style={styles.meta} numberOfLines={1}>
                  {item.durationMin} min • EUR {item.price}
                </Text>
                <Text style={styles.subMeta} numberOfLines={1}>
                  {item.category} • {item.photoUrls?.length ?? 0}/3 foto&apos;s
                </Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            <View style={styles.actionRow}>
              <Pressable style={styles.editBtn} onPress={() => onEdit(item)}>
                <Ionicons name="create-outline" size={13} color={COLORS.primary} />
                <Text style={styles.editText}>Bewerk</Text>
              </Pressable>

              <View style={styles.switchWrap}>
                <Text style={styles.switchLabel}>Toon in feed</Text>
                <Switch value={item.isActive} onValueChange={(next) => onToggleActive(item, next)} />
              </View>

              <Pressable style={styles.deleteBtn} onPress={() => onDelete(item)}>
                <Ionicons name="trash-outline" size={13} color={COLORS.danger} />
                <Text style={styles.deleteText}>Verwijder</Text>
              </Pressable>
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
    gap: 10,
    paddingBottom: 120,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 10,
  },
  cardPressArea: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  thumbWrap: {
    width: 88,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  thumb: {
    width: "100%",
    height: "100%",
    minHeight: 96,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusLive: {
    backgroundColor: "#dff2e5",
  },
  statusOff: {
    backgroundColor: "#ffe8f0",
  },
  statusText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "900",
  },
  meta: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  subMeta: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  description: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  editBtn: {
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  editText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  switchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  switchLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  deleteBtn: {
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#f3c7d6",
    backgroundColor: "#fff1f6",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  deleteText: {
    color: COLORS.danger,
    fontWeight: "800",
    fontSize: 12,
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
