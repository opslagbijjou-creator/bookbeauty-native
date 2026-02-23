import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/ui";

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "bookbeauty_web_install_prompt_dismissed";

function isStandaloneWebApp(): boolean {
  if (Platform.OS !== "web") return true;
  const nav = globalThis.navigator as { standalone?: boolean } | undefined;
  const matchMedia = globalThis.matchMedia;

  const iosStandalone = Boolean(nav?.standalone);
  const pwaDisplayMode = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || pwaDisplayMode;
}

function detectPlatformHint(): "ios" | "android" | "other" {
  if (Platform.OS !== "web") return "other";
  const ua = String(globalThis.navigator?.userAgent ?? "").toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios";
  if (ua.includes("android")) return "android";
  return "other";
}

export default function WebInstallPromptOverlay() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const [errorText, setErrorText] = useState("");
  const platformHint = useMemo(() => detectPlatformHint(), []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (isStandaloneWebApp()) return;
    if (globalThis.localStorage?.getItem(DISMISS_KEY) === "1") return;

    setVisible(true);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as DeferredInstallPromptEvent);
      setVisible(true);
    };

    const handleInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
      setErrorText("");
      globalThis.localStorage?.setItem(DISMISS_KEY, "1");
    };

    globalThis.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    globalThis.addEventListener("appinstalled", handleInstalled);

    return () => {
      globalThis.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      globalThis.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function onInstallNow() {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setVisible(false);
        globalThis.localStorage?.setItem(DISMISS_KEY, "1");
      }
    } catch {
      // browser kan prompt blokkeren
    }
  }

  function onIAddedIt() {
    if (isStandaloneWebApp()) {
      setVisible(false);
      setErrorText("");
      globalThis.localStorage?.setItem(DISMISS_KEY, "1");
      return;
    }
    setErrorText("Nog niet als app geopend. Voeg toe aan beginscherm en open daarna via dat icoon.");
  }

  function onDismiss() {
    setVisible(false);
    setErrorText("");
    globalThis.localStorage?.setItem(DISMISS_KEY, "1");
  }

  if (!visible || Platform.OS !== "web" || isStandaloneWebApp()) return null;

  const stepsText =
    platformHint === "ios"
      ? "iPhone/iPad: Deel -> Zet op beginscherm."
      : platformHint === "android"
        ? "Android: browsermenu -> App installeren / Toevoegen aan startscherm."
        : "Browsermenu: kies Install app / Toevoegen aan startscherm.";

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Ionicons name="phone-portrait-outline" size={16} color={COLORS.primary} />
            <Text style={styles.title}>Feed als app</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onDismiss}>
            <Ionicons name="close" size={14} color={COLORS.muted} />
          </Pressable>
        </View>

        <Text style={styles.description}>
          Feed werkt ook in web, maar als app is hij soepeler en sneller.
        </Text>
        <Text style={styles.stepText}>{stepsText}</Text>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        <View style={styles.actionsRow}>
          {deferredPrompt ? (
            <Pressable style={styles.primaryBtn} onPress={() => onInstallNow().catch(() => null)}>
              <Ionicons name="download-outline" size={13} color="#fff" />
              <Text style={styles.primaryBtnText}>Installeer</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondaryBtn} onPress={onIAddedIt}>
            <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.primary} />
            <Text style={styles.secondaryBtnText}>Al toegevoegd</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    zIndex: 50,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 7,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  description: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  stepText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 7,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
});
