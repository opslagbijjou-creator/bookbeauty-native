import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

type DrawerProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export default function Drawer({ visible, onClose, children }: DrawerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.panel}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12,20,31,0.38)",
  },
  panel: {
    width: 304,
    maxWidth: "90%",
    backgroundColor: "#ffffff",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(17,17,17,0.08)",
  },
});
