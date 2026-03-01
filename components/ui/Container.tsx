import React from "react";
import { StyleProp, View, ViewStyle, useWindowDimensions } from "react-native";

type ContainerProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fullBleed?: boolean;
  mobileMaxWidth?: number;
  desktopMaxWidth?: number;
  mobilePadding?: number;
  desktopPadding?: number;
};

export default function Container({
  children,
  style,
  fullBleed = false,
  mobileMaxWidth = 430,
  desktopMaxWidth = 1180,
  mobilePadding = 16,
  desktopPadding = 32,
}: ContainerProps) {
  const { width } = useWindowDimensions();
  const desktop = width >= 768;

  return (
    <View
      style={[
        {
          width: "100%",
          maxWidth: desktop ? desktopMaxWidth : mobileMaxWidth,
          alignSelf: "center",
          paddingHorizontal: fullBleed ? 0 : desktop ? desktopPadding : mobilePadding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
