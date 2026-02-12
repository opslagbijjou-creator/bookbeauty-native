// FILE: app/(customer)/(tabs)/index.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Company, CompanyCategory, fetchCompanies } from "../../../lib/companyRepo";
import { CompanyCard } from "../../../components/CompanyCard";

const BG = "#F7E6EE";
const CARD = "#FFFFFF";
const BORDER = "#E9D3DF";
const PINK = "#E45AA6";
const TEXT = "#1E1E1E";
const MUTED = "#6B6B6B";

const CATEGORIES: Array<{
  label: string;
  value?: CompanyCategory;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: "Alles", value: undefined, icon: "sparkles" },
  { label: "Kapper", value: "Kapper", icon: "cut" },
  { label: "Nagels", value: "Nagels", icon: "hand-left" },
  { label: "Wimpers", value: "Wimpers", icon: "eye" },
  { label: "Wenkbrauwen", value: "Wenkbrauwen", icon: "color-filter" },
  { label: "Make-up", value: "Make-up", icon: "brush" },
  { label: "Massage", value: "Massage", icon: "body" },
  { label: "Spa", value: "Spa", icon: "water" },
  { label: "Barber", value: "Barber", icon: "man" },
];

const CITIES = ["Alle", "Amsterdam", "Rotterdam", "Den Haag", "Utrecht"];
const PRICES: Array<{ label: string; value: number | null }> = [
  { label: "Geen", value: null },
  { label: "€25", value: 25 },
  { label: "€50", value: 50 },
  { label: "€75", value: 75 },
  { label: "€100", value: 100 },
];

export default function CustomerHome() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CompanyCategory | undefined>(undefined);
  const [city, setCity] = useState<string>("Alle");
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ✅ echte header hoogte meten
  const [headerH, setHeaderH] = useState(0);

  // ✅ animatie voor header (0 = zichtbaar, -headerH = verborgen)
  const headerY = useRef(new Animated.Value(0)).current;

  // ✅ scroll tracking
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastY = useRef(0);
  const lastAction = useRef<"show" | "hide">("show");

  const params = useMemo(
    () => ({
      query,
      city: city === "Alle" ? undefined : city,
      category: activeCategory,
      maxPrice,
      take: 200,
    }),
    [query, city, activeCategory, maxPrice]
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    fetchCompanies(params)
      .then((data) => {
        if (!mounted) return;
        setCompanies(data);
      })
      .catch((e: any) => {
        if (!mounted) return;
        setError(e?.message ?? "Er ging iets mis met laden.");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [params]);

  // ✅ helper: header show/hide
  const animateHeader = (mode: "show" | "hide") => {
    if (!headerH) return;
    if (lastAction.current === mode) return;
    lastAction.current = mode;

    Animated.timing(headerY, {
      toValue: mode === "hide" ? -headerH : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  // ✅ onScroll: richting bepalen (down hide / up show)
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;

      // altijd show als je bovenaan bent
      if (y <= 0) {
        animateHeader("show");
        lastY.current = y;
        return;
      }

      const diff = y - lastY.current;

      // drempel zodat hij niet "tript"
      if (diff > 8) animateHeader("hide"); // scroll down
      if (diff < -8) animateHeader("show"); // scroll up

      lastY.current = y;
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.screen}>
        {/* HEADER overlay */}
        <Animated.View
          onLayout={(e) => setHeaderH(Math.ceil(e.nativeEvent.layout.height))}
          style={[styles.header, { transform: [{ translateY: headerY }] }]}
        >
          {/* Search + filter */}
          <View style={styles.topRow}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={MUTED} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Zoek (kapper, nagels, salon...)"
                placeholderTextColor="#8A8A8A"
                style={styles.search}
              />
            </View>

            <Pressable onPress={() => setFilterOpen(true)} style={styles.filterBtnTop}>
              <Text style={styles.filterBtnTopText}>Filter</Text>
            </Pressable>
          </View>

          <Text style={styles.h1}>Ontdek salons bij jou in de buurt</Text>

          {/* Chips vierkant + klein */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            keyExtractor={(item) => item.label}
            contentContainerStyle={styles.catRow}
            renderItem={({ item }) => {
              const active =
                item.value === activeCategory ||
                (item.label === "Alles" && activeCategory === undefined);

              return (
                <Pressable
                  onPress={() => setActiveCategory(item.value)}
                  style={[styles.catChipSq, active && styles.catChipSqActive]}
                >
                  <Ionicons name={item.icon} size={18} color={active ? "white" : PINK} />
                  <Text style={[styles.catLabel, active && styles.catLabelActive]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />

          {/* Alleen filter + reset */}
          <View style={styles.filterOnlyRow}>
            <Pressable onPress={() => setFilterOpen(true)} style={styles.filterMainBtn}>
              <Ionicons name="options" size={18} color="white" />
              <Text style={styles.filterMainText}>Filter</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setCity("Alle");
                setMaxPrice(null);
                setActiveCategory(undefined);
                setQuery("");
                animateHeader("show"); // meteen terug tonen
              }}
              style={styles.resetBtn}
            >
              <Ionicons name="refresh" size={16} color={PINK} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.stateBox}>
              <Text style={styles.errorTitle}>Oeps</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loading ? (
            <View style={styles.stateBox}>
              <ActivityIndicator />
              <Text style={styles.muted}>Salons laden…</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* LIST: alleen cards scrollen */}
        <Animated.FlatList
          style={styles.list}
          data={loading ? [] : companies}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CompanyCard c={item} />}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: (headerH || 0) + 12 },
          ]}
          ListEmptyComponent={
            !loading && !error ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>Geen salons gevonden.</Text>
                  <Text style={styles.emptyHint}>
                    (Check Firestore: collection "companies" + isActive = true)
                  </Text>
                </View>
              </View>
            ) : null
          }
          onScroll={onScroll}
          scrollEventThrottle={16}
          // laat iOS wel “pull” toe zodat header altijd terug kan
          bounces
          alwaysBounceVertical
        />

        {/* FILTER MODAL */}
        <Modal
          visible={filterOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setFilterOpen(false)}
        >
          <Pressable style={styles.overlay} onPress={() => setFilterOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <Pressable onPress={() => setFilterOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>Sluiten</Text>
              </Pressable>
            </View>

            <Text style={styles.sheetLabel}>Stad</Text>
            <View style={styles.sheetRow}>
              {CITIES.map((c) => {
                const active = c === city;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCity(c)}
                    style={[styles.sheetChip, active && styles.sheetChipActive]}
                  >
                    <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                      {c}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sheetLabel, { marginTop: 14 }]}>Max prijs</Text>
            <View style={styles.sheetRow}>
              {PRICES.map((p) => {
                const active = p.value === maxPrice;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() => setMaxPrice(p.value)}
                    style={[styles.sheetChip, active && styles.sheetChipActive]}
                  >
                    <Text style={[styles.sheetChipText, active && styles.sheetChipTextActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sheetFooter}>
              <Pressable
                onPress={() => {
                  setCity("Alle");
                  setMaxPrice(null);
                }}
                style={styles.sheetGhost}
              >
                <Text style={styles.sheetGhostText}>Reset</Text>
              </Pressable>

              <Pressable onPress={() => setFilterOpen(false)} style={styles.sheetApply}>
                <Text style={styles.sheetApplyText}>Toepassen</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  screen: { flex: 1, backgroundColor: BG },

  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: BG,
    zIndex: 10,
  },

  list: { flex: 1 },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },

  topRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  searchWrap: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  search: { flex: 1, fontSize: 16, color: TEXT, fontWeight: "800" },

  filterBtnTop: {
    backgroundColor: PINK,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterBtnTopText: { color: "white", fontWeight: "900" },

  h1: { marginTop: 12, fontSize: 18, fontWeight: "900", color: TEXT },

  catRow: { paddingVertical: 12, gap: 10 },
  catChipSq: {
    width: 88,
    height: 56,
    borderRadius: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginRight: 10,
  },
  catChipSqActive: { backgroundColor: PINK, borderColor: PINK },
  catLabel: { fontWeight: "900", color: TEXT, fontSize: 12 },
  catLabelActive: { color: "white" },

  filterOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  filterMainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: PINK,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  filterMainText: { color: "white", fontWeight: "900" },

  resetBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: PINK,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 42,
    backgroundColor: "transparent",
  },
  resetText: { fontWeight: "900", color: PINK, fontSize: 12 },

  stateBox: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 6,
    alignItems: "center",
    gap: 6,
  },
  muted: { color: MUTED, fontWeight: "800" },
  errorTitle: { fontWeight: "900", color: "#8B0F3D", fontSize: 16 },
  errorText: { color: "#8B0F3D", fontWeight: "800", textAlign: "center" },

  // ✅ maakt empty state altijd “scrollbaar”
  emptyWrap: {
    minHeight: 900,
    paddingTop: 20,
  },
  emptyBox: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    gap: 6,
  },
  emptyText: { color: MUTED, fontWeight: "900" },
  emptyHint: { color: MUTED, fontWeight: "700", fontSize: 12, textAlign: "center" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 18, fontWeight: "900", color: TEXT },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  closeText: { fontWeight: "900", color: PINK },

  sheetLabel: { marginTop: 10, marginBottom: 8, fontWeight: "900", color: TEXT },
  sheetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sheetChip: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  sheetChipActive: { backgroundColor: PINK, borderColor: PINK },
  sheetChipText: { fontWeight: "900", color: TEXT },
  sheetChipTextActive: { color: "white" },

  sheetFooter: { flexDirection: "row", gap: 10, marginTop: 16 },
  sheetGhost: {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetGhostText: { fontWeight: "900", color: TEXT },
  sheetApply: {
    flex: 1,
    backgroundColor: PINK,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetApplyText: { fontWeight: "900", color: "white" },
});