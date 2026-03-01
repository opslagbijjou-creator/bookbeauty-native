import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS, RADII } from "../../constants/theme";

type InputProps = React.ComponentProps<typeof TextInput> & {
  label?: string;
  helperText?: string;
};

export default function Input({ label, helperText, style, ...props }: InputProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...props}
        placeholderTextColor={props.placeholderTextColor ?? COLORS.placeholder}
        style={[styles.input, style]}
      />
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    minHeight: 52,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  helper: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
