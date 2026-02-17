// FILE: app/(company)/(tabs)/services.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { auth } from "../../../lib/firebase";
import {
  CompanyService,
  ServiceCategory,
  addMyService,
  deleteMyService,
  fetchMyServices,
  updateMyService,
} from "../../../lib/serviceRepo";

const BG = "#F7E6EE";
const CARD = "#FFFFFF";
const BORDER = "#E9D3DF";
const PINK = "#E45AA6";
const TEXT = "#1E1E1E";
const MUTED = "#6B6B6B";

const CAT: ServiceCategory[] = [
  "Kapper","Nagels","Wimpers","Wenkbrauwen","Make-up","Massage","Spa","Barber","Overig",
];

export default function CompanyServices() {
  const companyId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CompanyService[]>([]);

  const [category, setCategory] = useState<ServiceCategory>("Kapper");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("30");
  const [durationMin, setDurationMin] = useState("30");

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await fetchMyServices(companyId);
      setItems(data);
    } catch (e: any) {
      Alert.alert("Fout", e?.message ?? "Kon services niet laden");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [companyId]);

  async function onAdd() {
    if (!companyId) return;

    const n = name.trim();
    if (!n) return Alert.alert("Naam ontbreekt", "Vul service naam in.");

    const p = Number(price);
    const d = Number(durationMin);
    if (!Number.isFinite(p) || p <= 0) return Alert.alert("Prijs fout", "Prijs moet > 0 zijn.");
    if (!Number.isFinite(d) || d <= 0) return Alert.alert("Duur fout", "Duur moet > 0 zijn.");

    try {
      await addMyService(companyId, {
        category,
        name: n,
        description: description.trim() || undefined,
        price: p,
        durationMin: d,
        isActive: true,
      });

      setName("");
      setDescription("");
      setPrice("30");
      setDurationMin("30");

      await load();
    } catch (e: any) {
      Alert.alert("Fout", e?.message ?? "Kon service niet toevoegen");
    }
  }

  async function toggleActive(s: CompanyService) {
    if (!companyId) return;
    try {
      await updateMyService(companyId, s.id, { isActive: !s.isActive });
      await load();
    } catch (e: any) {
      Alert.alert("Fout", e?.message ?? "Kon niet updaten");
    }
  }

  async function onDelete(serviceId: string) {
    if (!companyId) return;
    Alert.alert("Verwijderen?", "Weet je het zeker?", [
      { text: "Nee" },
      {
        text: "Ja",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMyService(companyId, serviceId);
            await load();
          } catch (e: any) {
            Alert.alert("Fout", e?.message ?? "Kon niet verwijderen");
          }
        },
      },
    ]);
  }

  if (!companyId) {
    return (
      <View style={styles.center}>
        <Text>Niet ingelogd als company.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.h1}>Diensten</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Categorie</Text>
        <View style={styles.chips}>
          {CAT.map((c) => {
            const active = c === category;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Naam</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Bijv. Knippen + wassen"
          placeholderTextColor="#9A9A9A"
          style={styles.input}
        />

        <Text style={styles.label}>Beschrijving</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Bijv. inclusief stylen, kort haar…"
          placeholderTextColor="#9A9A9A"
          style={[styles.input, { height: 90 }]}
          multiline
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Prijs (€)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Duur (min)</Text>
            <TextInput
              value={durationMin}
              onChangeText={setDurationMin}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        </View>

        <Pressable style={styles.btn} onPress={onAdd}>
          <Text style={styles.btnText}>+ Dienst toevoegen</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: 30 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {item.category ?? "Overig"} • €{item.price} • {item.durationMin} min •{" "}
                  {item.isActive ? "Actief" : "Uit"}
                </Text>
                {item.description ? (
                  <Text style={styles.rowDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>

              <Pressable style={styles.smallBtn} onPress={() => toggleActive(item)}>
                <Text style={styles.smallBtnText}>{item.isActive ? "Zet uit" : "Zet aan"}</Text>
              </Pressable>

              <Pressable
                style={[styles.smallBtn, { backgroundColor: "#FFE8EE", borderColor: "#FFC3D2" }]}
                onPress={() => onDelete(item.id)}
              >
                <Text style={[styles.smallBtnText, { color: "#B71C1C" }]}>Delete</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: MUTED, fontWeight: "800" }}>Nog geen diensten.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: BG },
  h1: { fontSize: 22, fontWeight: "900", color: TEXT, marginBottom: 12 },

  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },

  label: { fontWeight: "900", color: TEXT, marginBottom: 6, marginTop: 6 },

  input: {
    backgroundColor: "#F6F6F6",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    fontWeight: "800",
    color: TEXT,
    marginBottom: 8,
  },

  btn: {
    backgroundColor: PINK,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  btnText: { color: "white", fontWeight: "900" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 6 },
  chip: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipActive: { backgroundColor: PINK, borderColor: PINK },
  chipText: { fontWeight: "900", color: TEXT },
  chipTextActive: { color: "white" },

  row: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  rowTitle: { fontWeight: "900", fontSize: 16, color: TEXT },
  rowMeta: { marginTop: 4, fontWeight: "800", color: MUTED },
  rowDesc: { marginTop: 6, color: "#7B1247", fontWeight: "800" },

  smallBtn: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#F2F2F2",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  smallBtnText: { fontWeight: "900", color: TEXT },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});