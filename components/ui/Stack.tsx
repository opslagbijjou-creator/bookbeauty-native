import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

type StackProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
  row?: boolean;
  wrap?: boolean;
};

export default function Stack({
  children,
  style,
  gap = 12,
  row = false,
  wrap = false,
}: StackProps) {
  return (
    <View
      style={[
        {
          flexDirection: row ? "row" : "column",
          gap,
          flexWrap: wrap ? "wrap" : "nowrap",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
