import React from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { COLORS, RADII } from "../../constants/theme";

type SheetProps = {
  visible: boolean;
  children: React.ReactNode;
  onClose: () => void;
};

export default function Sheet({ visible, children, onClose }: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={styles.sheet}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17,17,17,0.18)",
  },
  scrim: {
    flex: 1,
  },
  sheet: {
    width: "100%",
    maxHeight: Platform.OS === "web" ? 760 : "92%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
  },
});
