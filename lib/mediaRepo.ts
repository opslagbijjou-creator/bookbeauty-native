import * as ImagePicker from "expo-image-picker";
import { uploadToCloudinary } from "./uploadToCloudinary";

export type PickedMedia = {
  uri: string;
  fileName: string;
  mimeType: string;
  durationMs?: number | null;
};

type PickVideoFromLibraryOptions = {
  allowEditing?: boolean;
};

const MAX_VIDEO_DURATION_MS = 15_000;

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
  const status = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!status.granted) {
    throw new Error("Geef toegang tot je galerij om media te kiezen.");
  }
}

async function ensureCameraPermission(): Promise<void> {
  const status = await ImagePicker.requestCameraPermissionsAsync();
  if (!status.granted) {
    throw new Error("Geef toegang tot je camera om media te maken.");
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
  if (typeof asset.duration === "number" && asset.duration > MAX_VIDEO_DURATION_MS) {
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
