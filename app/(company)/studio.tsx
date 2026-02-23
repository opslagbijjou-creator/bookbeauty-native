import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { type AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import { useRouter, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { subscribeAuth } from "../../lib/authRepo";
import CategoryChips from "../../components/CategoryChips";
import {
  addMyFeedPost,
  deleteMyFeedPost,
  fetchMyFeedPosts,
  FeedPost,
  updateMyFeedPost,
} from "../../lib/feedRepo";
import { auth } from "../../lib/firebase";
import {
  getMediaLibraryPermissionState,
  pickAnyMediaFromLibrary,
  requestMediaLibraryPermission,
  type PickedMedia,
  uploadUriToStorage,
} from "../../lib/mediaRepo";
import {
  buildCloudinaryEditedUrl,
  type MediaCropPreset,
  type MediaFilterPreset,
} from "../../lib/mediaEdit";
import { confirmAction } from "../../lib/confirmAction";
import { fetchMyServices, type CompanyService } from "../../lib/serviceRepo";
import { getPostLikeCount } from "../../lib/socialRepo";
import { addCompanyStory } from "../../lib/storyRepo";
import { CATEGORIES, COLORS } from "../../lib/ui";

const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Kapper: "cut-outline",
  Nagels: "flower-outline",
  Wimpers: "eye-outline",
  Wenkbrauwen: "sparkles-outline",
  "Make-up": "color-palette-outline",
  Massage: "body-outline",
  Spa: "water-outline",
  Barber: "man-outline",
  Overig: "grid-outline",
};

const MAX_HASHTAGS = 12;
const MAX_VIDEO_SECONDS = 15;
const INPUT_HINT_COLOR = "#5f5f5f";

type StudioTab = "upload" | "videos";
type UploadVisibility = "public" | "clients";
type UploadStep = "select" | "details";
type UploadMediaType = "video" | "image";
type PermissionState = "granted" | "denied" | "undetermined";
type PendingMediaAction = "library";

const DEFAULT_CROP_PRESET: MediaCropPreset = "original";
const DEFAULT_FILTER_PRESET: MediaFilterPreset = "none";
const FILTER_OPTIONS: { key: MediaFilterPreset; label: string }[] = [
  { key: "none", label: "Geen" },
  { key: "clean", label: "Clean" },
  { key: "vivid", label: "Vivid" },
  { key: "warm", label: "Warm" },
  { key: "mono", label: "Mono" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function parseHashtagsInput(value: string): string[] {
  const normalized = value
    .split(/[\s,]+/)
    .map((part) => part.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, MAX_HASHTAGS);
}

function formatHashtags(tags?: string[]): string {
  if (!tags?.length) return "";
  return tags.map((tag) => `#${tag}`).join(" ");
}

function cloudinaryVideoThumbnailFromUrl(videoUrl: string): string {
  if (!videoUrl) return "";

  const [rawPath, rawQuery = ""] = videoUrl.split("?");
  let path = rawPath;

  if (path.includes("/upload/")) {
    // Keep full frame in thumbnails (no crop/zoom), add letterboxing when needed.
    path = path.replace("/upload/", "/upload/so_1,c_pad,b_black,ar_9:16,w_720,h_1280,q_auto,f_jpg/");
  }

  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(path)) {
    path = path.replace(/\.(mp4|mov|m4v|webm|avi)$/i, ".jpg");
  } else if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) {
    path = `${path}.jpg`;
  }

  return rawQuery ? `${path}?${rawQuery}` : path;
}

function getPostThumbnail(post: Pick<FeedPost, "thumbnailUrl" | "videoUrl" | "imageUrl" | "mediaType">): string {
  if (post.thumbnailUrl?.trim()) return post.thumbnailUrl.trim();
  if (post.mediaType === "image" && post.imageUrl?.trim()) return post.imageUrl.trim();
  if (post.imageUrl?.trim() && !post.videoUrl?.trim()) return post.imageUrl.trim();
  return cloudinaryVideoThumbnailFromUrl(post.videoUrl);
}

function formatDate(ms?: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatClipRange(startSec: number, endSec: number): string {
  const start = Math.max(0, startSec);
  const end = Math.max(start, endSec);
  return `${start.toFixed(1)}s - ${end.toFixed(1)}s`;
}

export default function CompanyStudioScreen() {
  const router = useRouter();
  const segments = useSegments();
  const inTabs = (segments as string[]).includes("(tabs)");
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  const [studioTab, setStudioTab] = useState<StudioTab>("upload");
  const [items, setItems] = useState<FeedPost[]>([]);
  const [likesByPost, setLikesByPost] = useState<Record<string, number>>({});
  const [services, setServices] = useState<CompanyService[]>([]);

  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [refreshingAfterUpload, setRefreshingAfterUpload] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [busyPostId, setBusyPostId] = useState<string | null>(null);

  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [visibility, setVisibility] = useState<UploadVisibility>("public");
  const [uploadMediaType, setUploadMediaType] = useState<UploadMediaType>("video");
  const [video, setVideo] = useState<PickedMedia | null>(null);
  const [imageMedia, setImageMedia] = useState<PickedMedia | null>(null);
  const [cropPreset, setCropPreset] = useState<MediaCropPreset>(DEFAULT_CROP_PRESET);
  const [filterPreset, setFilterPreset] = useState<MediaFilterPreset>(DEFAULT_FILTER_PRESET);
  const [uploadStep, setUploadStep] = useState<UploadStep>("select");
  const [uploadComposerVisible, setUploadComposerVisible] = useState(false);
  const [videoLengthWarning, setVideoLengthWarning] = useState<string | null>(null);
  const [clipStartSec, setClipStartSec] = useState(0);
  const [clipEndSec, setClipEndSec] = useState(MAX_VIDEO_SECONDS);
  const [detectedPreviewDurationSec, setDetectedPreviewDurationSec] = useState(0);
  const [startRailWidth, setStartRailWidth] = useState(0);
  const [endRailWidth, setEndRailWidth] = useState(0);
  const [libraryPermission, setLibraryPermission] = useState<PermissionState>("undetermined");
  const [pendingMediaAction, setPendingMediaAction] = useState<PendingMediaAction | null>(null);
  const [postingStory, setPostingStory] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  const tabOpacity = useRef(new Animated.Value(1)).current;
  const previewVideoRef = useRef<Video | null>(null);
  const previewSeekingRef = useRef(false);
  const uploadComposerAutoOpenedRef = useRef(false);

  const activeServices = useMemo(() => services.filter((service) => service.isActive), [services]);
  const hashtags = useMemo(() => parseHashtagsInput(hashtagsInput), [hashtagsInput]);
  const editingItem = useMemo(
    () => items.find((item) => item.id === editingPostId) ?? null,
    [items, editingPostId]
  );
  const detailItem = useMemo(() => items.find((item) => item.id === detailPostId) ?? null, [items, detailPostId]);
  const selectedService = useMemo(
    () => activeServices.find((service) => service.id === selectedServiceId) ?? null,
    [activeServices, selectedServiceId]
  );

  const liveCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);
  const totalViews = useMemo(() => items.reduce((acc, item) => acc + (item.viewCount ?? 0), 0), [items]);
  const previewVideoUri = useMemo(() => {
    if (uploadMediaType !== "video") return "";
    if (video?.uri) return video.uri;

    const baseVideo = editingItem?.sourceVideoUrl?.trim() || editingItem?.videoUrl?.trim() || "";
    if (!baseVideo) return "";
    return buildCloudinaryEditedUrl(baseVideo, { cropPreset, filterPreset });
  }, [uploadMediaType, video?.uri, editingItem, cropPreset, filterPreset]);
  const hasLiveVideoPreview = Boolean(previewVideoUri);
  const previewImageUri = useMemo(() => {
    if (uploadMediaType !== "image") return "";
    if (imageMedia?.uri) return imageMedia.uri;

    const baseImage = editingItem?.sourceImageUrl?.trim() || editingItem?.imageUrl?.trim() || "";
    if (!baseImage) return "";
    return buildCloudinaryEditedUrl(baseImage, { cropPreset, filterPreset });
  }, [uploadMediaType, imageMedia?.uri, editingItem, cropPreset, filterPreset]);
  const videoDurationSec = useMemo(
    () => (video?.durationMs ? Math.max(0, video.durationMs / 1000) : 0),
    [video?.durationMs]
  );
  const savedVideoDurationSec = useMemo(
    () => Math.max(0, Number(editingItem?.videoDurationSec ?? 0) || 0),
    [editingItem?.videoDurationSec]
  );
  const effectiveVideoDurationSec = useMemo(
    () => Math.max(videoDurationSec, detectedPreviewDurationSec, savedVideoDurationSec),
    [videoDurationSec, detectedPreviewDurationSec, savedVideoDurationSec]
  );
  const clipDurationSec = useMemo(
    () => Math.max(0, Number((clipEndSec - clipStartSec).toFixed(2))),
    [clipEndSec, clipStartSec]
  );
  const hasVideoClipError =
    uploadMediaType === "video" &&
    hasLiveVideoPreview &&
    (clipDurationSec < 1 ||
      clipDurationSec > MAX_VIDEO_SECONDS ||
      clipStartSec < 0 ||
      clipEndSec <= clipStartSec ||
      (effectiveVideoDurationSec > 0 && clipEndSec > effectiveVideoDurationSec + 0.001));

  const onPreviewStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded || uploadMediaType !== "video" || !hasLiveVideoPreview) return;
      if (typeof status.durationMillis === "number" && Number.isFinite(status.durationMillis) && status.durationMillis > 0) {
        const nextDurationSec = status.durationMillis / 1000;
        setDetectedPreviewDurationSec((prev) => (Math.abs(prev - nextDurationSec) > 0.05 ? nextDurationSec : prev));
      }
      if (previewSeekingRef.current) return;

      const minStartSec = Math.max(0, clipStartSec);
      const maxEndSec = Math.max(minStartSec + 0.25, clipEndSec);
      const endMs = maxEndSec * 1000;
      if (!status.didJustFinish && status.positionMillis < endMs - 90) return;

      previewSeekingRef.current = true;
      previewVideoRef.current
        ?.setPositionAsync(minStartSec * 1000)
        .then(() => previewVideoRef.current?.playAsync())
        .catch(() => null)
        .finally(() => {
          previewSeekingRef.current = false;
        });
    },
    [uploadMediaType, hasLiveVideoPreview, clipStartSec, clipEndSec]
  );

  useEffect(() => {
    if (!hasLiveVideoPreview || uploadMediaType !== "video") return;
    const targetMs = Math.max(0, clipStartSec * 1000);

    const timer = setTimeout(() => {
      previewVideoRef.current
        ?.setPositionAsync(targetMs)
        .then(() => previewVideoRef.current?.playAsync())
        .catch(() => null);
    }, 120);

    return () => clearTimeout(timer);
  }, [hasLiveVideoPreview, uploadMediaType, previewVideoUri, clipStartSec, clipEndSec, uploadStep]);

  useEffect(() => {
    if (uploadMediaType !== "video") return;

    const totalDuration = effectiveVideoDurationSec > 0 ? effectiveVideoDurationSec : MAX_VIDEO_SECONDS;
    const maxStart = Math.max(0, totalDuration - 1);
    let nextStart = clamp(clipStartSec, 0, maxStart);
    let nextEnd = clamp(clipEndSec, nextStart + 1, totalDuration);

    if (nextEnd - nextStart > MAX_VIDEO_SECONDS) {
      nextEnd = clamp(nextStart + MAX_VIDEO_SECONDS, nextStart + 1, totalDuration);
    }

    if (Math.abs(nextStart - clipStartSec) > 0.001) {
      setClipStartSec(roundToTenth(nextStart));
    }
    if (Math.abs(nextEnd - clipEndSec) > 0.001) {
      setClipEndSec(roundToTenth(nextEnd));
    }

    if (totalDuration > MAX_VIDEO_SECONDS) {
      setVideoLengthWarning(
        `Deze video is ${totalDuration.toFixed(1)}s. Kies hieronder een clip van max ${MAX_VIDEO_SECONDS}s.`
      );
    } else {
      setVideoLengthWarning(null);
    }
  }, [uploadMediaType, effectiveVideoDurationSec, clipStartSec, clipEndSec]);

  const submitLabel = editingPostId ? "Wijzigingen opslaan" : "Upload plaatsen";
  const canSubmit = useMemo(() => {
    if (uploading) return false;
    if (title.trim().length < 2) return false;
    if (!editingPostId && !video && !imageMedia) return false;
    if (hasVideoClipError) return false;
    return true;
  }, [uploading, title, editingPostId, video, imageMedia, hasVideoClipError]);

  const refreshPermissionStates = useCallback(async () => {
    const libraryState = await getMediaLibraryPermissionState().catch(
      () => "undetermined" as PermissionState
    );
    setLibraryPermission(libraryState);
  }, []);

  useEffect(() => {
    refreshPermissionStates().catch(() => null);
  }, [refreshPermissionStates]);

  useEffect(() => {
    return subscribeAuth((user) => {
      setUid(user?.uid ?? null);
    });
  }, []);

  const load = useCallback(async () => {
    if (!uid) {
      setItems([]);
      setServices([]);
      setLikesByPost({});
      setLoadingLibrary(false);
      return;
    }

    setLoadingLibrary(true);
    try {
      const [posts, companyServices] = await Promise.all([fetchMyFeedPosts(uid), fetchMyServices(uid)]);

      const onlyActiveServices = companyServices.filter((service) => service.isActive);
      setItems(posts);
      setServices(onlyActiveServices);
      setSelectedServiceId((prev) => (prev && onlyActiveServices.some((service) => service.id === prev) ? prev : ""));

      const likesPairs = await Promise.all(
        posts.map(async (post) => {
          const likes = await getPostLikeCount(post.id).catch(() => 0);
          return [post.id, likes] as const;
        })
      );
      const nextLikes: Record<string, number> = {};
      likesPairs.forEach(([postId, likes]) => {
        nextLikes[postId] = likes;
      });
      setLikesByPost(nextLikes);
    } finally {
      setLoadingLibrary(false);
    }
  }, [uid]);

  useEffect(() => {
    load().catch(() => null);
  }, [load]);

  useEffect(() => {
    tabOpacity.setValue(0);
    Animated.timing(tabOpacity, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [studioTab, tabOpacity]);

  useEffect(() => {
    if (studioTab !== "upload" && uploadComposerVisible) {
      setUploadComposerVisible(false);
    }
  }, [studioTab, uploadComposerVisible]);

  useEffect(() => {
    if (studioTab !== "upload") {
      uploadComposerAutoOpenedRef.current = false;
      return;
    }
    if (uploadComposerVisible || uploadComposerAutoOpenedRef.current) return;
    uploadComposerAutoOpenedRef.current = true;
    setUploadComposerVisible(true);
  }, [studioTab, uploadComposerVisible]);

  useEffect(() => {
    if (!uploadStatusText) return;
    const timer = setTimeout(() => setUploadStatusText(""), 4200);
    return () => clearTimeout(timer);
  }, [uploadStatusText]);

  function resetForm() {
    setCategory(CATEGORIES[0]);
    setTitle("");
    setDescription("");
    setHashtagsInput("");
    setSelectedServiceId("");
    setVisibility("public");
    setUploadMediaType("video");
    setVideo(null);
    setImageMedia(null);
    setCropPreset(DEFAULT_CROP_PRESET);
    setFilterPreset(DEFAULT_FILTER_PRESET);
    setClipStartSec(0);
    setClipEndSec(MAX_VIDEO_SECONDS);
    setDetectedPreviewDurationSec(0);
    setStartRailWidth(0);
    setEndRailWidth(0);
    setUploadStep("select");
    setVideoLengthWarning(null);
    setEditingPostId(null);
    setRefreshingAfterUpload(false);
    setPostingStory(false);
  }

  function applyEditForm(post: FeedPost) {
    const nextClipStart = Math.max(0, Number(post.clipStartSec ?? 0) || 0);
    const rawClipEnd = Math.max(0, Number(post.clipEndSec ?? 0) || 0);
    const nextClipEnd = rawClipEnd > nextClipStart ? rawClipEnd : nextClipStart + MAX_VIDEO_SECONDS;

    setEditingPostId(post.id);
    setCategory(post.category || CATEGORIES[0]);
    setTitle(post.title ?? "");
    setDescription(post.caption ?? "");
    setHashtagsInput(formatHashtags(post.hashtags));
    setSelectedServiceId(post.serviceId ?? "");
    setVisibility(post.visibility === "clients_only" || !post.isActive ? "clients" : "public");
    setUploadMediaType(post.mediaType === "image" ? "image" : "video");
    setCropPreset(DEFAULT_CROP_PRESET);
    setFilterPreset(post.filterPreset ?? DEFAULT_FILTER_PRESET);
    setVideo(null);
    setImageMedia(null);
    setClipStartSec(nextClipStart);
    setClipEndSec(nextClipEnd);
    setDetectedPreviewDurationSec(Math.max(0, Number(post.videoDurationSec ?? 0) || 0));
    setStartRailWidth(0);
    setEndRailWidth(0);
    setUploadStep("details");
    setVideoLengthWarning(null);
    setStudioTab("upload");
    setUploadComposerVisible(true);
    setDetailPostId(null);
  }

  function applyPickedMedia(picked: PickedMedia, kind: "video" | "image") {
    setCropPreset(DEFAULT_CROP_PRESET);
    if (kind === "image") {
      setUploadMediaType("image");
      setVideo(null);
      setImageMedia(picked);
      setClipStartSec(0);
      setClipEndSec(0);
      setDetectedPreviewDurationSec(0);
      setStartRailWidth(0);
      setEndRailWidth(0);
      setVideoLengthWarning(null);
      setUploadStep("select");
      return;
    }

    const durationSec = picked.durationMs ? Math.max(0, picked.durationMs / 1000) : 0;
    const defaultEnd = durationSec > 0 ? Math.min(durationSec, MAX_VIDEO_SECONDS) : MAX_VIDEO_SECONDS;
    setUploadMediaType("video");
    setImageMedia(null);
    setVideo(picked);
    setClipStartSec(0);
    setClipEndSec(defaultEnd);
    setDetectedPreviewDurationSec(durationSec);
    setStartRailWidth(0);
    setEndRailWidth(0);
    setUploadStep("select");
    if (durationSec > MAX_VIDEO_SECONDS) {
      setVideoLengthWarning(
        `Deze video is ${durationSec.toFixed(1)}s. Kies hieronder een clip van max ${MAX_VIDEO_SECONDS}s.`
      );
    } else {
      setVideoLengthWarning(null);
    }
  }

  function setClipStartFromRatio(ratioRaw: number) {
    const totalDuration = effectiveVideoDurationSec || MAX_VIDEO_SECONDS;
    const ratio = clamp(ratioRaw, 0, 1);
    const maxStart = Math.max(0, totalDuration - 1);
    const nextStart = roundToTenth(ratio * maxStart);
    const currentDuration = Math.max(1, clipEndSec - clipStartSec);
    let nextEnd = nextStart + currentDuration;

    if (nextEnd - nextStart > MAX_VIDEO_SECONDS) {
      nextEnd = nextStart + MAX_VIDEO_SECONDS;
    }
    if (nextEnd > totalDuration) {
      nextEnd = totalDuration;
    }
    if (nextEnd <= nextStart) {
      nextEnd = Math.min(totalDuration, nextStart + 1);
    }

    setClipStartSec(roundToTenth(nextStart));
    setClipEndSec(roundToTenth(nextEnd));
  }

  function setClipEndFromRatio(ratioRaw: number) {
    const totalDuration = effectiveVideoDurationSec || MAX_VIDEO_SECONDS;
    const ratio = clamp(ratioRaw, 0, 1);
    const maxEnd = Math.min(totalDuration, clipStartSec + MAX_VIDEO_SECONDS);
    const targetEnd = roundToTenth(ratio * totalDuration);
    const nextEnd = clamp(targetEnd, clipStartSec + 1, maxEnd);
    setClipEndSec(roundToTenth(nextEnd));
  }

  function nudgeClipStart(deltaSec: number) {
    const totalDuration = Math.max(1, effectiveVideoDurationSec || MAX_VIDEO_SECONDS);
    const maxStart = Math.max(0, totalDuration - 1);
    const nextStart = clamp(roundToTenth(clipStartSec + deltaSec), 0, maxStart);

    let nextEnd = clipEndSec;
    if (nextEnd - nextStart > MAX_VIDEO_SECONDS) {
      nextEnd = nextStart + MAX_VIDEO_SECONDS;
    }
    if (nextEnd <= nextStart) {
      nextEnd = Math.min(totalDuration, nextStart + 1);
    }
    if (nextEnd > totalDuration) {
      nextEnd = totalDuration;
    }

    setClipStartSec(roundToTenth(nextStart));
    setClipEndSec(roundToTenth(Math.max(nextStart + 1, nextEnd)));
  }

  function nudgeClipEnd(deltaSec: number) {
    const totalDuration = Math.max(1, effectiveVideoDurationSec || MAX_VIDEO_SECONDS);
    const minEnd = Math.max(1, clipStartSec + 1);
    const maxEnd = Math.min(totalDuration, clipStartSec + MAX_VIDEO_SECONDS);
    if (maxEnd <= minEnd) {
      setClipEndSec(roundToTenth(minEnd));
      return;
    }
    const nextEnd = clamp(roundToTenth(clipEndSec + deltaSec), minEnd, maxEnd);
    setClipEndSec(roundToTenth(nextEnd));
  }

  function closeUploadComposer() {
    if (uploading || postingStory) return;
    if (uploadStep === "details") {
      setUploadStep("select");
      return;
    }
    setUploadComposerVisible(false);
  }

  async function executeMediaAction(action: PendingMediaAction) {
    if (action !== "library") return;
    const picked = await pickAnyMediaFromLibrary({ maxDurationMs: 0 });
    if (!picked) return;
    applyPickedMedia(picked, picked.kind);
  }

  function needsPermissionForAction(action: PendingMediaAction): boolean {
    if (action !== "library") return false;
    return libraryPermission !== "granted";
  }

  function openActionWithPermission(action: PendingMediaAction) {
    if (Platform.OS === "web") {
      executeMediaAction(action).catch((error: any) => {
        Alert.alert("Media kiezen mislukt", error?.message ?? "Kon media niet openen.");
      });
      return;
    }
    if (needsPermissionForAction(action)) {
      setPendingMediaAction(action);
      return;
    }
    executeMediaAction(action).catch(() => null);
  }

  async function onGrantPendingPermission() {
    if (!pendingMediaAction) return;

    const granted = await requestMediaLibraryPermission();
    await refreshPermissionStates();

    if (!granted) {
      Alert.alert(
        "Toegang nodig",
        "Zonder galerij-toegang kun je geen media kiezen."
      );
      return;
    }

    const nextAction = pendingMediaAction;
    setPendingMediaAction(null);
    executeMediaAction(nextAction).catch(() => null);
  }

  function getActiveMediaType(): UploadMediaType {
    if (imageMedia) return "image";
    if (video) return "video";
    return uploadMediaType;
  }

  async function uploadCurrentMediaIfNeeded(
    companyId: string,
    targetMediaType: UploadMediaType
  ): Promise<{ sourceVideoUrl: string; sourceImageUrl: string }> {
    let sourceVideoUrl = String(editingItem?.sourceVideoUrl ?? editingItem?.videoUrl ?? "").trim();
    let sourceImageUrl = String(editingItem?.sourceImageUrl ?? editingItem?.imageUrl ?? "").trim();

    if (targetMediaType === "video" && video) {
      sourceVideoUrl = await uploadUriToStorage(
        `companies/${companyId}/feed/${Date.now()}-${video.fileName}`,
        video.uri,
        video.mimeType,
        video.webFile
      );
      sourceImageUrl = "";
    }

    if (targetMediaType === "image" && imageMedia) {
      sourceImageUrl = await uploadUriToStorage(
        `companies/${companyId}/feed/${Date.now()}-${imageMedia.fileName}`,
        imageMedia.uri,
        imageMedia.mimeType,
        imageMedia.webFile
      );
      sourceVideoUrl = "";
    }

    return { sourceVideoUrl, sourceImageUrl };
  }

  async function onPostStory() {
    if (!uid) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om een story te plaatsen.");
      return;
    }

    if (postingStory || uploading) return;

    const selectedMediaType = getActiveMediaType();
    if (selectedMediaType === "video" && !previewVideoUri && !video && !editingItem) {
      Alert.alert("Media ontbreekt", "Kies eerst een video of foto.");
      return;
    }
    if (selectedMediaType === "image" && !previewImageUri && !imageMedia && !editingItem) {
      Alert.alert("Media ontbreekt", "Kies eerst een video of foto.");
      return;
    }
    if (selectedMediaType === "video" && hasVideoClipError) {
      Alert.alert("Clip niet geldig", `Kies een videosegment van 1s tot ${MAX_VIDEO_SECONDS}s.`);
      return;
    }

    setPostingStory(true);
    setUploadStatusText("Story wordt geplaatst...");

    try {
      const safeCropPreset: MediaCropPreset = DEFAULT_CROP_PRESET;
      const { sourceVideoUrl, sourceImageUrl } = await uploadCurrentMediaIfNeeded(uid, selectedMediaType);
      const storyVideoUrl =
        selectedMediaType === "video"
          ? buildCloudinaryEditedUrl(sourceVideoUrl, { cropPreset: safeCropPreset, filterPreset })
          : "";
      const storyImageUrl =
        selectedMediaType === "image"
          ? buildCloudinaryEditedUrl(sourceImageUrl, { cropPreset: safeCropPreset, filterPreset })
          : "";
      const storyThumbnail =
        selectedMediaType === "video" ? cloudinaryVideoThumbnailFromUrl(storyVideoUrl) : storyImageUrl;

      await addCompanyStory(uid, {
        mediaType: selectedMediaType,
        videoUrl: storyVideoUrl,
        imageUrl: storyImageUrl,
        thumbnailUrl: storyThumbnail || undefined,
        title: title.trim(),
        caption: description.trim(),
        clipStartSec: selectedMediaType === "video" ? clipStartSec : 0,
        clipEndSec: selectedMediaType === "video" ? clipEndSec : 0,
      });

      setUploadStatusText("Story geplaatst (24 uur zichtbaar).");
    } catch (error: any) {
      setUploadStatusText("");
      Alert.alert("Story mislukt", error?.message ?? "Kon story niet plaatsen.");
    } finally {
      setPostingStory(false);
    }
  }

  async function onSubmit() {
    if (!uid) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om te uploaden of wijzigen.");
      return;
    }

    if (title.trim().length < 2) {
      Alert.alert("Titel ontbreekt", "Geef je video een duidelijke titel.");
      return;
    }

    const selectedMediaType = getActiveMediaType();
    const hasSelectedMedia =
      selectedMediaType === "video"
        ? Boolean(
            previewVideoUri ||
              video?.uri ||
              (editingItem?.mediaType === "video" &&
                (editingItem.sourceVideoUrl?.trim() || editingItem.videoUrl?.trim()))
          )
        : Boolean(
            previewImageUri ||
              imageMedia?.uri ||
              (editingItem?.mediaType === "image" &&
                (editingItem.sourceImageUrl?.trim() || editingItem.imageUrl?.trim()))
          );

    if (!editingPostId && !hasSelectedMedia) {
      Alert.alert("Media ontbreekt", "Kies eerst een video of foto om te uploaden.");
      return;
    }
    if (selectedMediaType === "video" && hasVideoClipError) {
      Alert.alert("Clip niet geldig", `Kies een videosegment van minimaal 1s en maximaal ${MAX_VIDEO_SECONDS}s.`);
      return;
    }

    setUploading(true);
    setUploadStatusText(editingPostId ? "Wijzigingen worden opgeslagen..." : "Upload wordt geplaatst...");

    try {
      const safeCropPreset: MediaCropPreset = DEFAULT_CROP_PRESET;
      const nextVisibility = visibility === "public" ? "public" : "clients_only";
      const nextIsActive = visibility === "public";
      const serviceName = selectedService?.name ?? "";
      const { sourceVideoUrl, sourceImageUrl } = await uploadCurrentMediaIfNeeded(uid, selectedMediaType);
      const fallbackVideoDurationSec = Math.max(
        clipEndSec,
        Number(editingItem?.videoDurationSec ?? clipEndSec) || clipEndSec
      );
      const nextVideoUrl =
        selectedMediaType === "video"
          ? buildCloudinaryEditedUrl(sourceVideoUrl, { cropPreset: safeCropPreset, filterPreset })
          : "";
      const nextImageUrl =
        selectedMediaType === "image"
          ? buildCloudinaryEditedUrl(sourceImageUrl, { cropPreset: safeCropPreset, filterPreset })
          : "";
      const nextThumbUrl =
        selectedMediaType === "video" ? cloudinaryVideoThumbnailFromUrl(nextVideoUrl) : nextImageUrl;

      if (selectedMediaType === "video" && !nextVideoUrl) {
        throw new Error("Video ontbreekt.");
      }
      if (selectedMediaType === "image" && !nextImageUrl) {
        throw new Error("Foto ontbreekt.");
      }

      if (editingPostId) {
        await updateMyFeedPost(editingPostId, {
          category,
          title: title.trim(),
          caption: description.trim(),
          hashtags,
          serviceId: selectedServiceId,
          serviceName,
          visibility: nextVisibility,
          isActive: nextIsActive,
          mediaType: selectedMediaType,
          videoUrl: selectedMediaType === "video" ? nextVideoUrl : "",
          imageUrl: selectedMediaType === "image" ? nextImageUrl : "",
          thumbnailUrl: nextThumbUrl || undefined,
          sourceVideoUrl: selectedMediaType === "video" ? sourceVideoUrl : "",
          sourceImageUrl: selectedMediaType === "image" ? sourceImageUrl : "",
          cropPreset: safeCropPreset,
          filterPreset,
          ...(selectedMediaType === "video"
            ? {
                clipStartSec: clipStartSec,
                clipEndSec: clipEndSec,
                videoDurationSec: Math.max(effectiveVideoDurationSec, fallbackVideoDurationSec),
              }
            : {}),
          ...(selectedMediaType === "image"
            ? {
                clipStartSec: 0,
                clipEndSec: 0,
                videoDurationSec: 0,
              }
            : {}),
        });

        setUploadStatusText("Wijzigingen opgeslagen.");
      } else {
        await addMyFeedPost(uid, {
          category,
          title: title.trim(),
          caption: description.trim(),
          hashtags,
          serviceId: selectedServiceId,
          serviceName,
          visibility: nextVisibility,
          isActive: nextIsActive,
          mediaType: selectedMediaType,
          videoUrl: nextVideoUrl,
          imageUrl: nextImageUrl,
          thumbnailUrl: nextThumbUrl || undefined,
          sourceVideoUrl: selectedMediaType === "video" ? sourceVideoUrl : "",
          sourceImageUrl: selectedMediaType === "image" ? sourceImageUrl : "",
          cropPreset: safeCropPreset,
          filterPreset,
          clipStartSec: selectedMediaType === "video" ? clipStartSec : 0,
          clipEndSec: selectedMediaType === "video" ? clipEndSec : 0,
          videoDurationSec:
            selectedMediaType === "video" ? Math.max(effectiveVideoDurationSec, clipEndSec) : 0,
          viewCount: 0,
        });

        setUploadStatusText("Upload geplaatst.");
      }

      resetForm();
      setUploadComposerVisible(false);
      setStudioTab("videos");
      setRefreshingAfterUpload(true);
      void load()
        .catch(() => null)
        .finally(() => setRefreshingAfterUpload(false));
    } catch (error: any) {
      setUploadStatusText("");
      Alert.alert("Upload mislukt", error?.message ?? "Kon post niet opslaan.");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(postId: string) {
    if (busyPostId) return;
    const confirmed = await confirmAction({
      title: "Video verwijderen",
      message: "Weet je zeker dat je deze video wilt verwijderen?",
      confirmText: "Verwijderen",
      cancelText: "Annuleren",
      destructive: true,
    });
    if (!confirmed) return;

    setBusyPostId(postId);
    try {
      await deleteMyFeedPost(postId);
      if (editingPostId === postId) resetForm();
      if (detailPostId === postId) setDetailPostId(null);
      await load();
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon video niet verwijderen.");
    } finally {
      setBusyPostId(null);
    }
  }

  async function onTogglePublish(post: FeedPost, nextActive: boolean) {
    if (busyPostId) return;
    setBusyPostId(post.id);
    try {
      await updateMyFeedPost(post.id, {
        isActive: nextActive,
        visibility: nextActive ? "public" : "clients_only",
      });
      await load();
    } catch (error: any) {
      Alert.alert("Fout", error?.message ?? "Kon status niet wijzigen.");
    } finally {
      setBusyPostId(null);
    }
  }

  function renderUploadTab() {
    const selectedMediaType = getActiveMediaType();
    const hasSelectedMedia =
      selectedMediaType === "video"
        ? Boolean(previewVideoUri || video?.uri || editingItem?.videoUrl || editingItem?.sourceVideoUrl)
        : Boolean(previewImageUri || imageMedia?.uri || editingItem?.imageUrl || editingItem?.sourceImageUrl);

    return (
      <View style={styles.uploadLandingWrap}>
        <View style={styles.uploadLandingCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Fullscreen upload</Text>
          </View>
          <Text style={styles.uploadLandingText}>
            Open de upload editor op volledig scherm. Kies media, kort video in op dezelfde pagina en ga daarna door naar titel en omschrijving.
          </Text>
          {hasSelectedMedia ? (
            <View style={styles.uploadLandingHintRow}>
              <Ionicons
                name={selectedMediaType === "video" ? "videocam-outline" : "image-outline"}
                size={14}
                color={COLORS.primary}
              />
              <Text style={styles.uploadLandingHintText}>
                {selectedMediaType === "video"
                  ? `Video klaar · ${formatClipRange(clipStartSec, clipEndSec)}`
                  : "Foto klaar voor upload"}
              </Text>
            </View>
          ) : null}
          <Pressable style={styles.uploadLandingPrimaryBtn} onPress={() => setUploadComposerVisible(true)}>
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.uploadLandingPrimaryText}>
              {editingPostId ? "Ga verder met bewerken" : "Open upload"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderUploadComposer() {
    const selectedVideoDurationSec =
      effectiveVideoDurationSec > 0
        ? effectiveVideoDurationSec
        : Math.max(clipEndSec, Number(editingItem?.videoDurationSec ?? clipEndSec) || clipEndSec);
    const hasSelectedVideo = uploadMediaType === "video" && Boolean(previewVideoUri);
    const hasSelectedImage = uploadMediaType === "image" && Boolean(previewImageUri);
    const hasSelectedMedia = hasSelectedVideo || hasSelectedImage;
    const canContinue = hasSelectedMedia && (uploadMediaType !== "video" || !hasVideoClipError);
    const safeDurationForUi = Math.max(
      selectedVideoDurationSec,
      clipEndSec,
      clipStartSec + clipDurationSec,
      0.1
    );
    const clipStartPercent = Math.max(0, Math.min(100, (clipStartSec / safeDurationForUi) * 100));
    const clipEndPercent = Math.max(0, Math.min(100, (clipEndSec / safeDurationForUi) * 100));
    const clipWidthPercent = Math.max(2, Math.min(100 - clipStartPercent, (clipDurationSec / safeDurationForUi) * 100));
    const storyBusy = postingStory || uploading;

    return (
      <SafeAreaView style={styles.uploadComposerScreen} edges={["top", "bottom"]}>
        <View style={styles.uploadComposerTopBar}>
          <Pressable style={styles.uploadComposerBackBtn} onPress={closeUploadComposer}>
            <Ionicons name="chevron-back-outline" size={18} color="#fff" />
            <Text style={styles.uploadComposerBackText}>
              {uploadStep === "details" ? "Preview" : "Terug"}
            </Text>
          </Pressable>
          <View style={styles.uploadComposerStepPill}>
            <Text style={styles.uploadComposerStepText}>{uploadStep === "select" ? "1/2" : "2/2"}</Text>
          </View>
        </View>

        {uploadStep === "select" ? (
          <View style={styles.uploadComposerPreview}>
            {hasSelectedVideo ? (
              <Video
                ref={previewVideoRef}
                source={{ uri: previewVideoUri }}
                style={styles.uploadComposerMedia}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                isMuted
                isLooping={false}
                onPlaybackStatusUpdate={onPreviewStatusUpdate}
              />
            ) : hasSelectedImage ? (
              <Image source={{ uri: previewImageUri }} style={styles.uploadComposerMedia} contentFit="contain" />
            ) : (
              <Pressable style={styles.uploadComposerEmpty} onPress={() => openActionWithPermission("library")}>
                <Ionicons name="cloud-upload-outline" size={50} color="#fff" />
                <Text style={styles.uploadComposerEmptyTitle}>Druk hier om te uploaden</Text>
                <Text style={styles.uploadComposerEmptyText}>Kies een video of foto uit je galerij</Text>
              </Pressable>
            )}

            <View style={styles.uploadComposerBottomPanel}>
              {!hasSelectedMedia ? (
                <Pressable style={styles.uploadComposerPrimaryBtn} onPress={() => openActionWithPermission("library")}>
                  <Ionicons name="cloud-upload-outline" size={17} color="#fff" />
                  <Text style={styles.uploadComposerPrimaryText}>Upload media</Text>
                </Pressable>
              ) : (
                <>
                  <View style={styles.uploadComposerInfoRow}>
                    <Ionicons
                      name={uploadMediaType === "video" ? "videocam-outline" : "image-outline"}
                      size={15}
                      color="#fff"
                    />
                    <Text style={styles.uploadComposerInfoText}>
                      {uploadMediaType === "video"
                        ? `Clip ${formatClipRange(clipStartSec, clipEndSec)}`
                        : "Foto in volledige preview"}
                    </Text>
                  </View>

                  {uploadMediaType === "video" ? (
                    <>
                      <View style={styles.uploadComposerTrimHeader}>
                        <Text style={styles.uploadComposerTrimTitle}>Kort je video in</Text>
                        <Text style={styles.uploadComposerTrimMeta}>
                          {clipDurationSec.toFixed(1)}s van {selectedVideoDurationSec > 0 ? selectedVideoDurationSec.toFixed(1) : "--"}s
                        </Text>
                      </View>

                      <View style={styles.uploadEditorTimelineRail}>
                        <View
                          style={[
                            styles.uploadEditorTimelineWindow,
                            {
                              marginLeft: `${clipStartPercent}%`,
                              width: `${clipWidthPercent}%`,
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.trimDirectRow}>
                        <Text style={styles.trimDirectLabel}>Start: {clipStartSec.toFixed(1)}s</Text>
                        <Pressable
                          style={styles.trimTapRail}
                          onLayout={(event) => setStartRailWidth(event.nativeEvent.layout.width)}
                          onPress={(event) => {
                            const ratio = event.nativeEvent.locationX / Math.max(1, startRailWidth);
                            setClipStartFromRatio(ratio);
                          }}
                        >
                          <View
                            style={[styles.trimTapFill, { width: `${Math.max(2, Math.min(100, clipStartPercent))}%` }]}
                          />
                          <View style={[styles.trimTapThumb, { left: `${clipStartPercent}%` }]} />
                        </Pressable>
                        <View style={styles.trimNudgeRow}>
                          <Pressable style={styles.trimNudgeBtn} onPress={() => nudgeClipStart(-0.5)}>
                            <Text style={styles.trimNudgeBtnText}>-0.5s</Text>
                          </Pressable>
                          <Pressable style={styles.trimNudgeBtn} onPress={() => nudgeClipStart(0.5)}>
                            <Text style={styles.trimNudgeBtnText}>+0.5s</Text>
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.trimDirectRow}>
                        <Text style={styles.trimDirectLabel}>Eind: {clipEndSec.toFixed(1)}s</Text>
                        <Pressable
                          style={styles.trimTapRail}
                          onLayout={(event) => setEndRailWidth(event.nativeEvent.layout.width)}
                          onPress={(event) => {
                            const ratio = event.nativeEvent.locationX / Math.max(1, endRailWidth);
                            setClipEndFromRatio(ratio);
                          }}
                        >
                          <View
                            style={[
                              styles.trimTapFill,
                              { width: `${Math.max(2, Math.min(100, clipEndPercent))}%` },
                            ]}
                          />
                          <View style={[styles.trimTapThumb, { left: `${clipEndPercent}%` }]} />
                        </Pressable>
                        <View style={styles.trimNudgeRow}>
                          <Pressable style={styles.trimNudgeBtn} onPress={() => nudgeClipEnd(-0.5)}>
                            <Text style={styles.trimNudgeBtnText}>-0.5s</Text>
                          </Pressable>
                          <Pressable style={styles.trimNudgeBtn} onPress={() => nudgeClipEnd(0.5)}>
                            <Text style={styles.trimNudgeBtnText}>+0.5s</Text>
                          </Pressable>
                        </View>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.uploadComposerTrimMeta}>Deze foto wordt direct als volledige preview gebruikt.</Text>
                  )}

                  {hasVideoClipError ? (
                    <View style={styles.trimErrorCard}>
                      <Ionicons name="alert-circle-outline" size={13} color={COLORS.danger} />
                      <Text style={styles.trimErrorText}>Kies een clip van 1 tot {MAX_VIDEO_SECONDS} seconden.</Text>
                    </View>
                  ) : null}

                  {videoLengthWarning ? (
                    <View style={styles.warningCardDark}>
                      <Ionicons name="alert-circle-outline" size={14} color="#ff8da8" />
                      <Text style={styles.warningTextDark}>{videoLengthWarning}</Text>
                    </View>
                  ) : null}

                  <View style={styles.uploadComposerActionsRow}>
                    <Pressable style={styles.uploadGhostDarkBtn} onPress={() => openActionWithPermission("library")}>
                      <Ionicons name="images-outline" size={15} color="#fff" />
                      <Text style={styles.uploadGhostDarkBtnText}>Andere media</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.uploadStoryBtn, (storyBusy || !canContinue) && styles.disabled]}
                      onPress={() => onPostStory().catch(() => null)}
                      disabled={storyBusy || !canContinue}
                    >
                      {postingStory ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Ionicons name="sparkles-outline" size={15} color="#fff" />
                      )}
                      <Text style={styles.uploadStoryBtnText}>{postingStory ? "Plaatsen..." : "Jouw story"}</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.nextStepBtn, !canContinue && styles.disabled]}
                      onPress={() => setUploadStep("details")}
                      disabled={!canContinue}
                    >
                      <Ionicons name="arrow-forward-outline" size={15} color="#fff" />
                      <Text style={styles.nextStepText}>Volgende</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.uploadComposerDetailsWrap}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={24}
          >
            <ScrollView
              contentContainerStyle={styles.uploadComposerDetailsContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            >
              <View>
                <Text style={styles.uploadFlowTitle}>Bijna klaar</Text>
                <Text style={styles.uploadFlowSubTitle}>Voeg titel, omschrijving en instellingen toe</Text>
              </View>

              <View style={styles.uploadTypePill}>
                <Ionicons
                  name={uploadMediaType === "video" ? "videocam-outline" : "image-outline"}
                  size={14}
                  color={COLORS.primary}
                />
                <Text style={styles.uploadTypePillText}>
                  {uploadMediaType === "video" ? `Video geselecteerd · ${clipDurationSec.toFixed(1)}s` : "Foto geselecteerd"}
                </Text>
              </View>

              <View style={styles.uploadDetailsFormCard}>
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Titel</Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Geef je upload een duidelijke titel"
                    placeholderTextColor={INPUT_HINT_COLOR}
                    style={styles.input}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Omschrijving</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Wat laat je in deze upload zien?"
                    placeholderTextColor={INPUT_HINT_COLOR}
                    style={[styles.input, styles.textarea]}
                    multiline
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Categorie</Text>
                  <CategoryChips items={[...CATEGORIES]} active={category} onChange={setCategory} iconMap={categoryIcons} />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Tags</Text>
                  <TextInput
                    value={hashtagsInput}
                    onChangeText={setHashtagsInput}
                    placeholder="#balayage #nails #lashlift"
                    placeholderTextColor={INPUT_HINT_COLOR}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                  <Text style={styles.fieldHint}>{hashtags.length}/{MAX_HASHTAGS} tags</Text>
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Service koppelen (optioneel)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceRow}>
                    <Pressable
                      style={[styles.serviceChip, !selectedServiceId && styles.serviceChipActive]}
                      onPress={() => setSelectedServiceId("")}
                    >
                      <Text style={[styles.serviceChipText, !selectedServiceId && styles.serviceChipTextActive]}>Geen koppeling</Text>
                    </Pressable>
                    {activeServices.map((service) => {
                      const active = selectedServiceId === service.id;
                      return (
                        <Pressable
                          key={service.id}
                          style={[styles.serviceChip, active && styles.serviceChipActive]}
                          onPress={() => setSelectedServiceId(service.id)}
                        >
                          <Text style={[styles.serviceChipText, active && styles.serviceChipTextActive]}>{service.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Filter (optioneel)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceRow}>
                    {FILTER_OPTIONS.map((option) => {
                      const active = filterPreset === option.key;
                      return (
                        <Pressable
                          key={option.key}
                          style={[styles.serviceChip, active && styles.serviceChipActive]}
                          onPress={() => setFilterPreset(option.key)}
                        >
                          <Text style={[styles.serviceChipText, active && styles.serviceChipTextActive]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Zichtbaarheid</Text>
                  <View style={styles.visibilityRow}>
                    <Pressable
                      style={[styles.visibilityBtn, visibility === "public" && styles.visibilityBtnActive]}
                      onPress={() => setVisibility("public")}
                    >
                      <Ionicons
                        name="globe-outline"
                        size={14}
                        color={visibility === "public" ? "#fff" : COLORS.primary}
                      />
                      <Text style={[styles.visibilityText, visibility === "public" && styles.visibilityTextActive]}>Publiek</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.visibilityBtn, visibility === "clients" && styles.visibilityBtnActive]}
                      onPress={() => setVisibility("clients")}
                    >
                      <Ionicons
                        name="people-outline"
                        size={14}
                        color={visibility === "clients" ? "#fff" : COLORS.primary}
                      />
                      <Text style={[styles.visibilityText, visibility === "clients" && styles.visibilityTextActive]}>Alleen klanten</Text>
                    </Pressable>
                  </View>
                </View>

                <Pressable style={[styles.submitBtn, !canSubmit && styles.disabled]} onPress={onSubmit} disabled={!canSubmit}>
                  {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="rocket-outline" size={16} color="#fff" />}
                  <Text style={styles.submitText}>{uploading ? "Bezig met uploaden..." : submitLabel}</Text>
                </Pressable>

                {editingPostId ? (
                  <View style={styles.editActionsRow}>
                    <Pressable style={styles.ghostBtn} onPress={resetForm}>
                      <Ionicons name="close-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.ghostBtnText}>Annuleer bewerken</Text>
                    </Pressable>
                    <Pressable style={styles.deleteGhostBtn} onPress={() => onDelete(editingPostId)}>
                      <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                      <Text style={styles.deleteGhostText}>Verwijder</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    );
  }


  function renderVideoCard(item: FeedPost) {
    const thumbnail = getPostThumbnail(item);
    const likes = likesByPost[item.id] ?? 0;
    const views = item.viewCount ?? 0;
    const statusLabel = item.isActive ? "LIVE" : "PENDING";

    return (
      <Pressable style={styles.libraryCard} onPress={() => setDetailPostId(item.id)}>
        <View style={styles.libraryThumbWrap}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.libraryThumb} contentFit="cover" />
          ) : (
            <View style={[styles.libraryThumb, styles.libraryThumbFallback]}>
              <Ionicons name="videocam-outline" size={16} color={COLORS.muted} />
            </View>
          )}

          <View style={styles.libraryTopOverlay}>
            <View style={[styles.statusBadge, item.isActive ? styles.statusBadgeLive : styles.statusBadgePending]}>
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.libraryBottomOverlay}>
            <Text style={styles.libraryTitle} numberOfLines={2}>
              {item.title?.trim() || item.caption?.trim() || "Zonder titel"}
            </Text>
            <View style={styles.libraryMetricsRow}>
              <View style={styles.libraryMetricItem}>
                <Ionicons name="eye-outline" size={12} color="#fff" />
                <Text style={styles.libraryMetricText}>{views}</Text>
              </View>
              <View style={styles.libraryMetricItem}>
                <Ionicons name="heart-outline" size={12} color="#fff" />
                <Text style={styles.libraryMetricText}>{likes}</Text>
              </View>
              <Text style={styles.libraryDate}>{formatDate(item.createdAtMs)}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  function renderVideosTab() {
    return (
      <View style={styles.libraryWrap}>
        <View style={styles.libraryHeaderCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="albums-outline" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Content library</Text>
          </View>
          <Text style={styles.libraryHeaderText}>Beheer je foto&apos;s en video&apos;s, bekijk status en open details per post.</Text>

          <View style={styles.libraryStatsRow}>
            <View style={styles.libraryStatCard}>
              <Text style={styles.libraryStatValue}>{items.length}</Text>
              <Text style={styles.libraryStatLabel}>Totaal</Text>
            </View>
            <View style={styles.libraryStatCard}>
              <Text style={styles.libraryStatValue}>{liveCount}</Text>
              <Text style={styles.libraryStatLabel}>Live</Text>
            </View>
            <View style={styles.libraryStatCard}>
              <Text style={styles.libraryStatValue}>{totalViews}</Text>
              <Text style={styles.libraryStatLabel}>Views</Text>
            </View>
          </View>
        </View>

        {loadingLibrary ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            numColumns={2}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.libraryGrid}
            columnWrapperStyle={styles.libraryRow}
            renderItem={({ item }) => renderVideoCard(item)}
            ListEmptyComponent={<Text style={styles.emptyText}>Nog geen posts geplaatst.</Text>}
          />
        )}
      </View>
    );
  }

  const hasBusyStatus = uploading || postingStory || refreshingAfterUpload;
  const statusText =
    uploadStatusText ||
    (uploading
      ? "Upload wordt geplaatst..."
      : postingStory
        ? "Story wordt geplaatst..."
        : refreshingAfterUpload
          ? "Content wordt ververst..."
          : "");

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {!inTabs ? (
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
          <Text style={styles.backText}>Terug</Text>
        </Pressable>
      ) : null}

      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="play-circle-outline" size={20} color={COLORS.primary} />
          <Text style={styles.title}>Upload Studio</Text>
        </View>
        <Text style={styles.subtitle}>Creator tools voor jouw salon</Text>
      </View>

      <View style={styles.topTabs}>
        <Pressable style={[styles.topTabBtn, studioTab === "upload" && styles.topTabBtnActive]} onPress={() => setStudioTab("upload")}>
          <Ionicons name={studioTab === "upload" ? "cloud-upload" : "cloud-upload-outline"} size={14} color={studioTab === "upload" ? "#fff" : COLORS.primary} />
          <Text style={[styles.topTabText, studioTab === "upload" && styles.topTabTextActive]}>Upload</Text>
        </Pressable>
        <Pressable style={[styles.topTabBtn, studioTab === "videos" && styles.topTabBtnActive]} onPress={() => setStudioTab("videos")}>
          <Ionicons name={studioTab === "videos" ? "albums" : "albums-outline"} size={14} color={studioTab === "videos" ? "#fff" : COLORS.primary} />
          <Text style={[styles.topTabText, studioTab === "videos" && styles.topTabTextActive]}>Posts</Text>
        </Pressable>
      </View>

      {statusText ? (
        <View style={styles.uploadStatusCard}>
          {hasBusyStatus ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={15} color={COLORS.success} />
          )}
          <Text style={styles.uploadStatusText}>{statusText}</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.tabContentWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        <Animated.View
          style={[
            styles.tabContent,
            {
              opacity: tabOpacity,
              transform: [
                {
                  translateY: tabOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {studioTab === "upload" ? renderUploadTab() : renderVideosTab()}
        </Animated.View>
      </KeyboardAvoidingView>

      <Modal
        visible={uploadComposerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={closeUploadComposer}
      >
        {renderUploadComposer()}
      </Modal>

      <Modal
        visible={Boolean(pendingMediaAction)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingMediaAction(null)}
      >
        <View style={styles.permissionModalOverlay}>
          <View style={styles.permissionModalCard}>
            <View style={styles.permissionModalTop}>
              <Ionicons name="images-outline" size={18} color={COLORS.primary} />
              <Text style={styles.permissionModalTitle}>Toegang voor creator upload</Text>
            </View>
            <Text style={styles.permissionModalText}>
              Geef galerij-toegang om video&apos;s en foto&apos;s te kiezen en te bewerken.
            </Text>

            <View style={styles.permissionModalActions}>
              <Pressable style={styles.permissionPrimaryBtn} onPress={() => onGrantPendingPermission().catch(() => null)}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#fff" />
                <Text style={styles.permissionPrimaryText}>Toegang toestaan</Text>
              </Pressable>
              <Pressable
                style={styles.permissionGhostBtn}
                onPress={() => {
                  Linking.openSettings().catch(() => null);
                  setPendingMediaAction(null);
                }}
              >
                <Ionicons name="settings-outline" size={14} color={COLORS.primary} />
                <Text style={styles.permissionGhostText}>Open instellingen</Text>
              </Pressable>
              <Pressable style={styles.permissionGhostBtn} onPress={() => setPendingMediaAction(null)}>
                <Ionicons name="close-outline" size={14} color={COLORS.primary} />
                <Text style={styles.permissionGhostText}>Nu niet</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(detailItem)} transparent animationType="fade" onRequestClose={() => setDetailPostId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Post details</Text>
              <Pressable style={styles.modalCloseBtn} onPress={() => setDetailPostId(null)}>
                <Ionicons name="close" size={16} color={COLORS.muted} />
              </Pressable>
            </View>

            {detailItem ? (
              <>
                {(() => {
                  const detailThumb = getPostThumbnail(detailItem);
                  return (
                    <View style={styles.modalThumbWrap}>
                      {detailThumb ? (
                        <Image source={{ uri: detailThumb }} style={styles.modalThumb} contentFit="cover" />
                      ) : (
                        <View style={[styles.modalThumb, styles.modalThumbFallback]}>
                          <Ionicons name="videocam-outline" size={18} color={COLORS.muted} />
                        </View>
                      )}
                      {detailItem.mediaType !== "image" ? (
                        <View style={styles.modalPlayCircle}>
                          <Ionicons name="play" size={15} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                  );
                })()}

                <Text style={styles.modalVideoTitle}>{detailItem.title?.trim() || detailItem.caption?.trim() || "Zonder titel"}</Text>
                <Text style={styles.modalVideoMeta}>{detailItem.caption?.trim() || "Geen beschrijving"}</Text>

                <View style={styles.modalStatsGrid}>
                  <View style={styles.modalStatItem}>
                    <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalStatValue}>{detailItem.viewCount ?? 0}</Text>
                    <Text style={styles.modalStatLabel}>Views</Text>
                  </View>
                  <View style={styles.modalStatItem}>
                    <Ionicons name="heart-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalStatValue}>{likesByPost[detailItem.id] ?? 0}</Text>
                    <Text style={styles.modalStatLabel}>Likes</Text>
                  </View>
                  <View style={styles.modalStatItem}>
                    <Ionicons name="radio-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalStatValue}>{detailItem.isActive ? "Live" : "Pending"}</Text>
                    <Text style={styles.modalStatLabel}>Status</Text>
                  </View>
                  <View style={styles.modalStatItem}>
                    <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalStatValue}>{formatDate(detailItem.createdAtMs)}</Text>
                    <Text style={styles.modalStatLabel}>Datum</Text>
                  </View>
                  {detailItem.mediaType === "video" ? (
                    <View style={styles.modalStatItem}>
                      <Ionicons name="cut-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.modalStatValue}>
                        {formatClipRange(
                          Number(detailItem.clipStartSec ?? 0) || 0,
                          Number(detailItem.clipEndSec ?? detailItem.videoDurationSec ?? 0) || 0
                        )}
                      </Text>
                      <Text style={styles.modalStatLabel}>Clip</Text>
                    </View>
                  ) : null}
                  <View style={styles.modalStatItem}>
                    <Ionicons name="resize-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalStatValue}>{detailItem.cropPreset ?? "original"}</Text>
                    <Text style={styles.modalStatLabel}>Crop</Text>
                  </View>
                  <View style={styles.modalStatItem}>
                    <Ionicons name="color-filter-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalStatValue}>{detailItem.filterPreset ?? "none"}</Text>
                    <Text style={styles.modalStatLabel}>Filter</Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <Pressable style={styles.modalEditBtn} onPress={() => applyEditForm(detailItem)}>
                    <Ionicons name="create-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.modalEditText}>Bewerken</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.modalPublishBtn, busyPostId === detailItem.id && styles.disabled]}
                    onPress={() => onTogglePublish(detailItem, !detailItem.isActive)}
                    disabled={busyPostId === detailItem.id}
                  >
                    <Ionicons
                      name={detailItem.isActive ? "pause-circle-outline" : "checkmark-circle-outline"}
                      size={14}
                      color="#fff"
                    />
                    <Text style={styles.modalPublishText}>{detailItem.isActive ? "Zet op pending" : "Publiceer live"}</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.modalDeleteBtn, busyPostId === detailItem.id && styles.disabled]}
                    onPress={() => onDelete(detailItem.id)}
                    disabled={busyPostId === detailItem.id}
                  >
                    <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
                    <Text style={styles.modalDeleteText}>Verwijderen</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 10,
  },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  headerRow: {
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: COLORS.text,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  topTabs: {
    flexDirection: "row",
    gap: 10,
  },
  uploadStatusCard: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cde7d8",
    backgroundColor: "#f4fff7",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadStatusText: {
    flex: 1,
    color: "#116733",
    fontSize: 12,
    fontWeight: "800",
  },
  topTabBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  topTabBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  topTabText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  topTabTextActive: {
    color: "#fff",
  },
  tabContentWrap: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  uploadLandingWrap: {
    flex: 1,
    justifyContent: "center",
  },
  uploadLandingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
    gap: 12,
  },
  uploadLandingText: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  uploadLandingHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  uploadLandingHintText: {
    flex: 1,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  uploadLandingPrimaryBtn: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadLandingPrimaryText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  uploadComposerScreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  uploadComposerTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
  },
  uploadComposerBackBtn: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(0,0,0,0.56)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  uploadComposerBackText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  uploadComposerStepPill: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(0,0,0,0.56)",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadComposerStepText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  uploadComposerPreview: {
    flex: 1,
    backgroundColor: "#000",
  },
  uploadComposerMedia: {
    ...StyleSheet.absoluteFillObject,
  },
  uploadComposerEmpty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  uploadComposerEmptyTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  uploadComposerEmptyText: {
    color: "#d2d2d2",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  uploadComposerBottomPanel: {
    marginTop: "auto",
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 9,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  uploadComposerPrimaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#1f57ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  uploadComposerPrimaryText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  uploadComposerInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadComposerInfoText: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  uploadComposerTrimHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  uploadComposerTrimTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  uploadComposerTrimMeta: {
    color: "#d7d7d7",
    fontSize: 11,
    fontWeight: "700",
  },
  uploadComposerActionsRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 2,
  },
  trimNudgeRow: {
    flexDirection: "row",
    gap: 8,
  },
  trimNudgeBtn: {
    flex: 1,
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  trimNudgeBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  uploadComposerDetailsWrap: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  uploadComposerDetailsContent: {
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 64,
  },
  uploadFlowScreen: {
    gap: 12,
  },
  uploadSelectContent: {
    paddingBottom: 52,
  },
  uploadFlowTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 2,
  },
  uploadFlowTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
  },
  uploadFlowSubTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  uploadFlowStepPill: {
    minWidth: 52,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  uploadFlowStepText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 8,
  },
  stepperChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  stepperChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  stepperChipText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  stepperChipTextActive: {
    color: COLORS.primary,
  },
  uploadContent: {
    gap: 12,
    paddingBottom: 28,
  },
  uploadDetailsContent: {
    gap: 12,
    paddingBottom: 52,
  },
  uploadEditorScreen: {
    flex: 1,
    minHeight: 0,
  },
  uploadEditorHeroFull: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#202020",
    backgroundColor: "#000",
    position: "relative",
  },
  uploadEditorShadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(0,0,0,0.34)",
  },
  uploadEditorVideo: {
    width: "100%",
    height: "100%",
  },
  uploadEditorEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    backgroundColor: "#000",
  },
  uploadEditorEmptyTitle: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "900",
    textAlign: "center",
  },
  uploadEditorEmptyText: {
    color: "#c8c8c8",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  uploadEditorTopBadges: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  uploadEditorBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(16,16,16,0.72)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  uploadEditorBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  uploadEditorBottomInfo: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(28,28,28,0.78)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadEditorBottomInfoText: {
    flex: 1,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  uploadPreviewBottomDock: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(8,8,8,0.88)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 9,
  },
  uploadActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  uploadGhostDarkBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  uploadGhostDarkBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  uploadStoryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: "#1a7dff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  uploadStoryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  uploadEditorFloatingActions: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    gap: 8,
  },
  uploadEditorInlineAlert: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(198,57,87,0.32)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  uploadEditorInlineAlertText: {
    flex: 1,
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  uploadEditorInlineAlertAction: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  uploadEditorBottomSheet: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(8,8,8,0.86)",
    padding: 12,
    maxHeight: 340,
  },
  uploadEditorBottomSheetScroll: {
    gap: 10,
    paddingBottom: 4,
  },
  uploadEditorPrimaryBtn: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: "#1f57ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  uploadEditorPrimaryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  uploadEditorMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  uploadEditorSectionTitle: {
    color: "#f5f5f5",
    fontSize: 13,
    fontWeight: "900",
  },
  uploadEditorMetaText: {
    color: "#c6c6c6",
    fontSize: 12,
    fontWeight: "700",
  },
  uploadEditorTimelineRail: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  uploadEditorTimelineWindow: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#4a7bff",
  },
  trimDirectRow: {
    gap: 6,
  },
  trimDirectLabel: {
    color: "#f5f5f5",
    fontSize: 12,
    fontWeight: "800",
  },
  trimTapRail: {
    height: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  trimTapFill: {
    height: "100%",
    backgroundColor: "rgba(74,123,255,0.55)",
  },
  trimTapThumb: {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#f7fbff",
    borderWidth: 2,
    borderColor: "#4a7bff",
    transform: [{ translateX: -7 }, { translateY: -7 }],
  },
  trimBtnDark: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#323232",
    backgroundColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  trimBtnDarkText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  trimPresetBtnDark: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#323232",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  trimPresetDarkText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  editorChipDark: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#353535",
    backgroundColor: "#1b1b1b",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editorChipDarkActive: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(51,93,255,0.24)",
  },
  editorChipDarkText: {
    color: "#d8d8d8",
    fontSize: 11,
    fontWeight: "700",
  },
  editorChipDarkTextActive: {
    color: "#fff",
    fontWeight: "900",
  },
  fileCardDark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333333",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileDarkText: {
    flex: 1,
    color: "#f2f2f2",
    fontSize: 12,
    fontWeight: "700",
  },
  uploadBottomRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryDarkBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#343434",
    backgroundColor: "#1d1d1d",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  secondaryDarkBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  uploadDetailsTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroCard: {
    backgroundColor: "#101319",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2b3142",
    padding: 14,
    gap: 10,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  heroTitle: {
    color: "#f8fbff",
    fontSize: 16,
    fontWeight: "900",
  },
  heroText: {
    color: "#ccd5e8",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
  },
  heroStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  heroStatCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2e3648",
    backgroundColor: "#1a2130",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    gap: 2,
  },
  heroStatValue: {
    color: "#f8fbff",
    fontSize: 16,
    fontWeight: "900",
  },
  heroStatLabel: {
    color: "#aeb8cd",
    fontSize: 11,
    fontWeight: "700",
  },
  requirementCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 8,
  },
  requirementTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requirementTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 13,
  },
  requirementText: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  requirementBtn: {
    alignSelf: "flex-start",
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  requirementBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  permissionGrid: {
    flexDirection: "row",
    gap: 8,
  },
  permissionCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  permissionCardOk: {
    borderColor: "#b8e4c3",
    backgroundColor: "#ecfaf0",
  },
  permissionCardWarn: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  permissionCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  permissionCardTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  permissionCardState: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  permissionCardText: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    gap: 11,
  },
  uploadDetailsMediaCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    gap: 11,
  },
  uploadDetailsFormCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 15,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  dropZone: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#273149",
    backgroundColor: "#0f1525",
    minHeight: 262,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  fullScreenDropZone: {
    minHeight: 320,
  },
  dropPreview: {
    width: "100%",
    height: 206,
  },
  dropPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    minHeight: 180,
  },
  dropTitle: {
    color: "#f8fbff",
    fontSize: 15,
    fontWeight: "800",
  },
  dropText: {
    color: "#c2cde3",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  dropOverlayRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  dropActionBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2b354f",
    backgroundColor: "#171f32",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  dropActionText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  uploadHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  uploadHintText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  trimCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e0f4",
    backgroundColor: "#f3f6ff",
    padding: 10,
    gap: 8,
  },
  trimTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  trimTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trimTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  trimRangeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  trimHint: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  trimButtonRow: {
    flexDirection: "row",
    gap: 8,
  },
  trimBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#cfd9f5",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  trimBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  trimPresetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  trimPresetBtn: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cfd9f5",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  trimPresetText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  trimErrorCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f3c7d6",
    backgroundColor: "#fff1f6",
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  trimErrorText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  editorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: 8,
  },
  editorHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editorTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  editorHint: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  editorLabel: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "800",
  },
  editorChipRow: {
    gap: 8,
  },
  editorChip: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  editorChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  editorChipText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "700",
  },
  editorChipTextActive: {
    color: COLORS.primary,
    fontWeight: "900",
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f3c7d6",
    backgroundColor: "#fff1f6",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  warningText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  warningCardDark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(190,54,86,0.22)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  warningTextDark: {
    flex: 1,
    color: "#ffd5df",
    fontSize: 11,
    fontWeight: "700",
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileText: {
    flex: 1,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  nextStepBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  nextStepText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  selectedVideoCard: {
    gap: 8,
  },
  selectedVideoPreview: {
    width: "100%",
    height: 190,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  selectedVideoFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  selectedVideoActions: {
    flexDirection: "row",
    gap: 8,
  },
  selectedClipPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedClipText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  selectedEditRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectedEditPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedEditText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  fieldHint: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  serviceRow: {
    gap: 8,
  },
  serviceChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  serviceChipText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
  },
  serviceChipTextActive: {
    color: COLORS.primary,
  },
  visibilityRow: {
    flexDirection: "row",
    gap: 8,
  },
  visibilityBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  visibilityBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  visibilityText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  visibilityTextActive: {
    color: "#fff",
  },
  submitBtn: {
    minHeight: 50,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
  },
  submitText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  backToStepBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  backToStepText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  uploadTypePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  uploadTypePillText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  editActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  ghostBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  ghostBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  deleteGhostBtn: {
    minWidth: 120,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f3c7d6",
    backgroundColor: "#fff1f6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  deleteGhostText: {
    color: COLORS.danger,
    fontWeight: "800",
    fontSize: 12,
  },
  libraryWrap: {
    flex: 1,
    gap: 10,
  },
  libraryHeaderCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 8,
  },
  libraryHeaderText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  libraryStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  libraryStatCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 2,
  },
  libraryStatValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  libraryStatLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  libraryGrid: {
    paddingBottom: 24,
    gap: 10,
  },
  libraryRow: {
    gap: 10,
  },
  libraryCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    overflow: "hidden",
  },
  libraryThumbWrap: {
    width: "100%",
    aspectRatio: 0.74,
    position: "relative",
    backgroundColor: COLORS.surface,
  },
  libraryThumb: {
    width: "100%",
    height: "100%",
  },
  libraryThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  libraryTopOverlay: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeLive: {
    backgroundColor: "rgba(79,159,102,0.92)",
  },
  statusBadgePending: {
    backgroundColor: "rgba(198,57,87,0.86)",
  },
  statusBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  libraryBottomOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 5,
  },
  libraryTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    minHeight: 32,
  },
  libraryMetricsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  libraryMetricItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  libraryMetricText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  libraryDate: {
    marginLeft: "auto",
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  stateWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: "center",
    fontWeight: "700",
    marginTop: 16,
  },
  permissionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  permissionModalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 14,
    gap: 10,
  },
  permissionModalTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  permissionModalTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  permissionModalText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  permissionModalActions: {
    gap: 8,
  },
  permissionPrimaryBtn: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  permissionPrimaryText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  permissionGhostBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  permissionGhostText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 10,
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "900",
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalThumbWrap: {
    width: "100%",
    height: 210,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    position: "relative",
  },
  modalThumb: {
    width: "100%",
    height: "100%",
  },
  modalThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  modalPlayCircle: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalVideoTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  modalVideoMeta: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  modalStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modalStatItem: {
    width: "48%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  modalStatValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "900",
  },
  modalStatLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  modalActions: {
    gap: 8,
  },
  modalEditBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  modalEditText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  modalPublishBtn: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  modalPublishText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  modalDeleteBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#f3c7d6",
    backgroundColor: "#fff1f6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  modalDeleteText: {
    color: COLORS.danger,
    fontWeight: "800",
    fontSize: 12,
  },
  disabled: {
    opacity: 0.5,
  },
});
