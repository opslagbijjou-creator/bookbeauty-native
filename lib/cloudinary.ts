import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const CLOUDINARY_CLOUD_NAME =
  extra.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "djrw0k1fy";

export const CLOUDINARY_UPLOAD_PRESET =
  extra.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "bookbeauty_unsigned";
