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

async function ensureLibraryPermission(): Promise<void> {
  const granted = await requestMediaLibraryPermission();
  if (!granted) {
    throw new Error("Geef toegang tot je galerij om media te kiezen.");
  }
}

async function ensureCameraPermission(): Promise<void> {
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
  await ensureLibraryPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    quality: 0.9,
    allowsEditing: Boolean(options?.allowEditing),
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const maxDurationMs =
    typeof options?.maxDurationMs === "number" && Number.isFinite(options.maxDurationMs)
      ? Math.max(0, options.maxDurationMs)
      : MAX_VIDEO_DURATION_MS;
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

export async function uploadUriToStorage(path: string, uri: string, mimeType: string): Promise<string> {
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
    });
  } catch (error) {
    throw friendlyUploadError(error);
  }
}
