import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  type CameraCapturedPicture,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import type { PickedMedia } from "../lib/mediaRepo";
import { COLORS } from "../lib/ui";

type CaptureMode = "photo" | "video";

export type CapturedMedia = PickedMedia & {
  kind: "image" | "video";
};

type InAppCaptureModalProps = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (media: CapturedMedia) => void;
};

function makeCaptureFileName(kind: "image" | "video"): string {
  const stamp = Date.now();
  return kind === "video" ? `capture-${stamp}.mp4` : `capture-${stamp}.jpg`;
}

export default function InAppCaptureModal({
  visible,
  onClose,
  onCaptured,
}: InAppCaptureModalProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  const canUseCamera = Boolean(cameraPermission?.granted);
  const canUseMicrophone = Boolean(microphonePermission?.granted);

  const permissionMessage = useMemo(() => {
    if (!canUseCamera) return "Geef camera-toegang om media op te nemen.";
    if (mode === "video" && !canUseMicrophone) {
      return "Geef microfoon-toegang om video op te nemen met geluid.";
    }
    return "";
  }, [canUseCamera, canUseMicrophone, mode]);

  async function requestCurrentPermissions() {
    if (!canUseCamera) {
      await requestCameraPermission();
      return;
    }
    if (mode === "video" && !canUseMicrophone) {
      await requestMicrophonePermission();
    }
  }

  async function onCapturePhoto() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = (await cameraRef.current.takePictureAsync({
        quality: 0.9,
      })) as CameraCapturedPicture | undefined;
      if (!photo?.uri) return;

      onCaptured({
        kind: "image",
        uri: photo.uri,
        fileName: makeCaptureFileName("image"),
        mimeType: "image/jpeg",
        durationMs: null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onCaptureVideo() {
    if (!cameraRef.current || busy) return;
    if (!recording) {
      setBusy(true);
      setRecording(true);
      try {
        const video = await cameraRef.current.recordAsync({
          maxDuration: 60,
        });
        if (!video?.uri) return;
        onCaptured({
          kind: "video",
          uri: video.uri,
          fileName: makeCaptureFileName("video"),
          mimeType: "video/mp4",
          durationMs: null,
        });
      } finally {
        setRecording(false);
        setBusy(false);
      }
      return;
    }

    cameraRef.current.stopRecording();
  }

  async function onPressCapture() {
    if (!canUseCamera || (mode === "video" && !canUseMicrophone)) {
      await requestCurrentPermissions();
      return;
    }

    if (mode === "photo") {
      await onCapturePhoto();
      return;
    }

    await onCaptureVideo();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {canUseCamera ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode={mode === "video" ? "video" : "picture"} />
        ) : (
          <View style={styles.cameraFallback} />
        )}

        <View style={styles.overlay}>
          <View style={styles.topRow}>
            <Pressable style={styles.topBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.topBtn}
              onPress={() => setFacing((prev) => (prev === "back" ? "front" : "back"))}
            >
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.bottomWrap}>
            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, mode === "photo" && styles.modeBtnActive]}
                onPress={() => setMode("photo")}
              >
                <Text style={[styles.modeText, mode === "photo" && styles.modeTextActive]}>Foto</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === "video" && styles.modeBtnActive]}
                onPress={() => setMode("video")}
              >
                <Text style={[styles.modeText, mode === "video" && styles.modeTextActive]}>Video</Text>
              </Pressable>
            </View>

            {permissionMessage ? (
              <View style={styles.permissionCard}>
                <Ionicons name="alert-circle-outline" size={14} color="#fff" />
                <Text style={styles.permissionText}>{permissionMessage}</Text>
              </View>
            ) : null}

            <View style={styles.captureRow}>
              <Pressable style={styles.settingsBtn} onPress={() => Linking.openSettings().catch(() => null)}>
                <Ionicons name="settings-outline" size={18} color="#fff" />
              </Pressable>

              <Pressable
                style={[
                  styles.captureBtn,
                  mode === "video" && styles.captureBtnVideo,
                  recording && styles.captureBtnRecording,
                ]}
                onPress={() => onPressCapture().catch(() => null)}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons
                    name={
                      mode === "video"
                        ? recording
                          ? "stop-circle-outline"
                          : "videocam-outline"
                        : "camera-outline"
                    }
                    size={26}
                    color="#fff"
                  />
                )}
              </Pressable>

              <View style={styles.settingsBtn} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#121212",
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 30,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomWrap: {
    gap: 12,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modeBtn: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modeBtnActive: {
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  modeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  modeTextActive: {
    fontWeight: "900",
  },
  permissionCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    backgroundColor: "rgba(0,0,0,0.42)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  permissionText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  captureBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.28)",
    borderWidth: 3,
    borderColor: "#fff",
  },
  captureBtnVideo: {
    backgroundColor: "rgba(238,42,95,0.65)",
  },
  captureBtnRecording: {
    backgroundColor: COLORS.danger,
  },
});
