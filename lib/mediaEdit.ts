export type MediaCropPreset = "original" | "9:16" | "1:1" | "4:5" | "16:9";
export type MediaFilterPreset = "none" | "clean" | "vivid" | "mono" | "warm";

export type MediaEditOptions = {
  cropPreset?: MediaCropPreset;
  filterPreset?: MediaFilterPreset;
};

/**
 * Normalize helpers
 */
export function normalizeMediaCropPreset(value: unknown): MediaCropPreset {
  if (value === "9:16" || value === "1:1" || value === "4:5" || value === "16:9") return value;
  return "original";
}

export function normalizeMediaFilterPreset(value: unknown): MediaFilterPreset {
  if (value === "clean" || value === "vivid" || value === "mono" || value === "warm") return value;
  return "none";
}

/**
 * IMPORTANT:
 * "ar_9:16" + c_pad ALLEEN kan alsnog rare scaling geven (zeker bij video).
 * Daarom: altijd vaste W/H meegeven per preset zodat Cloudinary nooit "raar gaat fitten".
 */
function getPresetSize(preset: MediaCropPreset): { w: number; h: number; ar: string } | null {
  if (preset === "9:16") return { w: 720, h: 1280, ar: "9:16" };
  if (preset === "1:1") return { w: 1080, h: 1080, ar: "1:1" };
  if (preset === "4:5") return { w: 1080, h: 1350, ar: "4:5" };
  if (preset === "16:9") return { w: 1280, h: 720, ar: "16:9" };
  return null;
}

/**
 * Crop transform:
 * - NO zoom/crop: we use c_pad (not c_fill) + background
 * - g_auto ok, but pad keeps whole frame.
 * - We add w/h so the output is stable.
 */
function buildCropTransform(cropPreset: MediaCropPreset): string {
  if (cropPreset === "original") return "";

  const preset = getPresetSize(cropPreset);
  if (!preset) return "";

  // b_black -> zwarte balken i.p.v. inzoomen/croppen
  // c_pad -> behoudt volledige frame (geen zoom)
  // w/h + ar -> stabiel resultaat
  return `c_pad,g_auto,ar_${preset.ar},w_${preset.w},h_${preset.h},b_black`;
}

function buildFilterTransforms(filterPreset: MediaFilterPreset): string[] {
  if (filterPreset === "clean") return ["e_contrast:10"];
  if (filterPreset === "vivid") return ["e_vibrance:40"];
  if (filterPreset === "mono") return ["e_grayscale"];
  if (filterPreset === "warm") return ["e_sepia:35"];
  return [];
}

/**
 * Cloudinary edited url builder:
 * - Only inject transforms if:
 *   - url contains /upload/
 *   - transforms actually exist
 * - Keeps querystring
 */
export function buildCloudinaryEditedUrl(rawUrl: string, options: MediaEditOptions = {}): string {
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
  const markerIndex = rawPath.indexOf(marker);
  if (markerIndex < 0) return source;

  const basePath = rawPath.slice(0, markerIndex + marker.length);
  const suffixPath = rawPath.slice(markerIndex + marker.length);

  // voorkom dubbel transforms stapelen
  const alreadyHasTransforms = suffixPath.includes("/") && suffixPath.split("/")[0].includes(",");
  if (alreadyHasTransforms) {
    // Als je al transforms hebt, laat source met rust (anders stapel je en krijg je zoom / raar gedrag).
    return source;
  }

  const nextPath = `${basePath}${transforms.join(",")}/${suffixPath}`;
  return rawQuery ? `${nextPath}?${rawQuery}` : nextPath;
}