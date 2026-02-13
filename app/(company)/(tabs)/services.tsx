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
  addMyService,
  deleteMyService,
  fetchMyServices,
  updateMyService,
} from "../../../lib/serviceRepo";

export default function CompanyServices() {
  const companyId = auth.currentUser?.uid; // ✅ dit is je companyId

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CompanyService[]>([]);
  const [name, setName] = useState("");
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
    if (!name.trim()) return Alert.alert("Naam ontbreekt", "Vul service naam in.");

    const p = Number(price);
    const d = Number(durationMin);
    if (!Number.isFinite(p) || p <= 0) return Alert.alert("Prijs fout", "Prijs moet > 0 zijn.");
    if (!Number.isFinite(d) || d <= 0) return Alert.alert("Duur fout", "Duur moet > 0 zijn.");

    try {
      await addMyService(companyId, {
        name: name.trim(),
        price: p,
        durationMin: d,
        isActive: true,
      });
      setName("");
      await load();
    } catch (e: any) {
      Alert.alert("Fout", e?.message ?? "Kon service niet toevoegen");
    }
  }

  async function toggleActive(s: CompanyService) {
    try {
      await updateMyService(s.id, { isActive: !s.isActive });
      await load();
    } catch (e: any) {
      Alert.alert("Fout", e?.message ?? "Kon niet updaten");
    }
  }

  async function onDelete(id: string) {
    Alert.alert("Verwijderen?", "Weet je het zeker?", [
      { text: "Nee" },
      {
        text: "Ja",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMyService(id);
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
      <Text style={styles.title}>Services</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nieuwe service</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Bijv. Knippen"
          style={styles.input}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="Prijs"
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
          <TextInput
            value={durationMin}
            onChangeText={setDurationMin}
            placeholder="Minuten"
            keyboardType="numeric"
            style={[styles.input, { flex: 1 }]}
          />
        </View>

        <Pressable style={styles.btn} onPress={onAdd}>
          <Text style={styles.btnText}>+ Toevoegen</Text>
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
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.serviceRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{item.name}</Text>
                <Text style={styles.serviceMeta}>
                  €{item.price} • {item.durationMin} min • {item.isActive ? "Actief" : "Uit"}
                </Text>
              </View>

              <Pressable style={styles.smallBtn} onPress={() => toggleActive(item)}>
                <Text style={styles.smallBtnText}>{item.isActive ? "Zet uit" : "Zet aan"}</Text>
              </Pressable>

              <Pressable style={[styles.smallBtn, { backgroundColor: "#ffebee" }]} onPress={() => onDelete(item.id)}>
                <Text style={[styles.smallBtnText, { color: "#b71c1c" }]}>Delete</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text>Nog geen services. Voeg er 1 toe.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: "#F7E6EE" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 12 },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  label: { fontWeight: "900", marginBottom: 8 },
  input: {
    backgroundColor: "#f4f4f4",
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    fontWeight: "800",
  },
  btn: {
    backgroundColor: "#E97AAE",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnText: { color: "white", fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  serviceRow: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  serviceName: { fontWeight: "900", fontSize: 16 },
  serviceMeta: { opacity: 0.7, marginTop: 2, fontWeight: "700" },
  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  smallBtnText: { fontWeight: "900" },
});