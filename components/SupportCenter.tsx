import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import type { AppRole } from "../lib/roles";
import {
  createSupportThread,
  markSupportThreadReadByAdmin,
  markSupportThreadReadByCreator,
  sendSupportMessage,
  setSupportThreadStatus,
  subscribeMySupportThreads,
  subscribeSupportMessages,
  type SupportMessage,
  type SupportThread,
} from "../lib/supportRepo";
import { COLORS } from "../lib/ui";

type Props = {
  uid: string;
  role: AppRole;
  displayName?: string;
  email?: string;
  title?: string;
  subtitle?: string;
  allowCreateThread?: boolean;
  allowStatusChange?: boolean;
};

function formatWhen(timestampMs: number): string {
  if (!timestampMs) return "nu";
  return new Date(timestampMs).toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: AppRole): string {
  if (role === "company") return "Bedrijf";
  if (role === "employee") return "Medewerker";
  if (role === "influencer") return "Influencer";
  if (role === "admin") return "BookBeauty";
  return "Klant";
}

export default function SupportCenter({
  uid,
  role,
  displayName,
  email,
  title = "Support & vragen",
  subtitle = "Stuur direct je vragen naar het BookBeauty team.",
  allowCreateThread = true,
  allowStatusChange = false,
}: Props) {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");

  const [sendingNew, setSendingNew] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  useEffect(() => {
    if (!uid) return;
    setLoadingThreads(true);
    return subscribeMySupportThreads(
      { uid, role },
      (rows) => {
        setThreads(rows);
        setLoadingThreads(false);
      },
      () => setLoadingThreads(false)
    );
  }, [uid, role]);

  useEffect(() => {
    if (!activeThreadId) return;
    if (!threads.some((row) => row.id === activeThreadId)) {
      setActiveThreadId(null);
      setMessages([]);
    }
  }, [activeThreadId, threads]);

  const activeThread = useMemo(
    () => threads.find((row) => row.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const unsub = subscribeSupportMessages(
      activeThreadId,
      (rows) => {
        setMessages(rows);
        setLoadingMessages(false);
      },
      () => setLoadingMessages(false)
    );

    return unsub;
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThread) return;
    if (role === "admin") {
      if (activeThread.unreadByAdminCount > 0) {
        markSupportThreadReadByAdmin(activeThread.id).catch(() => null);
      }
      return;
    }

    if (activeThread.unreadByCreatorCount > 0) {
      markSupportThreadReadByCreator(activeThread.id).catch(() => null);
    }
  }, [activeThread, role]);

  async function onCreateThread() {
    if (!uid || sendingNew) return;
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanSubject || !cleanMessage) return;

    setSendingNew(true);
    try {
      const threadId = await createSupportThread({
        createdById: uid,
        createdByRole: role,
        createdByName: displayName,
        createdByEmail: email,
        subject: cleanSubject,
        message: cleanMessage,
      });
      setSubject("");
      setMessage("");
      setActiveThreadId(threadId);
    } finally {
      setSendingNew(false);
    }
  }

  async function onSendReply() {
    if (!uid || !activeThread || sendingReply) return;
    const cleanReply = reply.trim();
    if (!cleanReply) return;

    setSendingReply(true);
    try {
      await sendSupportMessage({
        threadId: activeThread.id,
        senderId: uid,
        senderRole: role,
        senderName: displayName,
        text: cleanReply,
      });
      setReply("");
    } finally {
      setSendingReply(false);
    }
  }

  async function onToggleStatus() {
    if (!activeThread || changingStatus) return;
    const nextStatus = activeThread.status === "open" ? "closed" : "open";
    setChangingStatus(true);
    try {
      await setSupportThreadStatus(activeThread.id, nextStatus);
    } finally {
      setChangingStatus(false);
    }
  }

  if (activeThread) {
    const isClosed = activeThread.status === "closed";

    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={18}
      >
        <View style={styles.threadTopRow}>
          <Pressable style={styles.backBtn} onPress={() => setActiveThreadId(null)}>
            <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
            <Text style={styles.backText}>Alle vragen</Text>
          </Pressable>
          <View style={[styles.statusPill, isClosed ? styles.closedPill : styles.openPill]}>
            <Text style={styles.statusPillText}>{isClosed ? "Gesloten" : "Open"}</Text>
          </View>
        </View>

        <Text style={styles.threadSubject}>{activeThread.subject}</Text>
        <Text style={styles.threadMeta}>Ticket van {roleLabel(activeThread.createdByRole)}</Text>

        {allowStatusChange ? (
          <Pressable style={styles.statusBtn} onPress={onToggleStatus} disabled={changingStatus}>
            <Ionicons
              name={isClosed ? "lock-open-outline" : "lock-closed-outline"}
              size={14}
              color={COLORS.primary}
            />
            <Text style={styles.statusBtnText}>
              {changingStatus ? "Bezig..." : isClosed ? "Ticket heropenen" : "Ticket sluiten"}
            </Text>
          </Pressable>
        ) : null}

        <ScrollView contentContainerStyle={styles.messagesWrap} keyboardShouldPersistTaps="handled">
          {loadingMessages ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : messages.length ? (
            messages.map((row) => {
              const mine = row.senderId === uid;
              return (
                <View key={row.id} style={[styles.messageBubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={styles.messageAuthor}>{mine ? "Jij" : row.senderName?.trim() || roleLabel(row.senderRole)}</Text>
                  <Text style={styles.messageText}>{row.text}</Text>
                  <Text style={styles.messageWhen}>{formatWhen(row.createdAtMs || row.updatedAtMs)}</Text>
                </View>
              );
            })
          ) : (
            <View style={styles.stateWrap}>
              <Text style={styles.emptyText}>Nog geen berichten.</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.replyCard}>
          <TextInput
            style={[styles.input, styles.replyInput, isClosed && styles.disabledInput]}
            value={reply}
            onChangeText={setReply}
            placeholder={isClosed ? "Ticket is gesloten" : "Typ je bericht"}
            placeholderTextColor={COLORS.placeholder}
            multiline
            editable={!isClosed}
          />
          <Pressable
            style={[styles.primaryBtn, (!reply.trim() || sendingReply || isClosed) && styles.disabled]}
            onPress={onSendReply}
            disabled={!reply.trim() || sendingReply || isClosed}
          >
            <Ionicons name="send-outline" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>{sendingReply ? "Versturen..." : "Verstuur"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Ionicons name="help-circle-outline" size={18} color={COLORS.primary} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {allowCreateThread ? (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Nieuwe vraag</Text>
          <TextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Onderwerp"
            placeholderTextColor={COLORS.placeholder}
          />
          <TextInput
            style={[styles.input, styles.messageInput]}
            value={message}
            onChangeText={setMessage}
            placeholder="Beschrijf je vraag"
            placeholderTextColor={COLORS.placeholder}
            multiline
          />
          <Pressable
            style={[styles.primaryBtn, (!subject.trim() || !message.trim() || sendingNew) && styles.disabled]}
            onPress={onCreateThread}
            disabled={!subject.trim() || !message.trim() || sendingNew}
          >
            <Ionicons name="paper-plane-outline" size={14} color="#fff" />
            <Text style={styles.primaryBtnText}>{sendingNew ? "Versturen..." : "Vraag versturen"}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{role === "admin" ? "Binnengekomen vragen" : "Jouw vragen"}</Text>
      </View>

      {loadingThreads ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : threads.length ? (
        <View style={styles.listWrap}>
          {threads.map((row) => {
            const unread = role === "admin" ? row.unreadByAdminCount : row.unreadByCreatorCount;
            return (
              <Pressable key={row.id} style={styles.threadCard} onPress={() => setActiveThreadId(row.id)}>
                <View style={styles.threadRowTop}>
                  <Text style={styles.threadTitle} numberOfLines={1}>
                    {row.subject}
                  </Text>
                  <Text style={styles.threadTime}>{formatWhen(row.lastMessageAtMs || row.updatedAtMs)}</Text>
                </View>
                {role === "admin" ? (
                  <Text style={styles.threadOwner} numberOfLines={1}>
                    {row.createdByName?.trim() || row.createdByEmail?.trim() || row.createdById}
                  </Text>
                ) : null}
                <Text style={styles.threadPreview} numberOfLines={2}>
                  {row.lastMessagePreview || "Open ticket"}
                </Text>
                <View style={styles.threadMetaRow}>
                  <View style={[styles.statusPillSmall, row.status === "closed" ? styles.closedPill : styles.openPill]}>
                    <Text style={styles.statusPillSmallText}>{row.status === "closed" ? "Gesloten" : "Open"}</Text>
                  </View>
                  {unread > 0 ? (
                    <View style={styles.unreadPill}>
                      <Text style={styles.unreadPillText}>{unread} nieuw</Text>
                    </View>
                  ) : (
                    <Text style={styles.threadCount}>{row.messageCount} berichten</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.stateWrap}>
          <Text style={styles.emptyText}>Nog geen vragen.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 10,
    paddingBottom: 26,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "900",
  },
  subtitle: {
    color: COLORS.muted,
    fontWeight: "600",
  },
  formCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  formTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
  },
  messageInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  replyInput: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  listHeader: {
    marginTop: 2,
  },
  listTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 15,
  },
  listWrap: {
    gap: 8,
  },
  threadCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 4,
  },
  threadRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  threadTitle: {
    flex: 1,
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 14,
  },
  threadTime: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  threadOwner: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  threadPreview: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  threadMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPillSmall: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusPillSmallText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: "800",
  },
  openPill: {
    borderColor: "#bee2cb",
    backgroundColor: "#e8f7ee",
  },
  closedPill: {
    borderColor: "#d9d9d9",
    backgroundColor: "#f1f1f1",
  },
  unreadPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#f0bfd3",
    backgroundColor: "#fff3f9",
  },
  unreadPillText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: "900",
  },
  threadCount: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  primaryBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  stateWrap: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.45,
  },
  threadTopRow: {
    paddingTop: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 11,
  },
  threadSubject: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    paddingHorizontal: 14,
    marginTop: 10,
  },
  threadMeta: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 14,
    marginTop: 2,
  },
  statusBtn: {
    marginTop: 8,
    marginHorizontal: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  messagesWrap: {
    paddingHorizontal: 14,
    gap: 8,
    paddingVertical: 12,
    paddingBottom: 22,
  },
  messageBubble: {
    maxWidth: "88%",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    borderColor: "#f1bfd7",
    backgroundColor: "#fff3fa",
  },
  bubbleOther: {
    alignSelf: "flex-start",
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  messageAuthor: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 11,
  },
  messageText: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 18,
  },
  messageWhen: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 1,
  },
  replyCard: {
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 10,
    gap: 8,
  },
  disabledInput: {
    backgroundColor: "#f3f3f3",
  },
});
