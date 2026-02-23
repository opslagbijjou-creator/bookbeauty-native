import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import { uploadToCloudinary } from "./uploadToCloudinary";

export type PickedMedia = {
  uri: string;
  fileName: string;
  mimeType: string;
  durationMs?: number | null;
  webFile?: File | Blob | null;
};

export type PickedMediaWithKind = PickedMedia & {
  kind: "image" | "video";
};

type PickVideoFromLibraryOptions = {
  allowEditing?: boolean;
  maxDurationMs?: number;
};

const MAX_VIDEO_DURATION_MS = 15_000;
type PermissionState = "granted" | "denied" | "undetermined";

function toPermissionState(status: string): PermissionState {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

function friendlyUploadError(error: unknown): Error {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes("upload preset")) {
      return new Error("Cloudinary upload preset is ongeldig of niet als unsigned ingesteld.");
    }

    if (msg.includes("cloud name")) {
      return new Error("Cloudinary cloud name ontbreekt of klopt niet.");
    }

    if (msg.includes("network")) {
      return new Error("Netwerkfout tijdens upload. Controleer internet en probeer opnieuw.");
    }

    return error;
  }
  return new Error("Uploaden is mislukt door een onbekende fout.");
}

function filenameFromUri(uri: string, fallback = "upload"): string {
  const parts = uri.split("/");
  const last = parts[parts.length - 1];
  return last || fallback;
}

function inferMediaKindFromMimeOrName(mimeType: string, fileName: string): "image" | "video" {
  const mime = String(mimeType ?? "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";

  const lower = String(fileName ?? "").toLowerCase();
  if (/\.(mp4|mov|m4v|webm|avi)$/.test(lower)) return "video";
  return "image";
}

function canUseWebFilePicker(): boolean {
  return (
    Platform.OS === "web" &&
    typeof document !== "undefined" &&
    typeof window !== "undefined" &&
    typeof URL !== "undefined"
  );
}

async function pickWebFile(accept: string): Promise<File | null> {
  if (!canUseWebFilePicker()) return null;

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";

    let done = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let removeFocusListener: (() => void) | null = null;

    const finish = (file: File | null) => {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (removeFocusListener) removeFocusListener();
      input.onchange = null;
      input.remove();
      resolve(file);
    };

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      finish(file);
    };

    const onWindowFocus = () => {
      setTimeout(() => {
        if (done) return;
        finish(input.files?.[0] ?? null);
      }, 260);
    };

    timeoutId = setTimeout(() => finish(null), 60_000);
    window.addEventListener("focus", onWindowFocus, { once: true });
    removeFocusListener = () => window.removeEventListener("focus", onWindowFocus);
    document.body.appendChild(input);
    input.click();
  });
}

async function readWebVideoDurationMs(file: File): Promise<number | null> {
  if (!canUseWebFilePicker() || typeof URL === "undefined") return null;

  return new Promise((resolve) => {
    const probeUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;

    const finish = (durationMs: number | null) => {
      if (done) return;
      done = true;
      try {
        video.src = "";
      } catch {
        // noop
      }
      URL.revokeObjectURL(probeUrl);
      resolve(durationMs);
    };

    const timeoutId = setTimeout(() => finish(null), 7000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      const raw = Number(video.duration);
      if (!Number.isFinite(raw) || raw <= 0) {
        finish(null);
        return;
      }
      finish(Math.round(raw * 1000));
    };
    video.onerror = () => {
      clearTimeout(timeoutId);
      finish(null);
    };
    video.src = probeUrl;
  });
}

async function ensureLibraryPermission(): Promise<void> {
  if (Platform.OS === "web") return;
  const granted = await requestMediaLibraryPermission();
  if (!granted) {
    throw new Error("Geef toegang tot je galerij om media te kiezen.");
  }
}

async function ensureCameraPermission(): Promise<void> {
  if (Platform.OS === "web") return;
  const granted = await requestCameraPermission();
  if (!granted) {
    throw new Error("Geef toegang tot je camera om media te maken.");
  }
}

export async function getMediaLibraryPermissionState(): Promise<PermissionState> {
  if (Platform.OS === "web") {
    const status = await ImagePicker.getMediaLibraryPermissionsAsync();
    return toPermissionState(status.status);
  }
  const status = await MediaLibrary.getPermissionsAsync();
  return toPermissionState(status.status);
}

export async function getCameraPermissionState(): Promise<PermissionState> {
  if (Platform.OS === "web") {
    const status = await ImagePicker.getCameraPermissionsAsync();
    return toPermissionState(status.status);
  }
  const status = await Camera.getCameraPermissionsAsync();
  return toPermissionState(status.status);
}

export async function requestMediaLibraryPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    const status = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status.granted;
  }
  const status = await MediaLibrary.requestPermissionsAsync();
  return status.granted;
}

export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    const status = await ImagePicker.requestCameraPermissionsAsync();
    return status.granted;
  }
  const status = await Camera.requestCameraPermissionsAsync();
  return status.granted;
}

export async function getMicrophonePermissionState(): Promise<PermissionState> {
  try {
    const status = await Camera.getMicrophonePermissionsAsync();
    return toPermissionState(status.status);
  } catch {
    return "undetermined";
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const status = await Camera.requestMicrophonePermissionsAsync();
    return status.granted;
  } catch {
    return false;
  }
}

export async function pickImageFromLibrary(): Promise<PickedMedia | null> {
  if (canUseWebFilePicker()) {
    const file = await pickWebFile("image/*");
    if (!file) return null;

    const uri = URL.createObjectURL(file);
    return {
      uri,
      fileName: file.name || "image.jpg",
      mimeType: file.type || "image/jpeg",
      durationMs: null,
      webFile: file,
    };
  }

  await ensureLibraryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? filenameFromUri(asset.uri, "image.jpg"),
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

export async function captureImageWithCamera(): Promise<PickedMedia | null> {
  await ensureCameraPermission();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? filenameFromUri(asset.uri, "camera-image.jpg"),
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

export async function pickVideoFromLibrary(options?: PickVideoFromLibraryOptions): Promise<PickedMedia | null> {
  const maxDurationMs =
    typeof options?.maxDurationMs === "number" && Number.isFinite(options.maxDurationMs)
      ? Math.max(0, options.maxDurationMs)
      : MAX_VIDEO_DURATION_MS;

  if (canUseWebFilePicker()) {
    const file = await pickWebFile("video/*");
    if (!file) return null;

    const durationMs = await readWebVideoDurationMs(file).catch(() => null);
    if (maxDurationMs > 0 && typeof durationMs === "number" && durationMs > maxDurationMs) {
      throw new Error("Video mag maximaal 15 seconden zijn.");
    }

    const uri = URL.createObjectURL(file);
    return {
      uri,
      fileName: file.name || "video.mp4",
      mimeType: file.type || "video/mp4",
      durationMs,
      webFile: file,
    };
  }

  await ensureLibraryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    quality: 0.9,
    allowsEditing: Boolean(options?.allowEditing),
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (maxDurationMs > 0 && typeof asset.duration === "number" && asset.duration > maxDurationMs) {
    throw new Error("Video mag maximaal 15 seconden zijn.");
  }

  return {
    uri: asset.uri,
    fileName: asset.fileName ?? filenameFromUri(asset.uri, "video.mp4"),
    mimeType: asset.mimeType ?? "video/mp4",
    durationMs: asset.duration ?? null,
  };
}

export async function recordVideoWithCamera(): Promise<PickedMedia | null> {
  await ensureCameraPermission();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["videos"],
    quality: 0.9,
    videoMaxDuration: 15,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (typeof asset.duration === "number" && asset.duration > MAX_VIDEO_DURATION_MS) {
    throw new Error("Video-opname is langer dan 15 seconden. Neem een kortere opname.");
  }

  return {
    uri: asset.uri,
    fileName: asset.fileName ?? filenameFromUri(asset.uri, "camera-video.mp4"),
    mimeType: asset.mimeType ?? "video/mp4",
    durationMs: asset.duration ?? null,
  };
}

function detectPickerKind(asset: ImagePicker.ImagePickerAsset): "image" | "video" {
  if (asset.type === "video") return "video";
  if (String(asset.mimeType ?? "").toLowerCase().startsWith("video/")) return "video";
  return "image";
}

function toPickedMediaWithKind(asset: ImagePicker.ImagePickerAsset): PickedMediaWithKind {
  const kind = detectPickerKind(asset);
  const fallbackName = kind === "video" ? "video.mp4" : "image.jpg";
  return {
    kind,
    uri: asset.uri,
    fileName: asset.fileName ?? filenameFromUri(asset.uri, fallbackName),
    mimeType: asset.mimeType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
    durationMs: kind === "video" ? asset.duration ?? null : null,
  };
}

function ensurePickedVideoDurationWithinLimit(picked: PickedMediaWithKind): void {
  if (picked.kind !== "video") return;
  if (typeof picked.durationMs === "number" && picked.durationMs > MAX_VIDEO_DURATION_MS) {
    throw new Error("Video mag maximaal 15 seconden zijn.");
  }
}

export async function pickAnyMediaFromLibrary(): Promise<PickedMediaWithKind | null> {
  if (canUseWebFilePicker()) {
    const file = await pickWebFile("image/*,video/*");
    if (!file) return null;

    const kind = inferMediaKindFromMimeOrName(file.type, file.name);
    const durationMs = kind === "video" ? await readWebVideoDurationMs(file).catch(() => null) : null;
    const picked: PickedMediaWithKind = {
      kind,
      uri: URL.createObjectURL(file),
      fileName: file.name || (kind === "video" ? "video.mp4" : "image.jpg"),
      mimeType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      durationMs,
      webFile: file,
    };
    ensurePickedVideoDurationWithinLimit(picked);
    return picked;
  }

  await ensureLibraryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.9,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const picked = toPickedMediaWithKind(result.assets[0]);
  ensurePickedVideoDurationWithinLimit(picked);
  return picked;
}

export async function captureAnyMediaWithCamera(): Promise<PickedMediaWithKind | null> {
  await ensureCameraPermission();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images", "videos"],
    quality: 0.9,
    videoMaxDuration: 15,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const picked = toPickedMediaWithKind(result.assets[0]);
  ensurePickedVideoDurationWithinLimit(picked);
  return picked;
}

export async function uploadUriToStorage(
  path: string,
  uri: string,
  mimeType: string,
  webFile?: File | Blob | null
): Promise<string> {
  try {
    const fileName = path.split("/").pop() || filenameFromUri(uri, "upload.bin");
    const folderPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : undefined;
    const resourceType =
      mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "auto";

    return await uploadToCloudinary(uri, {
      mimeType: mimeType || "application/octet-stream",
      fileName,
      folder: folderPath,
      resourceType,
      webFile: webFile ?? undefined,
    });
  } catch (error) {
    throw friendlyUploadError(error);
  }
}
