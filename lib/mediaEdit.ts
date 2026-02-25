// lib/mediaEdit.ts

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

function cropPresetToSize(preset: MediaCropPreset): { w: number; h: number; ar: MediaCropPreset } | null {
  // Stable sizes that work well for previews + feed/story (no zoom).
  if (preset === "9:16") return { w: 720, h: 1280, ar: "9:16" };
  if (preset === "4:5") return { w: 1080, h: 1350, ar: "4:5" };
  if (preset === "1:1") return { w: 1080, h: 1080, ar: "1:1" };
  if (preset === "16:9") return { w: 1280, h: 720, ar: "16:9" };
  return null;
}

function buildCropTransform(cropPreset: MediaCropPreset): string {
  if (cropPreset === "original") return "";

  const size = cropPresetToSize(cropPreset);
  if (!size) return "";

  // IMPORTANT:
  // - c_pad keeps the full frame (no crop/zoom)
  // - w/h makes padding deterministic (otherwise Cloudinary may behave oddly)
  // - b_black gives clean letterboxing/pillarboxing
  return `c_pad,ar_${size.ar},w_${size.w},h_${size.h},b_black`;
}

function buildFilterTransforms(filterPreset: MediaFilterPreset): string[] {
  if (filterPreset === "clean") return ["e_contrast:10"];
  if (filterPreset === "vivid") return ["e_vibrance:40"];
  if (filterPreset === "mono") return ["e_grayscale"];
  if (filterPreset === "warm") return ["e_sepia:35"];
  return [];
}

function hasCloudinaryUploadMarker(url: string): boolean {
  return url.includes("/upload/");
}

function insertCloudinaryTransforms(rawUrl: string, transforms: string[]): string {
  const source = String(rawUrl ?? "").trim();
  if (!source || !transforms.length) return source;

  const [rawPath, rawQuery = ""] = source.split("?");
  const marker = "/upload/";
  if (!rawPath.includes(marker)) return source;

  const markerIndex = rawPath.indexOf(marker);
  const basePath = rawPath.slice(0, markerIndex + marker.length);
  const suffixPath = rawPath.slice(markerIndex + marker.length);

  // If URL already contains transforms, we still insert ours BEFORE existing suffix path.
  // This is the most predictable behavior for your pipeline.
  const nextPath = `${basePath}${transforms.join(",")}/${suffixPath}`;
  return rawQuery ? `${nextPath}?${rawQuery}` : nextPath;
}

export function buildCloudinaryEditedUrl(rawUrl: string, options: MediaEditOptions): string {
  const source = String(rawUrl ?? "").trim();
  if (!source) return "";
  if (!hasCloudinaryUploadMarker(source)) return source;

  const cropPreset = normalizeMediaCropPreset(options.cropPreset);
  const filterPreset = normalizeMediaFilterPreset(options.filterPreset);

  const transforms: string[] = [];

  const cropTransform = buildCropTransform(cropPreset);
  if (cropTransform) transforms.push(cropTransform);

  transforms.push(...buildFilterTransforms(filterPreset));

  // Optional but safe defaults: improves performance/quality automatically.
  // (If you ever see issues with specific assets, remove these two.)
  transforms.push("q_auto");
  transforms.push("f_auto");

  // If cropPreset is original AND filterPreset is none, transforms will still have q_auto/f_auto.
  // If you want a strict "no-change" URL when no edits are applied, comment out q_auto/f_auto above.
  return insertCloudinaryTransforms(source, transforms);
}