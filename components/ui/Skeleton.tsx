import React from "react";
import SkeletonBlock from "../SkeletonBlock";

type SkeletonProps = {
  height: number;
  width?: number | string;
  radius?: number;
};

export default function Skeleton({ height, width = "100%", radius = 12 }: SkeletonProps) {
  return <SkeletonBlock height={height} width={width} radius={radius} />;
}
