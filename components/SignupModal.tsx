// FILE: components/SignupModal.tsx
import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPickRole: (role: "customer" | "company") => void;
  presetEmail?: string;
};

export default function SignupModal({
  visible,
  onClose,
  onPickRole,
  presetEmail,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Account type kiezen</Text>

          <Text style={styles.sub}>
            Kies hoe je BookBeauty gaat gebruiken.
            {presetEmail?.trim() ? `\n(${presetEmail.trim()})` : ""}
          </Text>

          <TouchableOpacity style={styles.option} onPress={() => onPickRole("customer")}>
            <Text style={styles.optionTitle}>✨ Klant</Text>
            <Text style={styles.optionSub}>Routine, favorieten en afspraken.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={() => onPickRole("company")}>
            <Text style={styles.optionTitle}>🏢 Bedrijf</Text>
            <Text style={styles.optionSub}>Salon dashboard, klanten en planning.</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Annuleren</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "white",
    padding: 22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6 },
  sub: { color: "#666", marginBottom: 16, lineHeight: 18 },
  option: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F8F1F6",
    marginBottom: 12,
  },
  optionTitle: { fontSize: 16, fontWeight: "800" },
  optionSub: { fontSize: 13, color: "#666", marginTop: 3 },
  cancel: { textAlign: "center", marginTop: 10, fontWeight: "800", color: "#999" },
});