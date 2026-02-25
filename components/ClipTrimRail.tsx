import React, { useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

type ClipTrimRailProps = {
  durationSec: number; // totale video duur in seconden (bv 42.3)
  valueStartSec: number; // huidige start
  valueEndSec: number; // huidige end
  maxWindowSec?: number; // default 15
  minWindowSec?: number; // default 1
  onChange: (nextStartSec: number, nextEndSec: number) => void;
};

type DragTarget = "start" | "end" | "range" | null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default function ClipTrimRail({
  durationSec,
  valueStartSec,
  valueEndSec,
  maxWindowSec = 15,
  minWindowSec = 1,
  onChange,
}: ClipTrimRailProps) {
  const dur = Math.max(0, Number(durationSec) || 0);
  const safeDur = dur > 0 ? dur : 1;

  // force sane bounds
  const startSec = clamp(Number(valueStartSec) || 0, 0, safeDur);
  const endSec = clamp(Number(valueEndSec) || 0, 0, safeDur);

  const [railW, setRailW] = useState(1);

  const startX = useMemo(() => (startSec / safeDur) * railW, [startSec, safeDur, railW]);
  const endX = useMemo(() => (endSec / safeDur) * railW, [endSec, safeDur, railW]);

  const activeW = Math.max(0, endX - startX);

  const dragRef = useRef<{
    target: DragTarget;
    grabX: number;
    startAtGrab: number;
    endAtGrab: number;
  }>({
    target: null,
    grabX: 0,
    startAtGrab: startSec,
    endAtGrab: endSec,
  });

  function xToSec(x: number) {
    const px = clamp(x, 0, railW);
    return (px / railW) * safeDur;
  }

  function enforceWindow(nextStart: number, nextEnd: number, target: DragTarget) {
    let s = clamp(nextStart, 0, safeDur);
    let e = clamp(nextEnd, 0, safeDur);

    // ensure order
    if (e < s) {
      const t = s;
      s = e;
      e = t;
    }

    // enforce min window
    if (e - s < minWindowSec) {
      if (target === "start") s = clamp(e - minWindowSec, 0, safeDur);
      else e = clamp(s + minWindowSec, 0, safeDur);
    }

    // enforce max window
    if (e - s > maxWindowSec) {
      if (target === "start") {
        // moving start -> keep end fixed, clamp start
        s = clamp(e - maxWindowSec, 0, safeDur);
      } else if (target === "end") {
        // moving end -> keep start fixed
        e = clamp(s + maxWindowSec, 0, safeDur);
      } else {
        // dragging whole range
        e = s + maxWindowSec;
      }
    }

    // final clamp
    s = clamp(s, 0, safeDur);
    e = clamp(e, 0, safeDur);

    // if range went out of bounds when dragging whole range
    const w = e - s;
    if (w > 0 && target === "range") {
      if (e > safeDur) {
        e = safeDur;
        s = clamp(e - w, 0, safeDur);
      }
      if (s < 0) {
        s = 0;
        e = clamp(s + w, 0, safeDur);
      }
    }

    return { s, e };
  }

  function commit(nextStart: number, nextEnd: number, target: DragTarget) {
    const { s, e } = enforceWindow(nextStart, nextEnd, target);
    onChange(round2(s), round2(e));
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const x = evt.nativeEvent.locationX ?? 0;

          // choose which part user grabbed
          const HANDLE_HIT = 18; // px
          const distToStart = Math.abs(x - startX);
          const distToEnd = Math.abs(x - endX);

          let target: DragTarget = null;

          if (distToStart <= HANDLE_HIT && distToStart <= distToEnd) target = "start";
          else if (distToEnd <= HANDLE_HIT) target = "end";
          else if (x >= startX && x <= endX) target = "range";
          else {
            // tap outside -> jump window centered at tap
            const tapSec = xToSec(x);
            const win = clamp(endSec - startSec, minWindowSec, maxWindowSec);
            const s = clamp(tapSec - win / 2, 0, safeDur);
            const e = clamp(s + win, 0, safeDur);
            commit(s, e, "range");
            target = null;
          }

          dragRef.current = {
            target,
            grabX: x,
            startAtGrab: startSec,
            endAtGrab: endSec,
          };
        },
        onPanResponderMove: (evt) => {
          const x = evt.nativeEvent.locationX ?? 0;
          const dxPx = x - dragRef.current.grabX;
          const dxSec = (dxPx / railW) * safeDur;

          const target = dragRef.current.target;
          if (!target) return;

          const s0 = dragRef.current.startAtGrab;
          const e0 = dragRef.current.endAtGrab;

          if (target === "start") commit(s0 + dxSec, e0, "start");
          if (target === "end") commit(s0, e0 + dxSec, "end");
          if (target === "range") commit(s0 + dxSec, e0 + dxSec, "range");
        },
        onPanResponderRelease: () => {
          dragRef.current.target = null;
        },
        onPanResponderTerminate: () => {
          dragRef.current.target = null;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [railW, safeDur, startX, endX, startSec, endSec, maxWindowSec, minWindowSec]
  );

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.max(1, Math.round(e.nativeEvent.layout.width));
    setRailW(w);
  }

  const windowSec = Math.max(0, endSec - startSec);

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.label}>Trim</Text>
        <Text style={styles.meta}>
          {round2(startSec)}s → {round2(endSec)}s ({round2(windowSec)}s)
        </Text>
      </View>

      <View style={styles.railOuter} onLayout={onLayout} {...pan.panHandlers}>
        <View style={styles.railBg} />

        {/* active window */}
        <View
          style={[
            styles.activeRange,
            {
              left: startX,
              width: activeW,
            },
          ]}
        />

        {/* handles */}
        <View style={[styles.handle, { left: startX - styles.handle.width / 2 }]}>
          <View style={styles.handleGrip} />
        </View>
        <View style={[styles.handle, { left: endX - styles.handle.width / 2 }]}>
          <View style={styles.handleGrip} />
        </View>

        {/* invisible hit area improves web dragging */}
        <Pressable style={StyleSheet.absoluteFillObject} />
      </View>

      <Text style={styles.hint}>
        Sleep start/eind of sleep de hele selectie. Max {maxWindowSec}s.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    gap: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  label: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  meta: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "800",
    fontSize: 12,
  },
  railOuter: {
    width: "100%",
    height: 44,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
  },
  railBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  activeRange: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(223,79,154,0.35)",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  handle: {
    position: "absolute",
    width: 14,
    height: 44,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  handleGrip: {
    width: 3,
    height: 22,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  hint: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "700",
  },
});