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

function buildCropTransform(cropPreset: MediaCropPreset): string {
  if (cropPreset === "original") return "";
  // Avoid aggressive zoom-in cropping; keep the full frame and pad to aspect ratio.
  return `c_pad,g_auto,ar_${cropPreset}`;
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

  const cropPreset = normalizeMediaCropPreset(options.cropPreset);
  const filterPreset = normalizeMediaFilterPreset(options.filterPreset);

  const transforms: string[] = [];
  const cropTransform = buildCropTransform(cropPreset);
  if (cropTransform) transforms.push(cropTransform);
  transforms.push(...buildFilterTransforms(filterPreset));

  if (!transforms.length) return source;

  const [rawPath, rawQuery = ""] = source.split("?");
  const marker = "/upload/";
  if (!rawPath.includes(marker)) return source;

  const markerIndex = rawPath.indexOf(marker);
  const basePath = rawPath.slice(0, markerIndex + marker.length);
  const suffixPath = rawPath.slice(markerIndex + marker.length);
  const nextPath = `${basePath}${transforms.join(",")}/${suffixPath}`;

  return rawQuery ? `${nextPath}?${rawQuery}` : nextPath;
}
