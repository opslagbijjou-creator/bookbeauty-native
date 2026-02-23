import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary";
import { Platform } from "react-native";

type UploadToCloudinaryOptions = {
  mimeType?: string;
  fileName?: string;
  folder?: string;
  resourceType?: "auto" | "image" | "video";
  webFile?: File | Blob;
};

function filenameFromUri(uri: string, fallback = "upload.bin"): string {
  const parts = uri.split("/");
  const last = parts[parts.length - 1];
  return last || fallback;
}

function inferResourceType(mimeType?: string, fileName?: string): "image" | "video" | "auto" {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";

  const lower = (fileName ?? "").toLowerCase();
  if (/\.(jpg|jpeg|png|webp|heic|heif)$/.test(lower)) return "image";
  if (/\.(mp4|mov|m4v|webm|avi)$/.test(lower)) return "video";
  return "auto";
}

export async function uploadToCloudinary(
  uri: string,
  options: UploadToCloudinaryOptions = {}
): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error("Cloudinary config ontbreekt (cloud name of upload preset).");
  }

  const fileName = options.fileName || filenameFromUri(uri, "upload.bin");
  const mimeType = options.mimeType || "application/octet-stream";
  const resourceType = options.resourceType || inferResourceType(mimeType, fileName);

  const formData = new FormData();
  if (Platform.OS === "web") {
    if (options.webFile) {
      if (typeof File !== "undefined" && options.webFile instanceof File) {
        formData.append("file", options.webFile);
      } else {
        formData.append("file", options.webFile, fileName);
      }
    } else {
      const fileResponse = await fetch(uri);
      if (!fileResponse.ok) {
        throw new Error("Kon geselecteerde media niet lezen in de browser.");
      }
      const blob = await fileResponse.blob();
      if (typeof File !== "undefined") {
        formData.append(
          "file",
          new File([blob], fileName, { type: mimeType || blob.type || "application/octet-stream" })
        );
      } else {
        formData.append("file", blob, fileName);
      }
    }
  } else {
    formData.append("file", {
      uri,
      type: mimeType,
      name: fileName,
    } as any);
  }
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  if (options.folder) {
    formData.append("folder", options.folder);
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await res.json();
  if (!res.ok || data?.error) {
    const msg =
      typeof data?.error?.message === "string"
        ? data.error.message
        : `Cloudinary upload mislukt (${res.status})`;
    throw new Error(msg);
  }

  if (!data?.secure_url) {
    throw new Error("Cloudinary gaf geen secure_url terug.");
  }

  return String(data.secure_url);
}
