export type MediaCropPreset = "original" | "9:16" | "1:1" | "4:5" | "16:9";
export type MediaFilterPreset = "none" | "clean" | "vivid" | "mono" | "warm";

export type MediaEditOptions = {
  cropPreset?: MediaCropPreset;
  filterPreset?: MediaFilterPreset;
};

export function normalizeMediaCropPreset(value: unknown): MediaCropPreset {
  if (value === "9:16" || value === "1:1" || value === "4:5" || value === "16:9") return value;
  return "original";
}

export function normalizeMediaFilterPreset(value: unknown): MediaFilterPreset {
  if (value === "clean" || value === "vivid" || value === "mono" || value === "warm") return value;
  return "none";
}

function isCloudinaryUrl(url: string): boolean {
  return url.includes("/upload/");
}

function buildPadToAspectTransform(cropPreset: MediaCropPreset): string {
  if (cropPreset === "original") return "";

  // Force exact aspect WITHOUT zoom-crop:
  // - c_pad => pad instead of crop
  // - b_black => black bars if needed
  // - g_auto => auto gravity for placement
  // - w/h => ensures Cloudinary actually applies the aspect target reliably
  if (cropPreset === "9:16") return "c_pad,b_black,g_auto,ar_9:16,w_720,h_1280";
  if (cropPreset === "1:1") return "c_pad,b_black,g_auto,ar_1:1,w_1080,h_1080";
  if (cropPreset === "4:5") return "c_pad,b_black,g_auto,ar_4:5,w_1080,h_1350";
  if (cropPreset === "16:9") return "c_pad,b_black,g_auto,ar_16:9,w_1280,h_720";
  return "";
}

function buildFilterTransforms(filterPreset: MediaFilterPreset): string[] {
  if (filterPreset === "clean") return ["e_contrast:10"];
  if (filterPreset === "vivid") return ["e_vibrance:40"];
  if (filterPreset === "mono") return ["e_grayscale"];
  if (filterPreset === "warm") return ["e_sepia:35"];
  return [];
}

export function buildCloudinaryEditedUrl(rawUrl: string, options: MediaEditOptions): string {
  const source = String(rawUrl ?? "").trim();
  if (!source) return "";
  if (!isCloudinaryUrl(source)) return source;

  const cropPreset = normalizeMediaCropPreset(options.cropPreset);
  const filterPreset = normalizeMediaFilterPreset(options.filterPreset);

  const transforms: string[] = [];

  const cropT = buildPadToAspectTransform(cropPreset);
  if (cropT) transforms.push(cropT);

  transforms.push(...buildFilterTransforms(filterPreset));

  // If nothing to do, return original
  if (!transforms.length) return source;

  const [rawPath, rawQuery = ""] = source.split("?");
  const marker = "/upload/";
  const markerIndex = rawPath.indexOf(marker);
  if (markerIndex < 0) return source;

  const basePath = rawPath.slice(0, markerIndex + marker.length);
  const suffixPath = rawPath.slice(markerIndex + marker.length);

  // IMPORTANT: do NOT stack transforms if already transformed
  // If the suffix already starts with something like "c_", "e_", "f_", etc.
  // you can choose to keep stacking, but this keeps it clean:
  const nextPath = `${basePath}${transforms.join(",")}/${suffixPath}`;

  return rawQuery ? `${nextPath}?${rawQuery}` : nextPath;
}