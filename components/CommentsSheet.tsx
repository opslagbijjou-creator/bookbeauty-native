import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet from "./BottomSheet";
import {
  addPostComment,
  deletePostComment,
  fetchPostComments,
  FeedComment,
  getCommentLikeCount,
  isCommentLiked,
  toggleCommentLike,
} from "../lib/socialRepo";
import { confirmAction } from "../lib/confirmAction";
import type { AppRole } from "../lib/roles";
import { auth } from "../lib/firebase";
import { COLORS } from "../lib/ui";

type CommentsSheetProps = {
  visible: boolean;
  postId: string | null;
  uid: string | null;
  role: AppRole;
  onClose: () => void;
  onCountChange?: (postId: string, count: number) => void;
};

const COMMENTS_VISIBLE_LIMIT = 20;

function formatCommentDate(createdAtMs?: number): string {
  if (!createdAtMs) return "nu";
  return new Date(createdAtMs).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
  });
}

function commentAuthorLabel(comment: FeedComment): string {
  if (comment.authorName?.trim()) return comment.authorName.trim();
  if (comment.role === "company") return "Bedrijf";
  if (comment.role === "admin") return "Admin";
  return "Klant";
}

export default function CommentsSheet({
  visible,
  postId,
  uid,
  role,
  onClose,
  onCountChange,
}: CommentsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likeCountMap, setLikeCountMap] = useState<Record<string, number>>({});
  const [likeBusyMap, setLikeBusyMap] = useState<Record<string, boolean>>({});
  const [keyboardInset, setKeyboardInset] = useState(0);
  const loadTokenRef = useRef(0);

  const canPost = useMemo(() => Boolean(uid) && text.trim().length > 0, [uid, text]);
  const isInitialLoading = loading && comments.length === 0;
  const authorName = useMemo(() => {
    const email = auth.currentUser?.email ?? "";
    if (!email) return undefined;
    return email.split("@")[0];
  }, []);

  const hydrateCommentMeta = useCallback(
    async (targetPostId: string, targetUid: string | null, rows: FeedComment[], token: number) => {
      if (!rows.length) {
        if (loadTokenRef.current !== token) return;
        setLikeCountMap({});
        setLikedMap({});
        return;
      }

      const likeCounts = await Promise.all(rows.map((row) => getCommentLikeCount(targetPostId, row.id)));
      if (loadTokenRef.current !== token) return;

      const countMap: Record<string, number> = {};
      rows.forEach((row, index) => {
        countMap[row.id] = likeCounts[index];
      });
      setLikeCountMap(countMap);

      if (!targetUid) {
        setLikedMap({});
        return;
      }

      const likedStates = await Promise.all(rows.map((row) => isCommentLiked(targetPostId, row.id, targetUid)));
      if (loadTokenRef.current !== token) return;

      const likedNext: Record<string, boolean> = {};
      rows.forEach((row, index) => {
        likedNext[row.id] = likedStates[index];
      });
      setLikedMap(likedNext);
    },
    []
  );

  const load = useCallback(async () => {
    if (!postId) return;

    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;

    setLoading(true);
    try {
      const rows = await fetchPostComments(postId, COMMENTS_VISIBLE_LIMIT);
      if (loadTokenRef.current !== token) return;

      setComments(rows);
      onCountChange?.(postId, rows.length);

      setLikeCountMap((prev) => {
        const next: Record<string, number> = {};
        rows.forEach((row) => {
          next[row.id] = prev[row.id] ?? 0;
        });
        return next;
      });

      if (uid) {
        setLikedMap((prev) => {
          const next: Record<string, boolean> = {};
          rows.forEach((row) => {
            next[row.id] = prev[row.id] ?? false;
          });
          return next;
        });
      } else {
        setLikedMap({});
      }

      hydrateCommentMeta(postId, uid, rows, token).catch(() => null);
    } finally {
      if (loadTokenRef.current === token) {
        setLoading(false);
      }
    }
  }, [postId, uid, onCountChange, hydrateCommentMeta]);

  useEffect(() => {
    if (!visible || !postId) return;
    load().catch(() => null);
  }, [visible, postId, load]);

  useEffect(() => {
    if (!visible) return;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates?.height ?? 0));
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardInset(0));

    return () => {
      show.remove();
      hide.remove();
      setKeyboardInset(0);
    };
  }, [visible]);

  async function onSubmit() {
    if (!postId || !uid || !canPost || submitting) return;
    setSubmitting(true);
    try {
      await addPostComment(postId, uid, role, text, authorName);
      setText("");
      await load();
    } catch (error: any) {
      Alert.alert("Reactie mislukt", error?.message ?? "Kon reactie niet plaatsen.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onToggleLike(commentId: string) {
    if (!postId || !uid || likeBusyMap[commentId]) return;
    const previousLiked = Boolean(likedMap[commentId]);
    const previousCount = likeCountMap[commentId] ?? 0;
    const optimisticLiked = !previousLiked;
    const optimisticCount = Math.max(0, previousCount + (optimisticLiked ? 1 : -1));
    setLikeBusyMap((prev) => ({ ...prev, [commentId]: true }));
    setLikedMap((prev) => ({ ...prev, [commentId]: optimisticLiked }));
    setLikeCountMap((prev) => ({ ...prev, [commentId]: optimisticCount }));
    try {
      const next = await toggleCommentLike(postId, commentId, uid, role);
      setLikedMap((prev) => ({ ...prev, [commentId]: next }));
      getCommentLikeCount(postId, commentId)
        .then((count) => setLikeCountMap((prev) => ({ ...prev, [commentId]: count })))
        .catch(() => null);
    } catch (error: any) {
      setLikedMap((prev) => ({ ...prev, [commentId]: previousLiked }));
      setLikeCountMap((prev) => ({ ...prev, [commentId]: previousCount }));
      Alert.alert("Like mislukt", error?.message ?? "Kon like niet aanpassen.");
    } finally {
      setLikeBusyMap((prev) => ({ ...prev, [commentId]: false }));
    }
  }

  function onDelete(commentId: string) {
    if (!postId) return;
    void (async () => {
      const confirmed = await confirmAction({
        title: "Reactie verwijderen",
        message: "Weet je zeker dat je deze reactie wilt verwijderen?",
        confirmText: "Verwijderen",
        cancelText: "Annuleren",
        destructive: true,
      });
      if (!confirmed) return;

      try {
        await deletePostComment(postId, commentId);
        await load();
      } catch (error: any) {
        Alert.alert("Verwijderen mislukt", error?.message ?? "Kon reactie niet verwijderen.");
      }
    })();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      keyboardAware
      keyboardVerticalOffset={8}
      sheetStyle={styles.sheet}
    >
      <View style={styles.handle} />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.primary} />
            <Text style={styles.title}>Reacties</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color={COLORS.muted} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {comments.length} {comments.length === 1 ? "reactie" : "reacties"}
        </Text>

        <View style={styles.listShell}>
          {isInitialLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              removeClippedSubviews={false}
              renderItem={({ item }) => {
                const mine = uid === item.userId;
                return (
                  <View style={styles.commentCard}>
                    <View style={styles.commentTop}>
                      <Text style={styles.author}>{commentAuthorLabel(item)}</Text>
                      <Text style={styles.date}>{formatCommentDate(item.createdAtMs)}</Text>
                    </View>
                    <Text style={styles.commentText}>{item.text}</Text>
                    <View style={styles.commentActions}>
                      <Pressable
                        style={[styles.likeBtn, likeBusyMap[item.id] && styles.likeBtnBusy]}
                        onPress={() => onToggleLike(item.id)}
                        disabled={Boolean(likeBusyMap[item.id])}
                      >
                        <Ionicons
                          name={likedMap[item.id] ? "heart" : "heart-outline"}
                          size={14}
                          color={likedMap[item.id] ? COLORS.primary : COLORS.muted}
                        />
                        <Text style={styles.likeText}>{likeCountMap[item.id] ?? 0}</Text>
                      </Pressable>
                      {mine ? (
                        <Pressable style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
                          <Ionicons name="trash-outline" size={13} color={COLORS.danger} />
                          <Text style={styles.deleteText}>Verwijder</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>Nog geen reacties.</Text>
                </View>
              }
            />
          )}
        </View>

        <View style={[styles.inputDock, Platform.OS === "android" && keyboardInset > 0 && { paddingBottom: 10 }]}>
          <View style={styles.inputRow}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={uid ? "Schrijf een reactie..." : "Log in om te reageren"}
              placeholderTextColor={COLORS.placeholder}
              editable={Boolean(uid)}
              style={styles.input}
              multiline
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.sendBtn, (!canPost || submitting) && styles.sendBtnDisabled]}
              onPress={onSubmit}
              disabled={!canPost || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    height: "82%",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: COLORS.border,
    marginBottom: 2,
  },
  content: {
    flex: 1,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: -4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
  },
  listShell: {
    flex: 1,
    minHeight: 240,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 10,
    gap: 8,
    paddingBottom: 14,
  },
  commentCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    gap: 5,
    backgroundColor: COLORS.surface,
  },
  commentTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  author: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  date: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  commentText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  likeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#fff",
  },
  likeBtnBusy: {
    opacity: 0.65,
  },
  likeText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#ffeff5",
  },
  deleteText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  emptyWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  inputDock: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 14,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
});
