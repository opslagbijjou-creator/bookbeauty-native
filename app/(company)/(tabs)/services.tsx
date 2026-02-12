import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";

import { getAuth } from "firebase/auth";

import {
  CompanyService,
  fetchMyServices,
  addMyService,
  deleteMyService,
} from "../../../lib/serviceRepo";

const BG = "#F7E6EE";
const CARD = "#FFFFFF";
const BORDER = "#E9D3DF";
const PINK = "#E45AA6";
const TEXT = "#1E1E1E";
const MUTED = "#6B6B6B";

export default function CompanyServices() {
  const auth = getAuth();
  const uid = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CompanyService[]>([]);

  const [modalOpen, setModalOpen] = useState(false);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");

  /** ✅ Load services */
  async function load() {
    if (!uid) return;

    setLoading(true);
    const data = await fetchMyServices(uid);
    setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [uid]);

  /** ✅ Add new service */
  async function onAdd() {
    if (!uid) return;

    if (!name.trim()) {
      Alert.alert("Naam ontbreekt");
      return;
    }

    await addMyService({
      companyId: uid,
      name: name.trim(),
      price: Number(price),
      durationMin: Number(duration),
      isActive: true,
    });

    setModalOpen(false);
    setName("");
    setPrice("");
    setDuration("");

    load();
  }

  /** ✅ Delete */
  async function onDelete(id: string) {
    await deleteMyService(id);
    load();
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Mijn Diensten</Text>

      {/* Button */}
      <Pressable style={styles.addBtn} onPress={() => setModalOpen(true)}>
        <Text style={styles.addBtnText}>+ Dienst toevoegen</Text>
      </Pressable>

      {/* Loading */}
      {loading ? (
        <ActivityIndicator size="large" color={PINK} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  €{item.price} • {item.durationMin} min
                </Text>
              </View>

              <Pressable
                onPress={() => onDelete(item.id)}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteText}>X</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Nog geen diensten toegevoegd.</Text>
          }
        />
      )}

      {/* Modal */}
      <Modal visible={modalOpen} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Nieuwe dienst</Text>

            <TextInput
              placeholder="Naam (bv. Knippen)"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <TextInput
              placeholder="Prijs (bv. 30)"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              style={styles.input}
            />

            <TextInput
              placeholder="Duur (bv. 45)"
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
              style={styles.input}
            />

            <Pressable style={styles.saveBtn} onPress={onAdd}>
              <Text style={styles.saveText}>Opslaan</Text>
            </Pressable>

            <Pressable
              style={styles.cancelBtn}
              onPress={() => setModalOpen(false)}
            >
              <Text style={styles.cancelText}>Annuleren</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 12,
    color: TEXT,
  },

  addBtn: {
    backgroundColor: PINK,
    padding: 14,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 14,
  },

  addBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
  },

  card: {
    flexDirection: "row",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: TEXT,
  },

  cardMeta: {
    marginTop: 4,
    fontWeight: "700",
    color: MUTED,
  },

  deleteBtn: {
    backgroundColor: "#FF3B30",
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  deleteText: {
    color: "white",
    fontWeight: "900",
  },

  empty: {
    textAlign: "center",
    marginTop: 40,
    color: MUTED,
    fontWeight: "800",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    width: "90%",
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },

  saveBtn: {
    backgroundColor: PINK,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },

  saveText: {
    color: "white",
    fontWeight: "900",
  },

  cancelBtn: {
    padding: 12,
    alignItems: "center",
  },

  cancelText: {
    fontWeight: "800",
    color: MUTED,
  },
});