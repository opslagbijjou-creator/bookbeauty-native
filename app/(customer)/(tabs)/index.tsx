import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomSheet from "../../../components/BottomSheet";
import CategoryChips from "../../../components/CategoryChips";
import CompanyCard from "../../../components/CompanyCard";
import SearchBar from "../../../components/SearchBar";
import { CompanyPublic, fetchCompanies } from "../../../lib/companyRepo";
import { Category, CITY_OPTIONS, COLORS, DISCOVER_CATEGORY_FILTERS } from "../../../lib/ui";

const discoverIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
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

const cityIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Alle: "earth-outline",
  Amsterdam: "business-outline",
  Rotterdam: "business-outline",
  "Den Haag": "business-outline",
  Utrecht: "business-outline",
};

export default function CustomerDiscoverScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("Alles");
  const [city, setCity] = useState<string>("Alle");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyPublic[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const params = useMemo(
    () => ({
      query,
      city,
      category: category === "Alles" ? undefined : (category as Category),
      take: 60,
    }),
    [query, city, category]
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchCompanies(params)
      .then((res) => {
        if (!mounted) return;
        setCompanies(res);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [params]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.titleRow}>
        <Ionicons name="compass-outline" size={20} color={COLORS.primary} />
        <Text style={styles.title}>Ontdek salons</Text>
      </View>

      <SearchBar value={query} onChangeText={setQuery} placeholder="Zoek op naam, stad of categorie" />

      <CategoryChips
        items={[...DISCOVER_CATEGORY_FILTERS]}
        active={category}
        onChange={setCategory}
        iconMap={discoverIcons}
      />

      <View style={styles.row}>
        <View style={styles.cityWrap}>
          <Ionicons name="location-outline" size={14} color={COLORS.muted} />
          <Text style={styles.cityText}>{city}</Text>
        </View>
        <Pressable onPress={() => setFilterOpen(true)} style={styles.filterBtn}>
          <Ionicons name="options-outline" size={14} color={COLORS.primary} />
          <Text style={styles.filterText}>Filters</Text>
        </Pressable>
      </View>

      <View style={styles.listWrap}>
        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={companies}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <CompanyCard
                company={item}
                onPress={() => router.push(`/(customer)/company/${item.id}` as never)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.stateWrap}>
                <Text style={styles.empty}>Geen salons gevonden.</Text>
              </View>
            }
          />
        )}
      </View>

      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)}>
        <View style={styles.sheetTitleRow}>
          <Ionicons name="location-outline" size={16} color={COLORS.primary} />
          <Text style={styles.sheetTitle}>Kies stad</Text>
        </View>
        <CategoryChips items={[...CITY_OPTIONS]} active={city} onChange={setCity} iconMap={cityIcons} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cityWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cityText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  listWrap: {
    flex: 1,
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 24,
  },
  empty: {
    color: COLORS.muted,
    fontWeight: "600",
  },
  sheetTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
