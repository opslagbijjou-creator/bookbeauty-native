import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import AddServiceModal from "../../../components/AddServiceModal";
import CategoryChips from "../../../components/CategoryChips";
import ServicesList from "../../../components/ServicesList";
import {
  CompanyService,
  deleteMyService,
  fetchMyServices,
  updateMyService,
} from "../../../lib/serviceRepo";
import { auth } from "../../../lib/firebase";
import { CATEGORIES, COLORS } from "../../../lib/ui";

const FILTER_CATEGORIES = ["Alles", ...CATEGORIES] as const;

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

export default function CompanyServicesScreen() {
  const uid = auth.currentUser?.uid ?? "";

  const [items, setItems] = useState<CompanyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTER_CATEGORIES)[number]>("Alles");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<CompanyService | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (activeFilter === "Alles") return items;
    return items.filter((item) => item.category === activeFilter);
  }, [items, activeFilter]);

  const activeCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);

  const load = useCallback(async () => {
    if (!uid) return;

    setLoading(true);
    try {
      const data = await fetchMyServices(uid);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  function openCreateModal() {
    setEditingService(null);
    setModalVisible(true);
  }

  function openEditModal(service: CompanyService) {
    setEditingService(service);
    setModalVisible(true);
  }

  async function onToggleActive(service: CompanyService, next: boolean) {
    if (!uid || busyActionId) return;

    setBusyActionId(service.id);
    try {
      await updateMyService(uid, service.id, { isActive: next });
      await load();
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon dienststatus niet aanpassen.");
    } finally {
      setBusyActionId(null);
    }
  }

  function onDelete(service: CompanyService) {
    if (!uid || busyActionId) return;

    Alert.alert("Dienst verwijderen", "Weet je zeker dat je deze dienst wilt verwijderen?", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
          setBusyActionId(service.id);
          try {
            await deleteMyService(uid, service.id);
            if (editingService?.id === service.id) {
              setEditingService(null);
              setModalVisible(false);
            }
            await load();
          } catch (error: any) {
            Alert.alert("Fout", error?.message ?? "Kon dienst niet verwijderen.");
          } finally {
            setBusyActionId(null);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="cut-outline" size={20} color={COLORS.primary} />
          <Text style={styles.title}>Diensten beheren</Text>
        </View>
        <Text style={styles.subtitle}>
          {items.length} diensten totaal • {activeCount} live
        </Text>
        <Text style={styles.helperText}>Tik op een dienst om details en foto&apos;s te bewerken.</Text>
      </View>

      <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Categorieën</Text>
        <CategoryChips
          items={[...FILTER_CATEGORIES]}
          active={activeFilter}
          onChange={(value) => setActiveFilter(value as (typeof FILTER_CATEGORIES)[number])}
          iconMap={categoryIcons}
        />
      </View>

      <View style={styles.listWrap}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <ServicesList
            items={filteredItems}
            onEdit={openEditModal}
            onDelete={onDelete}
            onToggleActive={onToggleActive}
            loading={loading || Boolean(busyActionId)}
            emptyText={
              activeFilter === "Alles"
                ? "Nog geen diensten toegevoegd."
                : `Nog geen diensten in ${activeFilter}.`
            }
          />
        )}
      </View>

      <View style={styles.footerWrap}>
        <Pressable style={styles.fabBtn} onPress={openCreateModal}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.fabText}>Nieuwe dienst toevoegen</Text>
        </Pressable>
      </View>

      <AddServiceModal
        visible={modalVisible}
        companyId={uid}
        initialService={editingService}
        defaultCategory={activeFilter === "Alles" ? CATEGORIES[0] : activeFilter}
        onClose={() => setModalVisible(false)}
        onSaved={load}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 8,
    gap: 12,
  },
  headerRow: {
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.text,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  filterCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 8,
  },
  filterTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  listWrap: {
    flex: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footerWrap: {
    paddingBottom: 8,
  },
  fabBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  fabText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});
