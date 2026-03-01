import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { COLORS } from "../lib/ui";

type SkeletonBlockProps = {
  height: number;
  width?: number | string;
  radius?: number;
  style?: ViewStyle;
};

export default function SkeletonBlock({
  height,
  width = "100%",
  radius = 16,
  style,
}: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.95,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        {
          height,
          width,
          borderRadius: radius,
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: COLORS.surface,
  },
});

