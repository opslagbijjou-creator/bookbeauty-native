import React, { useEffect, useMemo, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/ui";

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
      await deferredPrompt.userChoice;
    } catch {
      // no-op when browser blocks prompt
    }
  }

  function onIAddedIt() {
    if (isStandaloneWebApp()) {
      setVisible(false);
      setErrorText("");
      return;
    }
    setErrorText("Nog niet toegevoegd als app. Volg de stappen hieronder en open daarna opnieuw via je beginscherm.");
  }

  function onDismiss() {
    setVisible(false);
    setErrorText("");
  }

  if (!visible || Platform.OS !== "web" || isStandaloneWebApp()) return null;

  const stepsText =
    platformHint === "ios"
      ? "iPhone/iPad: tik op Deel en kies 'Zet op beginscherm'."
      : platformHint === "android"
        ? "Android: open browsermenu en kies 'App installeren' of 'Toevoegen aan startscherm'."
        : "Browser: kies 'Install app' of 'Toevoegen aan startscherm' in het menu.";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <Ionicons name="phone-portrait-outline" size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Open Feed Als App</Text>
          </View>

          <Text style={styles.description}>
            Voor de beste feed-ervaring moet je BookBeauty eerst toevoegen aan je beginscherm en openen als app.
          </Text>
          <Text style={styles.stepText}>{stepsText}</Text>
          {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

          <View style={styles.actionsRow}>
            {deferredPrompt ? (
              <Pressable style={styles.primaryBtn} onPress={() => onInstallNow().catch(() => null)}>
                <Ionicons name="download-outline" size={14} color="#fff" />
                <Text style={styles.primaryBtnText}>Installeer nu</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.secondaryBtn} onPress={onIAddedIt}>
              <Ionicons name="checkmark-circle-outline" size={14} color={COLORS.primary} />
              <Text style={styles.secondaryBtnText}>Ik heb hem toegevoegd</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={onDismiss}>
              <Text style={styles.ghostBtnText}>Nu niet</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.58)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "900",
  },
  description: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  stepText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  actionsRow: {
    gap: 7,
    marginTop: 2,
  },
  primaryBtn: {
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  secondaryBtn: {
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  ghostBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
});
