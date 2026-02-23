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
import InAppCaptureModal, { CapturedMedia } from "../../components/InAppCaptureModal";
import MediaLibraryPickerModal, { PickedLibraryMedia } from "../../components/MediaLibraryPickerModal";
import {
  addMyFeedPost,
  deleteMyFeedPost,
  fetchMyFeedPosts,
  FeedPost,
  updateMyFeedPost,
} from "../../lib/feedRepo";
import { auth } from "../../lib/firebase";
import {
  captureAnyMediaWithCamera,
  getCameraPermissionState,
  getMediaLibraryPermissionState,
  pickAnyMediaFromLibrary,
  requestCameraPermission,
  requestMediaLibraryPermission,
  type PickedMedia,
  uploadUriToStorage,
} from "../../lib/mediaRepo";
import {
  buildCloudinaryEditedUrl,
  type MediaCropPreset,
  type MediaFilterPreset,
} from "../../lib/mediaEdit";
import { fetchMyServices, type CompanyService } from "../../lib/serviceRepo";
import { getPostLikeCount } from "../../lib/socialRepo";
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

type StudioTab = "upload" | "videos";
type UploadVisibility = "public" | "clients";
type UploadStep = "select" | "details";
type UploadMediaType = "video" | "image";
type PermissionState = "granted" | "denied" | "undetermined";
type PendingMediaAction = "library" | "camera";

const CLIP_STEP_SEC = 0.5;
const DEFAULT_CROP_PRESET: MediaCropPreset = "9:16";
const DEFAULT_FILTER_PRESET: MediaFilterPreset = "none";
const CROP_OPTIONS: { key: MediaCropPreset; label: string }[] = [
  { key: "9:16", label: "9:16" },
  { key: "4:5", label: "4:5" },
  { key: "1:1", label: "1:1" },
  { key: "16:9", label: "16:9" },
  { key: "original", label: "Origineel" },
];
const FILTER_OPTIONS: { key: MediaFilterPreset; label: string }[] = [
  { key: "none", label: "Geen" },
  { key: "clean", label: "Clean" },
  { key: "vivid", label: "Vivid" },
  { key: "warm", label: "Warm" },
  { key: "mono", label: "Mono" },
];

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
    path = path.replace("/upload/", "/upload/so_1,w_720,h_1160,c_fill,q_auto,f_jpg/");
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

function formatDuration(seconds?: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  return `${Math.round(seconds)}s`;
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
  const [hasActiveServices, setHasActiveServices] = useState(true);

  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [uploading, setUploading] = useState(false);
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
  const [videoLengthWarning, setVideoLengthWarning] = useState<string | null>(null);
  const [clipStartSec, setClipStartSec] = useState(0);
  const [clipEndSec, setClipEndSec] = useState(MAX_VIDEO_SECONDS);
  const [libraryPermission, setLibraryPermission] = useState<PermissionState>("undetermined");
  const [cameraPermission, setCameraPermission] = useState<PermissionState>("undetermined");
  const [pendingMediaAction, setPendingMediaAction] = useState<PendingMediaAction | null>(null);
  const [libraryPickerVisible, setLibraryPickerVisible] = useState(false);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  const tabOpacity = useRef(new Animated.Value(1)).current;
  const previewVideoRef = useRef<Video | null>(null);
  const previewSeekingRef = useRef(false);

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
  const previewThumbnail = useMemo(() => {
    if (video || imageMedia) return "";
    if (!editingItem) return "";

    const baseVideo = editingItem.sourceVideoUrl?.trim() || editingItem.videoUrl?.trim() || "";
    const baseImage = editingItem.sourceImageUrl?.trim() || editingItem.imageUrl?.trim() || "";
    if (editingItem.mediaType === "image" && baseImage) {
      return buildCloudinaryEditedUrl(baseImage, { cropPreset, filterPreset });
    }
    if (baseImage && !baseVideo) {
      return buildCloudinaryEditedUrl(baseImage, { cropPreset, filterPreset });
    }
    if (baseVideo) {
      const editedVideoUrl = buildCloudinaryEditedUrl(baseVideo, { cropPreset, filterPreset });
      return cloudinaryVideoThumbnailFromUrl(editedVideoUrl);
    }
    return getPostThumbnail(editingItem);
  }, [editingItem, video, imageMedia, cropPreset, filterPreset]);
  const previewVideoUri = useMemo(() => {
    if (uploadMediaType !== "video") return "";
    if (video?.uri) return video.uri;

    const baseVideo = editingItem?.sourceVideoUrl?.trim() || editingItem?.videoUrl?.trim() || "";
    if (!baseVideo) return "";
    return buildCloudinaryEditedUrl(baseVideo, { cropPreset, filterPreset });
  }, [uploadMediaType, video?.uri, editingItem, cropPreset, filterPreset]);
  const hasLiveVideoPreview = Boolean(previewVideoUri);
  const videoDurationSec = useMemo(
    () => (video?.durationMs ? Math.max(0, video.durationMs / 1000) : 0),
    [video?.durationMs]
  );
  const clipDurationSec = useMemo(
    () => Math.max(0, Number((clipEndSec - clipStartSec).toFixed(2))),
    [clipEndSec, clipStartSec]
  );
  const hasVideoClipError =
    Boolean(video) &&
    (clipDurationSec < 1 ||
      clipDurationSec > MAX_VIDEO_SECONDS ||
      clipStartSec < 0 ||
      clipEndSec <= clipStartSec ||
      (videoDurationSec > 0 && clipEndSec > videoDurationSec + 0.001));

  const onPreviewStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded || uploadMediaType !== "video" || !hasLiveVideoPreview) return;
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

  const submitLabel = editingPostId ? "Wijzigingen opslaan" : "Upload plaatsen";
  const canSubmit = useMemo(() => {
    if (uploading) return false;
    if (title.trim().length < 2) return false;
    if (!editingPostId && !video && !imageMedia) return false;
    if (!hasActiveServices && (!editingPostId || Boolean(video) || Boolean(imageMedia))) return false;
    if (hasVideoClipError) return false;
    return true;
  }, [uploading, title, editingPostId, video, imageMedia, hasActiveServices, hasVideoClipError]);

  const refreshPermissionStates = useCallback(async () => {
    const [libraryState, cameraState] = await Promise.all([
      getMediaLibraryPermissionState().catch(() => "undetermined" as PermissionState),
      getCameraPermissionState().catch(() => "undetermined" as PermissionState),
    ]);
    setLibraryPermission(libraryState);
    setCameraPermission(cameraState);
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
      setHasActiveServices(false);
      setLoadingLibrary(false);
      return;
    }

    setLoadingLibrary(true);
    try {
      const [posts, companyServices] = await Promise.all([fetchMyFeedPosts(uid), fetchMyServices(uid)]);

      const onlyActiveServices = companyServices.filter((service) => service.isActive);
      setItems(posts);
      setServices(onlyActiveServices);
      setHasActiveServices(onlyActiveServices.length > 0);
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
    setUploadStep("select");
    setVideoLengthWarning(null);
    setEditingPostId(null);
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
    setCropPreset(post.cropPreset ?? DEFAULT_CROP_PRESET);
    setFilterPreset(post.filterPreset ?? DEFAULT_FILTER_PRESET);
    setVideo(null);
    setImageMedia(null);
    setClipStartSec(nextClipStart);
    setClipEndSec(nextClipEnd);
    setUploadStep("details");
    setVideoLengthWarning(null);
    setStudioTab("upload");
    setDetailPostId(null);
  }

  function applyPickedMedia(picked: PickedMedia, kind: "video" | "image") {
    if (kind === "video") {
      const durationSec = picked.durationMs ? Math.max(0, picked.durationMs / 1000) : 0;
      const defaultEnd = durationSec > 0 ? Math.min(durationSec, MAX_VIDEO_SECONDS) : MAX_VIDEO_SECONDS;
      setUploadMediaType("video");
      setImageMedia(null);
      setVideo(picked);
      setClipStartSec(0);
      setClipEndSec(defaultEnd);
      if (durationSec > MAX_VIDEO_SECONDS) {
        setVideoLengthWarning(
          `Deze video is ${durationSec.toFixed(1)}s. Kies hieronder een clip van max ${MAX_VIDEO_SECONDS}s.`
        );
      } else {
        setVideoLengthWarning(null);
      }
      setUploadStep("details");
      return;
    }

    setUploadMediaType("image");
    setVideo(null);
    setClipStartSec(0);
    setClipEndSec(MAX_VIDEO_SECONDS);
    setVideoLengthWarning(null);
    setImageMedia(picked);
    setUploadStep("details");
  }

  function setClipByDuration(durationSec: number) {
    const totalDuration = videoDurationSec || MAX_VIDEO_SECONDS;
    const nextDuration = Math.min(MAX_VIDEO_SECONDS, Math.max(1, durationSec));
    const nextEnd = Math.min(totalDuration, clipStartSec + nextDuration);
    if (nextEnd - clipStartSec < 1) {
      setClipStartSec(Math.max(0, totalDuration - nextDuration));
      setClipEndSec(totalDuration);
      return;
    }
    setClipEndSec(nextEnd);
  }

  function nudgeClipStart(deltaSec: number) {
    const totalDuration = videoDurationSec || MAX_VIDEO_SECONDS;
    const clipDuration = Math.max(1, clipEndSec - clipStartSec);
    const maxStart = Math.max(0, totalDuration - clipDuration);
    const nextStart = Math.min(maxStart, Math.max(0, clipStartSec + deltaSec));
    setClipStartSec(nextStart);
    setClipEndSec(Math.min(totalDuration, nextStart + clipDuration));
  }

  function nudgeClipEnd(deltaSec: number) {
    const totalDuration = videoDurationSec || MAX_VIDEO_SECONDS;
    const minEnd = clipStartSec + 1;
    const maxEnd = Math.min(totalDuration, clipStartSec + MAX_VIDEO_SECONDS);
    const nextEnd = Math.min(maxEnd, Math.max(minEnd, clipEndSec + deltaSec));
    setClipEndSec(nextEnd);
  }

  async function executeMediaAction(action: PendingMediaAction) {
    if (Platform.OS === "web") {
      const picked =
        action === "library"
          ? await pickAnyMediaFromLibrary()
          : await captureAnyMediaWithCamera();
      if (!picked) return;
      applyPickedMedia(picked, picked.kind);
      return;
    }

    if (action === "library") {
      setLibraryPickerVisible(true);
      return;
    }
    setCaptureVisible(true);
  }

  function needsPermissionForAction(action: PendingMediaAction): boolean {
    if (action === "library") {
      return libraryPermission !== "granted";
    }
    return cameraPermission !== "granted";
  }

  function openActionWithPermission(action: PendingMediaAction) {
    if (!hasActiveServices && !editingPostId) {
      Alert.alert("Minimaal 1 dienst", "Plaats minimaal 1 actieve dienst voordat je media uploadt.");
      return;
    }
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

    const needLibrary = pendingMediaAction === "library";
    const granted = needLibrary ? await requestMediaLibraryPermission() : await requestCameraPermission();
    await refreshPermissionStates();

    if (!granted) {
      Alert.alert(
        "Toegang nodig",
        needLibrary
          ? "Zonder galerij-toegang kun je geen video of foto kiezen."
          : "Zonder camera-toegang kun je geen video of foto opnemen."
      );
      return;
    }

    const nextAction = pendingMediaAction;
    setPendingMediaAction(null);
    executeMediaAction(nextAction).catch(() => null);
  }

  async function onSubmit() {
    if (!uid) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om te uploaden of wijzigen.");
      return;
    }

    if (!hasActiveServices && (!editingPostId || Boolean(video) || Boolean(imageMedia))) {
      Alert.alert("Minimaal 1 dienst", "Plaats minimaal 1 actieve dienst voordat je een feed post plaatst.");
      return;
    }

    if (title.trim().length < 2) {
      Alert.alert("Titel ontbreekt", "Geef je video een duidelijke titel.");
      return;
    }

    if (!editingPostId && !video && !imageMedia) {
      Alert.alert("Media ontbreekt", "Kies eerst een video of foto om te uploaden.");
      return;
    }
    if (hasVideoClipError) {
      Alert.alert("Clip niet geldig", `Kies een videosegment van minimaal 1s en maximaal ${MAX_VIDEO_SECONDS}s.`);
      return;
    }

    setUploading(true);

    try {
      const nextVisibility = visibility === "public" ? "public" : "clients_only";
      const nextIsActive = visibility === "public";
      const serviceName = selectedService?.name ?? "";
      const selectedMediaType: UploadMediaType = imageMedia ? "image" : video ? "video" : uploadMediaType;

      if (editingPostId) {
        let sourceVideoUrl = String(editingItem?.sourceVideoUrl ?? editingItem?.videoUrl ?? "").trim();
        let sourceImageUrl = String(editingItem?.sourceImageUrl ?? editingItem?.imageUrl ?? "").trim();
        const fallbackVideoDurationSec = Math.max(clipEndSec, Number(editingItem?.videoDurationSec ?? clipEndSec) || clipEndSec);

        if (video) {
          sourceVideoUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${video.fileName}`,
            video.uri,
            video.mimeType
          );
          sourceImageUrl = "";
        }
        if (imageMedia) {
          sourceImageUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${imageMedia.fileName}`,
            imageMedia.uri,
            imageMedia.mimeType
          );
          sourceVideoUrl = "";
        }

        const nextVideoUrl =
          selectedMediaType === "video"
            ? buildCloudinaryEditedUrl(sourceVideoUrl, { cropPreset, filterPreset })
            : "";
        const nextImageUrl =
          selectedMediaType === "image"
            ? buildCloudinaryEditedUrl(sourceImageUrl, { cropPreset, filterPreset })
            : "";
        const nextThumbUrl = selectedMediaType === "video" ? cloudinaryVideoThumbnailFromUrl(nextVideoUrl) : nextImageUrl;

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
          cropPreset,
          filterPreset,
          ...(selectedMediaType === "video"
            ? {
                clipStartSec: clipStartSec,
                clipEndSec: clipEndSec,
                videoDurationSec: Math.max(videoDurationSec, fallbackVideoDurationSec),
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

        Alert.alert("Opgeslagen", "Je feed post is bijgewerkt.");
      } else {
        let sourceVideoUrl = "";
        let sourceImageUrl = "";

        if (selectedMediaType === "video") {
          const pickedVideo = video;
          if (!pickedVideo) return;
          sourceVideoUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${pickedVideo.fileName}`,
            pickedVideo.uri,
            pickedVideo.mimeType
          );
        } else {
          const pickedImage = imageMedia;
          if (!pickedImage) return;
          sourceImageUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${pickedImage.fileName}`,
            pickedImage.uri,
            pickedImage.mimeType
          );
        }

        const uploadedVideoUrl =
          selectedMediaType === "video"
            ? buildCloudinaryEditedUrl(sourceVideoUrl, { cropPreset, filterPreset })
            : "";
        const uploadedImageUrl =
          selectedMediaType === "image"
            ? buildCloudinaryEditedUrl(sourceImageUrl, { cropPreset, filterPreset })
            : "";
        const uploadedThumb = selectedMediaType === "video" ? cloudinaryVideoThumbnailFromUrl(uploadedVideoUrl) : uploadedImageUrl;

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
          videoUrl: uploadedVideoUrl,
          imageUrl: uploadedImageUrl,
          thumbnailUrl: uploadedThumb || undefined,
          sourceVideoUrl: selectedMediaType === "video" ? sourceVideoUrl : "",
          sourceImageUrl: selectedMediaType === "image" ? sourceImageUrl : "",
          cropPreset,
          filterPreset,
          clipStartSec: selectedMediaType === "video" ? clipStartSec : 0,
          clipEndSec: selectedMediaType === "video" ? clipEndSec : 0,
          videoDurationSec:
            selectedMediaType === "video" ? Math.max(videoDurationSec, clipEndSec) : 0,
          viewCount: 0,
        });

        Alert.alert("Geplaatst", "Je feed post staat in je content library.");
      }

      resetForm();
      setStudioTab("videos");
      await load();
    } catch (error: any) {
      Alert.alert("Upload mislukt", error?.message ?? "Kon post niet opslaan.");
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(postId: string) {
    if (busyPostId) return;

    Alert.alert("Video verwijderen", "Weet je zeker dat je deze video wilt verwijderen?", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
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
        },
      },
    ]);
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
    const hasSelectedMedia = Boolean(video?.uri || imageMedia?.uri || previewThumbnail);
    const previewNode = hasLiveVideoPreview ? (
      <Video
        ref={previewVideoRef}
        source={{ uri: previewVideoUri }}
        style={styles.dropPreview}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isMuted
        isLooping={false}
        onPlaybackStatusUpdate={onPreviewStatusUpdate}
      />
    ) : imageMedia?.uri ? (
      <Image source={{ uri: imageMedia.uri }} style={styles.dropPreview} contentFit="cover" />
    ) : previewThumbnail ? (
      <Image source={{ uri: previewThumbnail }} style={styles.dropPreview} contentFit="cover" />
    ) : (
      <View style={styles.dropPlaceholder}>
        <Ionicons name="images-outline" size={32} color={COLORS.primary} />
        <Text style={styles.dropTitle}>Kies media uit je album</Text>
        <Text style={styles.dropText}>Upload of neem meteen op in dit scherm.</Text>
      </View>
    );
    const detailsPreviewNode = hasLiveVideoPreview ? (
      <Video
        ref={previewVideoRef}
        source={{ uri: previewVideoUri }}
        style={styles.selectedVideoPreview}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isMuted
        isLooping={false}
        onPlaybackStatusUpdate={onPreviewStatusUpdate}
      />
    ) : imageMedia?.uri ? (
      <Image source={{ uri: imageMedia.uri }} style={styles.selectedVideoPreview} contentFit="cover" />
    ) : previewThumbnail ? (
      <Image source={{ uri: previewThumbnail }} style={styles.selectedVideoPreview} contentFit="cover" />
    ) : (
      <View style={[styles.selectedVideoPreview, styles.selectedVideoFallback]}>
        <Ionicons name="videocam-outline" size={18} color={COLORS.muted} />
      </View>
    );

    const mediaActionRow = (
      <View style={styles.dropOverlayRow}>
        <Pressable style={styles.dropActionBtn} onPress={() => openActionWithPermission("library")}>
          <Ionicons name="images-outline" size={14} color={COLORS.primary} />
          <Text style={styles.dropActionText}>Upload</Text>
        </Pressable>
        <Pressable style={styles.dropActionBtn} onPress={() => openActionWithPermission("camera")}>
          <Ionicons name="camera-outline" size={14} color={COLORS.primary} />
          <Text style={styles.dropActionText}>Opnemen</Text>
        </Pressable>
      </View>
    );
    const hasEditableMedia = Boolean(video || imageMedia || editingItem);
    const editorCard = hasEditableMedia ? (
      <View style={styles.editorCard}>
        <View style={styles.editorHeaderRow}>
          <Ionicons name="color-wand-outline" size={14} color={COLORS.primary} />
          <Text style={styles.editorTitle}>Bewerken</Text>
        </View>
        <Text style={styles.editorHint}>Crop, filter en clip spelen live mee in de preview hierboven.</Text>

        <Text style={styles.editorLabel}>Crop</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.editorChipRow}
          keyboardShouldPersistTaps="handled"
        >
          {CROP_OPTIONS.map((option) => {
            const active = cropPreset === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.editorChip, active && styles.editorChipActive]}
                onPress={() => setCropPreset(option.key)}
              >
                <Text style={[styles.editorChipText, active && styles.editorChipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.editorLabel}>Filter</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.editorChipRow}
          keyboardShouldPersistTaps="handled"
        >
          {FILTER_OPTIONS.map((option) => {
            const active = filterPreset === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.editorChip, active && styles.editorChipActive]}
                onPress={() => setFilterPreset(option.key)}
              >
                <Text style={[styles.editorChipText, active && styles.editorChipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    ) : null;

    if (uploadStep === "select") {
      return (
        <ScrollView
          contentContainerStyle={styles.uploadSelectContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.uploadFlowScreen}>
            <View style={styles.uploadFlowTopRow}>
              <View>
                <Text style={styles.uploadFlowTitle}>Nieuwe post</Text>
                <Text style={styles.uploadFlowSubTitle}>Stap 1 van 2 - kies je media</Text>
              </View>
              <View style={styles.uploadFlowStepPill}>
                <Text style={styles.uploadFlowStepText}>1/2</Text>
              </View>
            </View>

            {!hasActiveServices ? (
              <View style={styles.requirementCard}>
                <View style={styles.requirementTitleRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.requirementTitle}>Upload tijdelijk geblokkeerd</Text>
                </View>
                <Text style={styles.requirementText}>Plaats minimaal 1 actieve dienst om feed posts te publiceren.</Text>
                <Pressable style={styles.requirementBtn} onPress={() => router.push("/(company)/(tabs)/services" as never)}>
                  <Ionicons name="cut-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.requirementBtnText}>Ga naar diensten</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.dropZone, styles.fullScreenDropZone]}>
              {previewNode}
              {mediaActionRow}
            </View>

            {uploadMediaType === "video" ? (
              <View style={styles.uploadHintRow}>
                <Ionicons name="timer-outline" size={13} color={COLORS.muted} />
                <Text style={styles.uploadHintText}>Maximaal {MAX_VIDEO_SECONDS} seconden per video.</Text>
              </View>
            ) : null}

            {uploadMediaType === "video" && videoLengthWarning ? (
              <View style={styles.warningCard}>
                <Ionicons name="alert-circle-outline" size={14} color={COLORS.danger} />
                <Text style={styles.warningText}>{videoLengthWarning}</Text>
              </View>
            ) : null}

            {uploadMediaType === "video" && video ? (
              <View style={styles.trimCard}>
                <View style={styles.trimTopRow}>
                  <View style={styles.trimTitleWrap}>
                    <Ionicons name="cut-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.trimTitle}>Clip inkorten</Text>
                  </View>
                  <Text style={styles.trimRangeText}>{formatClipRange(clipStartSec, clipEndSec)}</Text>
                </View>
                <Text style={styles.trimHint}>
                  Duur: {clipDurationSec.toFixed(1)}s van {videoDurationSec > 0 ? videoDurationSec.toFixed(1) : "--"}s
                </Text>

                <View style={styles.trimButtonRow}>
                  <Pressable style={styles.trimBtn} onPress={() => nudgeClipStart(-CLIP_STEP_SEC)}>
                    <Text style={styles.trimBtnText}>Start -0.5s</Text>
                  </Pressable>
                  <Pressable style={styles.trimBtn} onPress={() => nudgeClipStart(CLIP_STEP_SEC)}>
                    <Text style={styles.trimBtnText}>Start +0.5s</Text>
                  </Pressable>
                </View>
                <View style={styles.trimButtonRow}>
                  <Pressable style={styles.trimBtn} onPress={() => nudgeClipEnd(-CLIP_STEP_SEC)}>
                    <Text style={styles.trimBtnText}>Eind -0.5s</Text>
                  </Pressable>
                  <Pressable style={styles.trimBtn} onPress={() => nudgeClipEnd(CLIP_STEP_SEC)}>
                    <Text style={styles.trimBtnText}>Eind +0.5s</Text>
                  </Pressable>
                </View>

                <View style={styles.trimPresetRow}>
                  {[5, 10, 15].map((preset) => (
                    <Pressable key={preset} style={styles.trimPresetBtn} onPress={() => setClipByDuration(preset)}>
                      <Text style={styles.trimPresetText}>{preset}s</Text>
                    </Pressable>
                  ))}
                </View>

                {hasVideoClipError ? (
                  <View style={styles.trimErrorCard}>
                    <Ionicons name="alert-circle-outline" size={13} color={COLORS.danger} />
                    <Text style={styles.trimErrorText}>Kies een clip van 1 tot {MAX_VIDEO_SECONDS} seconden.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {editorCard}

            {video || imageMedia ? (
              <View style={styles.fileCard}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                <Text style={styles.fileText} numberOfLines={1}>
                  {video?.fileName || imageMedia?.fileName}{" "}
                  {video ? formatDuration(video.durationMs ? video.durationMs / 1000 : undefined) : ""}
                </Text>
                <Pressable
                  onPress={() => {
                    setVideo(null);
                    setImageMedia(null);
                    setClipStartSec(0);
                    setClipEndSec(MAX_VIDEO_SECONDS);
                    setUploadStep("select");
                  }}
                >
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.primary} />
                </Pressable>
              </View>
            ) : null}

            <Pressable
              style={[styles.nextStepBtn, !hasSelectedMedia && styles.disabled]}
              onPress={() => setUploadStep("details")}
              disabled={!hasSelectedMedia}
            >
              <Ionicons name="arrow-forward-outline" size={15} color="#fff" />
              <Text style={styles.nextStepText}>Volgende stap</Text>
            </Pressable>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={styles.uploadDetailsContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <View style={styles.uploadFlowTopRow}>
          <View>
            <Text style={styles.uploadFlowTitle}>Post details</Text>
            <Text style={styles.uploadFlowSubTitle}>Stap 2 van 2 - beschrijving en publiceren</Text>
          </View>
          <View style={styles.uploadFlowStepPill}>
            <Text style={styles.uploadFlowStepText}>2/2</Text>
          </View>
        </View>

        <Pressable style={styles.backToStepBtn} onPress={() => setUploadStep("select")}>
          <Ionicons name="arrow-back-outline" size={14} color={COLORS.primary} />
          <Text style={styles.backToStepText}>Terug naar media</Text>
        </Pressable>

        {!hasActiveServices ? (
          <View style={styles.requirementCard}>
            <View style={styles.requirementTitleRow}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.primary} />
              <Text style={styles.requirementTitle}>Upload tijdelijk geblokkeerd</Text>
            </View>
            <Text style={styles.requirementText}>Plaats minimaal 1 actieve dienst om feed posts te publiceren.</Text>
            <Pressable style={styles.requirementBtn} onPress={() => router.push("/(company)/(tabs)/services" as never)}>
              <Ionicons name="cut-outline" size={14} color={COLORS.primary} />
              <Text style={styles.requirementBtnText}>Ga naar diensten</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.uploadDetailsMediaCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="film-outline" size={16} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>Gekozen media</Text>
          </View>
          <View style={styles.selectedVideoCard}>
            {detailsPreviewNode}
            {mediaActionRow}
            {uploadMediaType === "video" && (video || editingItem?.mediaType === "video") ? (
              <View style={styles.selectedClipPill}>
                <Ionicons name="cut-outline" size={13} color={COLORS.primary} />
                <Text style={styles.selectedClipText}>
                  Clip: {formatClipRange(clipStartSec, clipEndSec)} ({clipDurationSec.toFixed(1)}s)
                </Text>
              </View>
            ) : null}
            <View style={styles.selectedEditRow}>
              <View style={styles.selectedEditPill}>
                <Ionicons name="resize-outline" size={13} color={COLORS.primary} />
                <Text style={styles.selectedEditText}>Crop: {cropPreset}</Text>
              </View>
              <View style={styles.selectedEditPill}>
                <Ionicons name="color-filter-outline" size={13} color={COLORS.primary} />
                <Text style={styles.selectedEditText}>Filter: {filterPreset}</Text>
              </View>
            </View>
          </View>
          {editorCard}
        </View>

        <View style={styles.uploadDetailsFormCard}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Post titel</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Bijv. Fresh balayage transformation"
              placeholderTextColor={COLORS.placeholder}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Beschrijving</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Vertel kort wat je hebt gedaan"
              placeholderTextColor={COLORS.placeholder}
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
              placeholderTextColor={COLORS.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.fieldHint}>
              {hashtags.length}/{MAX_HASHTAGS} tags
            </Text>
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
                  <Pressable key={service.id} style={[styles.serviceChip, active && styles.serviceChipActive]} onPress={() => setSelectedServiceId(service.id)}>
                    <Text style={[styles.serviceChipText, active && styles.serviceChipTextActive]}>{service.name}</Text>
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
                <Ionicons name="globe-outline" size={14} color={visibility === "public" ? "#fff" : COLORS.primary} />
                <Text style={[styles.visibilityText, visibility === "public" && styles.visibilityTextActive]}>Publiek</Text>
              </Pressable>
              <Pressable
                style={[styles.visibilityBtn, visibility === "clients" && styles.visibilityBtnActive]}
                onPress={() => setVisibility("clients")}
              >
                <Ionicons name="people-outline" size={14} color={visibility === "clients" ? "#fff" : COLORS.primary} />
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

      <MediaLibraryPickerModal
        visible={libraryPickerVisible}
        onClose={() => setLibraryPickerVisible(false)}
        onPick={(picked: PickedLibraryMedia) => {
          setLibraryPickerVisible(false);
          applyPickedMedia(picked, picked.kind);
        }}
      />

      <InAppCaptureModal
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        onCaptured={(captured: CapturedMedia) => {
          setCaptureVisible(false);
          applyPickedMedia(captured, captured.kind === "video" ? "video" : "image");
        }}
      />

      <Modal
        visible={Boolean(pendingMediaAction)}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingMediaAction(null)}
      >
        <View style={styles.permissionModalOverlay}>
          <View style={styles.permissionModalCard}>
            <View style={styles.permissionModalTop}>
              <Ionicons
                name={
                  pendingMediaAction === "library" ? "images-outline" : "camera-outline"
                }
                size={18}
                color={COLORS.primary}
              />
              <Text style={styles.permissionModalTitle}>Toegang voor creator upload</Text>
            </View>
            <Text style={styles.permissionModalText}>
              {pendingMediaAction === "library"
                ? "Geef galerij-toegang om foto&apos;s en video&apos;s te kiezen en te bewerken."
                : "Geef camera-toegang om direct video&apos;s of foto&apos;s op te nemen."}
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
