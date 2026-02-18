import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ResizeMode, Video } from "expo-av";
import { useRouter, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
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
  captureImageWithCamera,
  pickImageFromLibrary,
  pickVideoFromLibrary,
  recordVideoWithCamera,
  type PickedMedia,
  uploadUriToStorage,
} from "../../lib/mediaRepo";
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

function isTooLongVideoMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("maximaal 15") || lower.includes("langer dan 15");
}

export default function CompanyStudioScreen() {
  const router = useRouter();
  const segments = useSegments();
  const inTabs = (segments as string[]).includes("(tabs)");
  const uid = auth.currentUser?.uid;

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
  const [uploadStep, setUploadStep] = useState<UploadStep>("select");
  const [videoLengthWarning, setVideoLengthWarning] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  const tabOpacity = useRef(new Animated.Value(1)).current;

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
  const totalLikes = useMemo(
    () => items.reduce((acc, item) => acc + (likesByPost[item.id] ?? 0), 0),
    [items, likesByPost]
  );

  const previewThumbnail = useMemo(() => {
    if (video || imageMedia) return "";
    if (!editingItem) return "";
    return getPostThumbnail(editingItem);
  }, [editingItem, video, imageMedia]);

  const submitLabel = editingPostId ? "Wijzigingen opslaan" : "Upload plaatsen";
  const canSubmit = useMemo(() => {
    if (uploading) return false;
    if (title.trim().length < 2) return false;
    if (!editingPostId && !video && !imageMedia) return false;
    if (!hasActiveServices && (!editingPostId || Boolean(video) || Boolean(imageMedia))) return false;
    return true;
  }, [uploading, title, editingPostId, video, imageMedia, hasActiveServices]);

  function switchUploadMediaType(nextType: UploadMediaType) {
    setUploadMediaType(nextType);
    if (nextType === "video") {
      setImageMedia(null);
      return;
    }

    setVideo(null);
    setVideoLengthWarning(null);
  }

  const load = useCallback(async () => {
    if (!uid) return;

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
    setUploadStep("select");
    setVideoLengthWarning(null);
    setEditingPostId(null);
  }

  function applyEditForm(post: FeedPost) {
    setEditingPostId(post.id);
    setCategory(post.category || CATEGORIES[0]);
    setTitle(post.title ?? "");
    setDescription(post.caption ?? "");
    setHashtagsInput(formatHashtags(post.hashtags));
    setSelectedServiceId(post.serviceId ?? "");
    setVisibility(post.visibility === "clients_only" || !post.isActive ? "clients" : "public");
    setUploadMediaType(post.mediaType === "image" ? "image" : "video");
    setVideo(null);
    setImageMedia(null);
    setUploadStep("details");
    setVideoLengthWarning(null);
    setStudioTab("upload");
    setDetailPostId(null);
  }

  async function selectVideo(source: "gallery" | "camera", options?: { allowTrimInPicker?: boolean }) {
    if (!hasActiveServices && !editingPostId) {
      Alert.alert("Minimaal 1 dienst", "Plaats minimaal 1 actieve dienst voordat je een video uploadt.");
      return;
    }

    try {
      const picked =
        source === "gallery"
          ? await pickVideoFromLibrary({ allowEditing: Boolean(options?.allowTrimInPicker) })
          : await recordVideoWithCamera();
      if (!picked) return;

      if (typeof picked.durationMs === "number" && picked.durationMs > MAX_VIDEO_SECONDS * 1000) {
        setVideoLengthWarning(`Deze video is langer dan ${MAX_VIDEO_SECONDS} seconden. Kort hem eerst in.`);
        Alert.alert(
          "Video te lang",
          `Video mag maximaal ${MAX_VIDEO_SECONDS} seconden zijn. Kort de video in en probeer opnieuw.`
        );
        return;
      }

      setUploadMediaType("video");
      setImageMedia(null);
      setVideo(picked);
      setVideoLengthWarning(null);
    } catch (error: any) {
      const message = error?.message ?? "Probeer opnieuw.";

      if (source === "gallery" && isTooLongVideoMessage(message) && !options?.allowTrimInPicker) {
        setVideoLengthWarning(`Je video is te lang. Gebruik inkorten en houd het onder ${MAX_VIDEO_SECONDS} seconden.`);
        Alert.alert(
          "Video te lang",
          `Je video is langer dan ${MAX_VIDEO_SECONDS} seconden.`,
          [
            {
              text: "Inkorten",
              onPress: () => {
                selectVideo("gallery", { allowTrimInPicker: true }).catch(() => null);
              },
            },
            {
              text: "Opnemen (15s)",
              onPress: () => {
                selectVideo("camera").catch(() => null);
              },
            },
            { text: "Annuleren", style: "cancel" },
          ]
        );
        return;
      }

      Alert.alert("Kon video niet kiezen", message);
    }
  }

  async function selectImage(source: "gallery" | "camera") {
    if (!hasActiveServices && !editingPostId) {
      Alert.alert("Minimaal 1 dienst", "Plaats minimaal 1 actieve dienst voordat je een feed post maakt.");
      return;
    }

    try {
      const picked = source === "gallery" ? await pickImageFromLibrary() : await captureImageWithCamera();
      if (!picked) return;

      setUploadMediaType("image");
      setVideo(null);
      setVideoLengthWarning(null);
      setImageMedia(picked);
    } catch (error: any) {
      Alert.alert("Kon foto niet kiezen", error?.message ?? "Probeer opnieuw.");
    }
  }

  async function onSubmit() {
    if (!uid) return;

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

    setUploading(true);

    try {
      const nextVisibility = visibility === "public" ? "public" : "clients_only";
      const nextIsActive = visibility === "public";
      const serviceName = selectedService?.name ?? "";
      const selectedMediaType: UploadMediaType = imageMedia ? "image" : "video";

      if (editingPostId) {
        let nextVideoUrl: string | undefined;
        let nextImageUrl: string | undefined;
        let nextThumbUrl: string | undefined;

        if (video) {
          nextVideoUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${video.fileName}`,
            video.uri,
            video.mimeType
          );
          nextThumbUrl = cloudinaryVideoThumbnailFromUrl(nextVideoUrl);
        }
        if (imageMedia) {
          nextImageUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${imageMedia.fileName}`,
            imageMedia.uri,
            imageMedia.mimeType
          );
          nextThumbUrl = nextImageUrl;
        }

        await updateMyFeedPost(editingPostId, {
          category,
          title: title.trim(),
          caption: description.trim(),
          hashtags,
          serviceId: selectedServiceId,
          serviceName,
          visibility: nextVisibility,
          isActive: nextIsActive,
          ...(nextVideoUrl
            ? {
                mediaType: "video",
                videoUrl: nextVideoUrl,
                imageUrl: "",
                thumbnailUrl: nextThumbUrl || undefined,
              }
            : {}),
          ...(nextImageUrl
            ? {
                mediaType: "image",
                imageUrl: nextImageUrl,
                videoUrl: "",
                thumbnailUrl: nextThumbUrl || undefined,
              }
            : {}),
        });

        Alert.alert("Opgeslagen", "Je feed post is bijgewerkt.");
      } else {
        let uploadedVideoUrl = "";
        let uploadedImageUrl = "";
        let uploadedThumb = "";

        if (selectedMediaType === "video") {
          const pickedVideo = video;
          if (!pickedVideo) return;
          uploadedVideoUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${pickedVideo.fileName}`,
            pickedVideo.uri,
            pickedVideo.mimeType
          );
          uploadedThumb = cloudinaryVideoThumbnailFromUrl(uploadedVideoUrl);
        } else {
          const pickedImage = imageMedia;
          if (!pickedImage) return;
          uploadedImageUrl = await uploadUriToStorage(
            `companies/${uid}/feed/${Date.now()}-${pickedImage.fileName}`,
            pickedImage.uri,
            pickedImage.mimeType
          );
          uploadedThumb = uploadedImageUrl;
        }

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

    return (
      <ScrollView contentContainerStyle={styles.uploadContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <View style={styles.heroTitleRow}>
            <Ionicons name="sparkles-outline" size={18} color={COLORS.primary} />
            <Text style={styles.heroTitle}>Creator Upload Studio</Text>
          </View>
          <Text style={styles.heroText}>
            {uploadStep === "select"
              ? "Stap 1: kies je media en controleer de lengte (bij video)."
              : "Stap 2: voeg titel, caption, tags en zichtbaarheid toe."}
          </Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{items.length}</Text>
              <Text style={styles.heroStatLabel}>Posts</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{liveCount}</Text>
              <Text style={styles.heroStatLabel}>Live</Text>
            </View>
            <View style={styles.heroStatCard}>
              <Text style={styles.heroStatValue}>{totalLikes}</Text>
              <Text style={styles.heroStatLabel}>Likes</Text>
            </View>
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

        <View style={styles.stepperRow}>
          <Pressable
            style={[styles.stepperChip, uploadStep === "select" && styles.stepperChipActive]}
            onPress={() => setUploadStep("select")}
          >
            <Text style={[styles.stepperChipText, uploadStep === "select" && styles.stepperChipTextActive]}>
              1. Media kiezen
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.stepperChip,
              uploadStep === "details" && styles.stepperChipActive,
              !hasSelectedMedia && styles.disabled,
            ]}
            onPress={() => {
              if (!hasSelectedMedia) return;
              setUploadStep("details");
            }}
            disabled={!hasSelectedMedia}
          >
            <Text style={[styles.stepperChipText, uploadStep === "details" && styles.stepperChipTextActive]}>
              2. Details
            </Text>
          </Pressable>
        </View>

        {uploadStep === "select" ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Stap 1 - media kiezen</Text>
            </View>

            <View style={styles.mediaTypeRow}>
              <Pressable
                style={[styles.mediaTypeBtn, uploadMediaType === "video" && styles.mediaTypeBtnActive]}
                onPress={() => switchUploadMediaType("video")}
              >
                <Ionicons name="videocam-outline" size={14} color={uploadMediaType === "video" ? "#fff" : COLORS.primary} />
                <Text style={[styles.mediaTypeText, uploadMediaType === "video" && styles.mediaTypeTextActive]}>Video</Text>
              </Pressable>
              <Pressable
                style={[styles.mediaTypeBtn, uploadMediaType === "image" && styles.mediaTypeBtnActive]}
                onPress={() => switchUploadMediaType("image")}
              >
                <Ionicons name="image-outline" size={14} color={uploadMediaType === "image" ? "#fff" : COLORS.primary} />
                <Text style={[styles.mediaTypeText, uploadMediaType === "image" && styles.mediaTypeTextActive]}>Foto</Text>
              </Pressable>
            </View>

            <View style={styles.dropZone}>
              {video?.uri ? (
                <Video source={{ uri: video.uri }} style={styles.dropPreview} resizeMode={ResizeMode.COVER} shouldPlay={false} isMuted />
              ) : imageMedia?.uri ? (
                <Image source={{ uri: imageMedia.uri }} style={styles.dropPreview} contentFit="cover" />
              ) : previewThumbnail ? (
                <Image source={{ uri: previewThumbnail }} style={styles.dropPreview} contentFit="cover" />
              ) : (
                <View style={styles.dropPlaceholder}>
                  <Ionicons name={uploadMediaType === "video" ? "videocam-outline" : "image-outline"} size={28} color={COLORS.primary} />
                  <Text style={styles.dropTitle}>
                    {uploadMediaType === "video" ? "Kies eerst een video" : "Kies eerst een foto"}
                  </Text>
                  <Text style={styles.dropText}>Daarna ga je verder naar caption, tags en zichtbaarheid.</Text>
                </View>
              )}

              <View style={styles.dropOverlayRow}>
                <Pressable
                  style={styles.dropActionBtn}
                  onPress={() =>
                    (uploadMediaType === "video" ? selectVideo("gallery") : selectImage("gallery")).catch(() => null)
                  }
                >
                  <Ionicons name="images-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.dropActionText}>
                    {uploadMediaType === "video" ? "Video kiezen" : "Foto kiezen"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.dropActionBtn}
                  onPress={() =>
                    (uploadMediaType === "video" ? selectVideo("camera") : selectImage("camera")).catch(() => null)
                  }
                >
                  <Ionicons
                    name={uploadMediaType === "video" ? "videocam-outline" : "camera-outline"}
                    size={14}
                    color={COLORS.primary}
                  />
                  <Text style={styles.dropActionText}>
                    {uploadMediaType === "video" ? "Opnemen" : "Foto maken"}
                  </Text>
                </Pressable>
              </View>
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
              <Text style={styles.nextStepText}>Verder</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="film-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Gekozen media</Text>
              </View>

              <View style={styles.selectedVideoCard}>
                {video?.uri ? (
                  <Video source={{ uri: video.uri }} style={styles.selectedVideoPreview} resizeMode={ResizeMode.COVER} shouldPlay={false} isMuted />
                ) : imageMedia?.uri ? (
                  <Image source={{ uri: imageMedia.uri }} style={styles.selectedVideoPreview} contentFit="cover" />
                ) : previewThumbnail ? (
                  <Image source={{ uri: previewThumbnail }} style={styles.selectedVideoPreview} contentFit="cover" />
                ) : (
                  <View style={[styles.selectedVideoPreview, styles.selectedVideoFallback]}>
                    <Ionicons name="videocam-outline" size={18} color={COLORS.muted} />
                  </View>
                )}
                <View style={styles.selectedVideoActions}>
                  <Pressable
                    style={styles.dropActionBtn}
                    onPress={() =>
                      (uploadMediaType === "video" ? selectVideo("gallery") : selectImage("gallery")).catch(() => null)
                    }
                  >
                    <Ionicons name="images-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.dropActionText}>
                      {uploadMediaType === "video" ? "Andere video" : "Andere foto"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.dropActionBtn}
                    onPress={() =>
                      (uploadMediaType === "video" ? selectVideo("camera") : selectImage("camera")).catch(() => null)
                    }
                  >
                    <Ionicons
                      name={uploadMediaType === "video" ? "videocam-outline" : "camera-outline"}
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.dropActionText}>
                      {uploadMediaType === "video" ? "Opnemen" : "Foto maken"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Stap 2 - post details</Text>
              </View>

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

              <Pressable style={styles.backToStepBtn} onPress={() => setUploadStep("select")}>
                <Ionicons name="arrow-back-outline" size={14} color={COLORS.primary} />
                <Text style={styles.backToStepText}>Terug naar media kiezen</Text>
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
          </>
        )}
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
  tabContent: {
    flex: 1,
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
  mediaTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  mediaTypeBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mediaTypeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  mediaTypeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  mediaTypeTextActive: {
    color: "#fff",
  },
  uploadContent: {
    gap: 12,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 10,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  heroText: {
    color: COLORS.muted,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    gap: 2,
  },
  heroStatValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  heroStatLabel: {
    color: COLORS.muted,
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
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    gap: 11,
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
    borderColor: "#f0bfd7",
    borderStyle: "dashed",
    backgroundColor: "#fff7fb",
    minHeight: 236,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  dropPreview: {
    width: "100%",
    height: 180,
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
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "800",
  },
  dropText: {
    color: COLORS.muted,
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
    borderColor: COLORS.border,
    backgroundColor: "#fff",
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
