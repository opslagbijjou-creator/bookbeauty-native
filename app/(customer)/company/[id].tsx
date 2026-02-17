import React, { useEffect, useMemo, useState } from "react";
import type { CompanyService } from "../../../lib/serviceRepo";
import { fetchCompanyServices } from "../../../lib/serviceRepo";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Company, fetchCompanyById } from "../../../lib/companyRepo";

const BG = "#F7E6EE";
const CARD = "#FFFFFF";
const BORDER = "#E9D3DF";
const PINK = "#E45AA6";
const TEXT = "#1E1E1E";
const MUTED = "#6B6B6B";

function eur(n: number) {
  return `€${Math.round(n)}`;
}

export default function CompanyProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companyId = String(id ?? "");

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [services, setServices] = useState<CompanyService[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!companyId) return;

    let mounted = true;
    setLoading(true);

    (async () => {
      try {
        const c = await fetchCompanyById(companyId);
        const s = await fetchCompanyServices(companyId);

        if (!mounted) return;
        setCompany(c);
        setServices(s);
      } catch (e: any) {
        Alert.alert("Oeps", e?.message ?? "Kon salon niet laden.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [companyId]);

  // ✅ filter op zoek (client-side)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return services;
    return services.filter((s) => {
      const name = (s.name ?? "").toLowerCase();
      const desc = (s.description ?? "").toLowerCase();
      return name.includes(needle) || desc.includes(needle);
    });
  }, [services, q]);

  // ✅ groeperen op category
  const grouped = useMemo(() => {
    const map = new Map<string, CompanyService[]>();
    for (const s of filtered) {
      const cat = (s.category ?? "Overig").trim() || "Overig";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    // sort services binnen groep
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      map.set(k, arr);
    }
    // sort categorieën (Overig laatst)
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "Overig") return 1;
      if (b === "Overig") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ title: k, items: map.get(k)! }));
  }, [filtered]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.screen, styles.center]}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, fontWeight: "900", color: MUTED }}>Laden…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!company) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={[styles.screen, styles.center]}>
          <Text style={{ fontWeight: "900", color: TEXT }}>Salon niet gevonden.</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Terug</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={20} color={TEXT} />
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* Later: share */}
          <Pressable onPress={() => {}} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={18} color={TEXT} />
          </Pressable>
        </View>

        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoLetter}>{(company.name ?? "S").slice(0, 1).toUpperCase()}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {company.name}
            </Text>

            <Text style={styles.meta} numberOfLines={1}>
              {company.city}
              {company.minPrice != null ? ` • vanaf ${eur(company.minPrice)}` : ""}
            </Text>

            {/* Later: sterren + followers */}
            <View style={styles.pillsRow}>
              <View style={styles.pill}>
                <Ionicons name="star" size={14} color={PINK} />
                <Text style={styles.pillText}>4.9</Text>
              </View>
              <View style={styles.pill}>
                <Ionicons name="people" size={14} color={PINK} />
                <Text style={styles.pillText}>1.2k</Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.followBtn} onPress={() => Alert.alert("Volgen", "Later: followers + follow knop")}>
            <Ionicons name="add" size={18} color="white" />
            <Text style={styles.followText}>Volg</Text>
          </Pressable>
        </View>

        {/* Zoek in diensten */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={MUTED} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Zoek in diensten…"
            placeholderTextColor="#8A8A8A"
            style={styles.search}
          />
        </View>

        {/* Diensten */}
        {grouped.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Nog geen diensten.</Text>
            <Text style={styles.emptyHint}>Dit bedrijf heeft nog niks toegevoegd.</Text>
          </View>
        ) : (
          grouped.map((g) => (
            <View key={g.title} style={{ marginTop: 12 }}>
              <Text style={styles.sectionTitle}>{g.title}</Text>

              {g.items.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.serviceCard}
                  onPress={() => Alert.alert("Service", "Later: service detail + booking flow")}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.serviceName} numberOfLines={1}>
                      {s.name}
                    </Text>

                    {!!s.description ? (
                      <Text style={styles.serviceDesc} numberOfLines={2}>
                        {s.description}
                      </Text>
                    ) : null}

                    <Text style={styles.serviceMeta}>
                      {eur(s.price)} • {s.durationMin} min
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={MUTED} />
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  screen: { flex: 1, backgroundColor: BG, paddingHorizontal: 16 },
  center: { alignItems: "center", justifyContent: "center" },

  topBar: { flexDirection: "row", alignItems: "center", paddingTop: 6, paddingBottom: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  logoCircle: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F4D7E3",
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { fontWeight: "900", fontSize: 20, color: TEXT },

  name: { fontSize: 18, fontWeight: "900", color: TEXT },
  meta: { marginTop: 2, fontWeight: "800", color: MUTED },

  pillsRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  pill: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#F7E6EE",
    borderWidth: 1,
    borderColor: BORDER,
  },
  pillText: { fontWeight: "900", color: TEXT },

  followBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: PINK,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  followText: { color: "white", fontWeight: "900" },

  searchWrap: {
    marginTop: 12,
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

  sectionTitle: { marginTop: 6, marginBottom: 8, fontWeight: "900", color: TEXT, fontSize: 14 },

  serviceCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  serviceName: { fontSize: 16, fontWeight: "900", color: TEXT },
  serviceDesc: { marginTop: 4, fontWeight: "800", color: "rgba(30,30,30,0.65)" },
  serviceMeta: { marginTop: 8, fontWeight: "900", color: "#7B1247" },

  emptyBox: {
    marginTop: 16,
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

  backBtn: {
    marginTop: 12,
    backgroundColor: PINK,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  backText: { color: "white", fontWeight: "900" },
});