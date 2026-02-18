import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { COLORS } from "../lib/ui";

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  keyboardAware?: boolean;
  keyboardVerticalOffset?: number;
  sheetStyle?: StyleProp<ViewStyle>;
};

export default function BottomSheet({
  visible,
  onClose,
  children,
  keyboardAware = false,
  keyboardVerticalOffset = 0,
  sheetStyle,
}: BottomSheetProps) {
  const content = <View style={[styles.sheet, sheetStyle]}>{children}</View>;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.overlay} onPress={onClose} />
        {keyboardAware ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={keyboardVerticalOffset}
            style={styles.keyboardWrap}
          >
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
});
