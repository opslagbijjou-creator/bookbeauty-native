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

function splitCloudinaryUploadUrl(source: string): { basePath: string; suffixPath: string; rawQuery: string } | null {
  const [rawPath, rawQuery = ""] = source.split("?");
  const marker = "/upload/";
  const markerIndex = rawPath.indexOf(marker);
  if (markerIndex < 0) return null;

  return {
    basePath: rawPath.slice(0, markerIndex + marker.length),
    suffixPath: rawPath.slice(markerIndex + marker.length),
    rawQuery,
  };
}

function isLikelyCloudinaryTransformSegment(segment: string): boolean {
  if (!segment || /^v\d+$/.test(segment)) return false;
  if (segment.includes(",")) return true;

  return /^(a_|ac_|af_|ar_|b_|bo_|c_|co_|d_|dn_|e_|eo_|f_|fl_|fn_|fps_|g_|h_|ki_|l_|o_|p_|pg_|q_|r_|so_|sp_|t_|u_|vc_|vs_|w_|x_|y_|z_)/.test(
    segment
  );
}

function normalizeCloudinarySuffix(suffixPath: string): string {
  const segments = suffixPath.split("/").filter(Boolean);
  let firstAssetIndex = 0;

  while (
    firstAssetIndex < segments.length &&
    isLikelyCloudinaryTransformSegment(segments[firstAssetIndex])
  ) {
    firstAssetIndex += 1;
  }

  return segments.slice(firstAssetIndex).join("/");
}

function buildCloudinaryUrl(rawUrl: string, transformSegment?: string): string {
  const source = String(rawUrl ?? "").trim();
  if (!source) return "";

  const parsed = splitCloudinaryUploadUrl(source);
  if (!parsed) return source;

  const normalizedSuffix = normalizeCloudinarySuffix(parsed.suffixPath);
  if (!normalizedSuffix) return source;

  const nextPath = transformSegment
    ? `${parsed.basePath}${transformSegment}/${normalizedSuffix}`
    : `${parsed.basePath}${normalizedSuffix}`;

  return parsed.rawQuery ? `${nextPath}?${parsed.rawQuery}` : nextPath;
}

export function stripCloudinaryTransforms(rawUrl: string): string {
  return buildCloudinaryUrl(rawUrl);
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

  return buildCloudinaryUrl(source, transforms.length ? transforms.join(",") : undefined);
}

const CLOUDINARY_TRANSCODE_STEP = "f_mp4,vc_h264,ac_aac,q_auto,a_auto";
const CLOUDINARY_VERTICAL_STILL_STEP = "so_1,c_pad,b_black,g_auto,ar_9:16,w_720,h_1280,q_auto,f_jpg";

export function buildCloudinaryVideoPlaybackUrl(rawUrl: string): string {
  const source = String(rawUrl ?? "").trim();
  if (!source) return "";
  if (!isCloudinaryUrl(source)) return source;

  return buildCloudinaryUrl(source, CLOUDINARY_TRANSCODE_STEP);
}

export function buildCloudinaryVideoThumbnailUrl(rawUrl: string): string {
  const source = String(rawUrl ?? "").trim();
  if (!source) return "";
  if (!isCloudinaryUrl(source)) return "";

  const normalizedSource = stripCloudinaryTransforms(source);
  const parsed = splitCloudinaryUploadUrl(normalizedSource);
  if (!parsed) return "";

  let assetSuffix = normalizeCloudinarySuffix(parsed.suffixPath);
  if (!assetSuffix) return "";

  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(assetSuffix)) {
    assetSuffix = assetSuffix.replace(/\.(mp4|mov|m4v|webm|avi)$/i, ".jpg");
  } else if (!/\.(jpg|jpeg|png|webp)$/i.test(assetSuffix)) {
    assetSuffix = `${assetSuffix}.jpg`;
  }

  const nextPath = `${parsed.basePath}${CLOUDINARY_VERTICAL_STILL_STEP}/${assetSuffix}`;
  return parsed.rawQuery ? `${nextPath}?${parsed.rawQuery}` : nextPath;
}
