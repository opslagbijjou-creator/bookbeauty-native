import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { ResizeMode, Video } from "expo-av";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import { getUserRole } from "../../../lib/authRepo";
import { fetchInfluencerCommissionSummary } from "../../../lib/bookingRepo";
import { fetchCompanies, CompanyPublic } from "../../../lib/companyRepo";
import {
  addInfluencerFeedPost,
  deleteMyFeedPost,
  fetchInfluencerFeedPosts,
  FeedPost,
} from "../../../lib/feedRepo";
import { auth, db } from "../../../lib/firebase";
import {
  captureImageWithCamera,
  pickImageFromLibrary,
  pickVideoFromLibrary,
  recordVideoWithCamera,
  uploadUriToStorage,
  type PickedMedia,
} from "../../../lib/mediaRepo";
import { fetchCompanyServicesPublic, CompanyService } from "../../../lib/serviceRepo";
import { CATEGORIES, COLORS } from "../../../lib/ui";

type MediaType = "video" | "image";

type Summary = {
  totalBookings: number;
  confirmedBookings: number;
  estimatedCommissionTotal: number;
  confirmedCommissionTotal: number;
  pendingCommissionTotal: number;
};

const DEFAULT_SUMMARY: Summary = {
  totalBookings: 0,
  confirmedBookings: 0,
  estimatedCommissionTotal: 0,
  confirmedCommissionTotal: 0,
  pendingCommissionTotal: 0,
};

function parseHashtags(value: string): string[] {
  const rows = value
    .split(/[\s,]+/)
    .map((item) => item.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(rows)).slice(0, 12);
}

function formatDate(ms?: number): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cloudinaryVideoThumbnailFromUrl(videoUrl: string): string {
  if (!videoUrl) return "";

  const [rawPath, rawQuery = ""] = videoUrl.split("?");
  let path = rawPath;

  if (path.includes("/upload/")) {
    path = path.replace("/upload/", "/upload/so_1,w_540,h_920,c_fill,q_auto,f_jpg/");
  }

  if (/\.(mp4|mov|m4v|webm|avi)$/i.test(path)) {
    path = path.replace(/\.(mp4|mov|m4v|webm|avi)$/i, ".jpg");
  } else if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) {
    path = `${path}.jpg`;
  }

  return rawQuery ? `${path}?${rawQuery}` : path;
}

function previewForPost(post: FeedPost): string {
  if (post.thumbnailUrl?.trim()) return post.thumbnailUrl.trim();
  if (post.imageUrl?.trim()) return post.imageUrl.trim();
  return cloudinaryVideoThumbnailFromUrl(post.videoUrl);
}

export default function InfluencerStudioScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? "";

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [displayName, setDisplayName] = useState("Influencer");

  const [companies, setCompanies] = useState<CompanyPublic[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [services, setServices] = useState<CompanyService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");

  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("5");
  const [mediaType, setMediaType] = useState<MediaType>("video");
  const [media, setMedia] = useState<PickedMedia | null>(null);

  const [saving, setSaving] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [summary, setSummary] = useState<Summary>(DEFAULT_SUMMARY);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId]
  );

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  const parsedCommissionPercent = useMemo(() => {
    const next = Number(String(commissionPercent).replace(",", "."));
    if (!Number.isFinite(next)) return 5;
    return Math.max(0, Math.min(30, next));
  }, [commissionPercent]);

  const hashtags = useMemo(() => parseHashtags(hashtagsInput), [hashtagsInput]);

  const canSubmit = Boolean(
    uid &&
      allowed &&
      selectedCompanyId &&
      selectedServiceId &&
      title.trim().length >= 2 &&
      media &&
      !saving
  );

  const loadDashboard = useCallback(async () => {
    if (!uid) return;

    const [companyRows, myPosts, mySummary] = await Promise.all([
      fetchCompanies({ take: 40 }),
      fetchInfluencerFeedPosts(uid),
      fetchInfluencerCommissionSummary(uid),
    ]);

    setCompanies(companyRows);
    setPosts(myPosts);
    setSummary(mySummary);

    setSelectedCompanyId((current) => {
      if (current && companyRows.some((company) => company.id === current)) return current;
      return companyRows[0]?.id ?? "";
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setAllowed(false);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    Promise.all([getUserRole(uid), getDoc(doc(db, "users", uid)), loadDashboard()])
      .then(([role, userSnap]) => {
        if (!mounted) return;
        const influencerRole = role === "influencer";
        setAllowed(influencerRole);
        const nameFromDoc = String(userSnap.data()?.displayName ?? "").trim();
        const fallbackName = auth.currentUser?.email?.split("@")[0] ?? "Influencer";
        setDisplayName(nameFromDoc || fallbackName);
      })
      .catch(() => {
        if (!mounted) return;
        setAllowed(false);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [uid, loadDashboard]);

  useEffect(() => {
    if (!selectedCompanyId) {
      setServices([]);
      setSelectedServiceId("");
      return;
    }

    let mounted = true;
    fetchCompanyServicesPublic(selectedCompanyId)
      .then((rows) => {
        if (!mounted) return;
        const activeRows = rows.filter((service) => service.isActive);
        setServices(activeRows);
        setSelectedServiceId((current) => {
          if (current && activeRows.some((service) => service.id === current)) return current;
          return activeRows[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (!mounted) return;
        setServices([]);
        setSelectedServiceId("");
      });

    return () => {
      mounted = false;
    };
  }, [selectedCompanyId]);

  async function onPickFromLibrary() {
    try {
      const picked =
        mediaType === "video"
          ? await pickVideoFromLibrary({ maxDurationMs: 15_000 })
          : await pickImageFromLibrary();
      if (!picked) return;
      setMedia(picked);
    } catch (error: any) {
      Alert.alert("Kiezen mislukt", error?.message ?? "Kon media niet kiezen.");
    }
  }

  async function onCapture() {
    try {
      const picked = mediaType === "video" ? await recordVideoWithCamera() : await captureImageWithCamera();
      if (!picked) return;
      setMedia(picked);
    } catch (error: any) {
      Alert.alert("Opname mislukt", error?.message ?? "Kon media niet opnemen.");
    }
  }

  async function onPublish() {
    if (!canSubmit || !media || !selectedCompanyId || !selectedService) return;

    setSaving(true);
    try {
      const uploadedUrl = await uploadUriToStorage(
        `influencers/${uid}/feed/${Date.now()}-${media.fileName}`,
        media.uri,
        media.mimeType,
        media.webFile
      );

      const isVideo = mediaType === "video";
      await addInfluencerFeedPost({
        influencerId: uid,
        companyId: selectedCompanyId,
        payload: {
          category,
          title: title.trim(),
          caption: caption.trim(),
          hashtags,
          mediaType,
          videoUrl: isVideo ? uploadedUrl : "",
          imageUrl: isVideo ? "" : uploadedUrl,
          thumbnailUrl: isVideo ? "" : uploadedUrl,
          sourceVideoUrl: isVideo ? uploadedUrl : "",
          sourceImageUrl: isVideo ? "" : uploadedUrl,
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          influencerName: displayName,
          influencerCommissionPercent: parsedCommissionPercent,
          creatorRole: "influencer",
          visibility: "public",
          isActive: true,
        },
      });

      setMedia(null);
      setTitle("");
      setCaption("");
      setHashtagsInput("");
      await loadDashboard();
      Alert.alert("Geplaatst", "Je video/foto is geplaatst voor dit bedrijf.");
    } catch (error: any) {
      Alert.alert("Plaatsen mislukt", error?.message ?? "Kon post niet opslaan.");
    } finally {
      setSaving(false);
    }
  }

  function onDeletePost(post: FeedPost) {
    if (deletingPostId) return;

    Alert.alert("Post verwijderen", "Weet je zeker dat je deze post wilt verwijderen?", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
          setDeletingPostId(post.id);
          try {
            await deleteMyFeedPost(post.id);
            await loadDashboard();
          } catch (error: any) {
            Alert.alert("Verwijderen mislukt", error?.message ?? "Kon deze post niet verwijderen.");
          } finally {
            setDeletingPostId(null);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
              <Text style={styles.backText}>Terug</Text>
            </Pressable>
            <Text style={styles.title}>Influencer studio</Text>
          </View>

          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : !allowed ? (
            <View style={styles.stateCard}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.danger} />
              <Text style={styles.stateText}>Alleen influencer accounts hebben toegang tot deze pagina.</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Totaal bookings</Text>
                  <Text style={styles.summaryValue}>{summary.totalBookings}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Bevestigde commissie</Text>
                  <Text style={styles.summaryValue}>EUR {summary.confirmedCommissionTotal.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>In afwachting</Text>
                  <Text style={styles.summaryValue}>EUR {summary.pendingCommissionTotal.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>1) Kies bedrijf</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {companies.map((company) => {
                    const active = company.id === selectedCompanyId;
                    return (
                      <Pressable
                        key={company.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelectedCompanyId(company.id)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{company.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>2) Koppel dienst</Text>
                {services.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    {services.map((service) => {
                      const active = service.id === selectedServiceId;
                      return (
                        <Pressable
                          key={service.id}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedServiceId(service.id)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{service.name}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.helperText}>Geen actieve diensten voor dit bedrijf gevonden.</Text>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>3) Maak post</Text>

                <View style={styles.mediaTypeRow}>
                  <Pressable
                    style={[styles.mediaTypeBtn, mediaType === "video" && styles.mediaTypeBtnActive]}
                    onPress={() => {
                      setMediaType("video");
                      setMedia(null);
                    }}
                  >
                    <Ionicons name="videocam-outline" size={14} color={mediaType === "video" ? "#fff" : COLORS.primary} />
                    <Text style={[styles.mediaTypeText, mediaType === "video" && styles.mediaTypeTextActive]}>Video</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.mediaTypeBtn, mediaType === "image" && styles.mediaTypeBtnActive]}
                    onPress={() => {
                      setMediaType("image");
                      setMedia(null);
                    }}
                  >
                    <Ionicons name="image-outline" size={14} color={mediaType === "image" ? "#fff" : COLORS.primary} />
                    <Text style={[styles.mediaTypeText, mediaType === "image" && styles.mediaTypeTextActive]}>Foto</Text>
                  </Pressable>
                </View>

                <View style={styles.pickRow}>
                  <Pressable style={styles.pickBtn} onPress={onPickFromLibrary}>
                    <Ionicons name="images-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.pickBtnText}>Galerij</Text>
                  </Pressable>
                  <Pressable style={styles.pickBtn} onPress={onCapture}>
                    <Ionicons name="camera-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.pickBtnText}>Camera</Text>
                  </Pressable>
                </View>

                {media ? (
                  <View style={styles.previewCard}>
                    {mediaType === "image" ? (
                      <Image source={{ uri: media.uri }} style={styles.previewImage} contentFit="cover" />
                    ) : (
                      <Video
                        source={{ uri: media.uri }}
                        style={styles.previewImage}
                        resizeMode={ResizeMode.COVER}
                        shouldPlay
                        isMuted
                        isLooping
                      />
                    )}
                  </View>
                ) : (
                  <Text style={styles.helperText}>Selecteer eerst een {mediaType === "video" ? "video" : "foto"}.</Text>
                )}
                {media && mediaType === "video" ? (
                  <Text style={styles.helperText}>Live preview: zo ziet je video eruit voordat je publiceert.</Text>
                ) : null}

                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Titel"
                  placeholderTextColor={COLORS.placeholder}
                  style={styles.input}
                />
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="Caption"
                  placeholderTextColor={COLORS.placeholder}
                  style={[styles.input, styles.textarea]}
                  multiline
                />
                <TextInput
                  value={hashtagsInput}
                  onChangeText={setHashtagsInput}
                  placeholder="Hashtags, bijv. #hair #glow"
                  placeholderTextColor={COLORS.placeholder}
                  style={styles.input}
                />
                <TextInput
                  value={commissionPercent}
                  onChangeText={setCommissionPercent}
                  placeholder="Commissie % (0-30)"
                  placeholderTextColor={COLORS.placeholder}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />

                <View style={styles.categoryWrap}>
                  <Text style={styles.helperText}>Categorie</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    {CATEGORIES.map((item) => {
                      const active = item === category;
                      return (
                        <Pressable
                          key={item}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setCategory(item)}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <Pressable
                  style={[styles.publishBtn, !canSubmit && styles.disabled]}
                  onPress={onPublish}
                  disabled={!canSubmit}
                >
                  <Ionicons name="paper-plane-outline" size={15} color="#fff" />
                  <Text style={styles.publishBtnText}>{saving ? "Plaatsen..." : "Plaats voor bedrijf"}</Text>
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Mijn recente influencer posts ({posts.length})</Text>
                {posts.slice(0, 8).map((post) => (
                  <View key={post.id} style={styles.postRow}>
                    <View style={styles.postThumbWrap}>
                      {previewForPost(post) ? (
                        <Image source={{ uri: previewForPost(post) }} style={styles.postThumb} contentFit="cover" />
                      ) : (
                        <View style={styles.postThumbFallback}>
                          <Ionicons name="image-outline" size={14} color={COLORS.muted} />
                        </View>
                      )}
                    </View>
                    <View style={styles.postMeta}>
                      <Text style={styles.postTitle} numberOfLines={1}>{post.title || post.serviceName || "Post"}</Text>
                      <Text style={styles.postSub} numberOfLines={1}>{post.companyName}</Text>
                      <Text style={styles.postSub}>Commissie {post.influencerCommissionPercent ?? 0}%</Text>
                    </View>
                    <View style={styles.postRight}>
                      <Text style={styles.postDate}>{formatDate(post.createdAtMs)}</Text>
                      <Pressable
                        style={[styles.postDeleteBtn, deletingPostId === post.id && styles.disabled]}
                        onPress={() => onDeletePost(post)}
                        disabled={deletingPostId === post.id}
                      >
                        <Ionicons name="trash-outline" size={13} color={COLORS.danger} />
                        <Text style={styles.postDeleteText}>Verwijder</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {!posts.length ? <Text style={styles.helperText}>Nog geen influencer posts.</Text> : null}
              </View>

              {selectedCompany ? (
                <View style={styles.footerHintCard}>
                  <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.footerHintText}>
                    Actief bedrijf: {selectedCompany.name}. Dienst: {selectedService?.name || "nog niet gekozen"}. Creator: {displayName}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 28,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
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
  title: {
    color: COLORS.text,
    fontSize: 23,
    fontWeight: "900",
  },
  stateWrap: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  stateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#f1c3d3",
    backgroundColor: "#fff0f6",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stateText: {
    flex: 1,
    color: COLORS.danger,
    fontWeight: "700",
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  summaryValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 9,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "900",
  },
  chipsRow: {
    gap: 7,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  chipText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  helperText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
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
    fontWeight: "800",
    fontSize: 12,
  },
  mediaTypeTextActive: {
    color: "#fff",
  },
  pickRow: {
    flexDirection: "row",
    gap: 8,
  },
  pickBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pickBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: "hidden",
    minHeight: 120,
  },
  previewImage: {
    width: "100%",
    height: 180,
  },
  previewVideoPlaceholder: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  previewVideoText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
  input: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: COLORS.text,
    fontWeight: "600",
  },
  textarea: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  categoryWrap: {
    gap: 6,
  },
  publishBtn: {
    minHeight: 45,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  publishBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  postRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  postThumbWrap: {
    width: 48,
    height: 64,
    borderRadius: 9,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
  },
  postThumb: {
    width: "100%",
    height: "100%",
  },
  postThumbFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  postMeta: {
    flex: 1,
    gap: 1,
  },
  postTitle: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  postSub: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  postDate: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  postRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  postDeleteBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f3cad6",
    backgroundColor: "#fff2f7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postDeleteText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: "800",
  },
  footerHintCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerHintText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.5,
  },
});
