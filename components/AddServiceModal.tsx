import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import CategoryChips from "./CategoryChips";
import { addMyService, type CompanyService, updateMyService } from "../lib/serviceRepo";
import { captureImageWithCamera, pickImageFromLibrary, uploadUriToStorage } from "../lib/mediaRepo";
import { CATEGORIES, COLORS } from "../lib/ui";

type AddServiceModalProps = {
  visible: boolean;
  companyId: string;
  initialService?: CompanyService | null;
  defaultCategory?: string;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
};

const TOTAL_STEPS = 4;
const STEP_META = [
  { id: 1, label: "Basis" },
  { id: 2, label: "Tijd & prijs" },
  { id: 3, label: "Media" },
  { id: 4, label: "Check" },
] as const;

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

function normalizeCategory(defaultCategory?: string): string {
  if (defaultCategory && CATEGORIES.includes(defaultCategory as (typeof CATEGORIES)[number])) {
    return defaultCategory;
  }
  return CATEGORIES[0];
}

export default function AddServiceModal({
  visible,
  companyId,
  initialService,
  defaultCategory,
  onClose,
  onSaved,
}: AddServiceModalProps) {
  const isEditing = Boolean(initialService?.id);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [durationMin, setDurationMin] = useState("30");
  const [price, setPrice] = useState("30");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [showInFeed, setShowInFeed] = useState(true);
  const [bufferBeforeMin, setBufferBeforeMin] = useState(0);
  const [bufferAfterMin, setBufferAfterMin] = useState(0);
  const [capacity, setCapacity] = useState(1);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollRef = useRef<ScrollView | null>(null);
  const fieldYMap = useRef<Record<string, number>>({});

  const parsedPrice = useMemo(() => Number(String(price).replace(",", ".")), [price]);
  const parsedDuration = useMemo(() => Number(durationMin), [durationMin]);
  const currentStepMeta = useMemo(
    () => STEP_META.find((item) => item.id === step) ?? STEP_META[0],
    [step]
  );

  useEffect(() => {
    const onShow = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const onHide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(onShow, (event) => {
      setKeyboardOpen(true);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(onHide, () => {
      setKeyboardOpen(false);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function registerFieldY(key: string, y: number) {
    fieldYMap.current[key] = y;
  }

  function scrollToField(key: string) {
    const y = fieldYMap.current[key];
    if (typeof y !== "number") return;
    const targetY = Math.max(0, y - 26);
    const runScroll = () => {
      scrollRef.current?.scrollTo({ y: targetY, animated: true });
    };

    requestAnimationFrame(() => {
      runScroll();
    });
    setTimeout(runScroll, 130);
  }

  function onInputFocus(fieldKey: string) {
    return (event: any) => {
      scrollToField(fieldKey);

      const targetHandle = event?.target;
      if (!targetHandle) return;
      const extraOffset = Platform.OS === "ios" ? 110 : 150;

      setTimeout(() => {
        (scrollRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(
          targetHandle,
          extraOffset,
          true
        );
      }, 60);
    };
  }

  useEffect(() => {
    if (!visible) return;

    setStep(1);

    if (initialService) {
      setName(initialService.name);
      setDescription(initialService.description ?? "");
      setCategory(initialService.category);
      setDurationMin(String(initialService.durationMin));
      setPrice(String(initialService.price));
      setPhotoUrls(initialService.photoUrls ?? []);
      setShowInFeed(initialService.isActive);
      setBufferBeforeMin(initialService.bufferBeforeMin ?? 0);
      setBufferAfterMin(initialService.bufferAfterMin ?? 0);
      setCapacity(initialService.capacity ?? 1);
      return;
    }

    setName("");
    setDescription("");
    setCategory(normalizeCategory(defaultCategory));
    setDurationMin("30");
    setPrice("30");
    setPhotoUrls([]);
    setShowInFeed(true);
    setBufferBeforeMin(0);
    setBufferAfterMin(0);
    setCapacity(1);
  }, [visible, initialService, defaultCategory]);

  function validateStep(currentStep: number): boolean {
    if (currentStep === 1) {
      if (name.trim().length < 2) {
        Alert.alert("Controle", "Vul een duidelijke dienstnaam in (minimaal 2 tekens).");
        return false;
      }
      return true;
    }

    if (currentStep === 2) {
      if (!Number.isFinite(parsedDuration) || parsedDuration < 5) {
        Alert.alert("Controle", "Duur moet minimaal 5 minuten zijn.");
        return false;
      }
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        Alert.alert("Controle", "Prijs moet een geldig bedrag zijn.");
        return false;
      }
      return true;
    }

    if (currentStep === 3) {
      if (photoUrls.length > 3) {
        Alert.alert("Controle", "Maximaal 3 foto's per dienst.");
        return false;
      }
      return true;
    }

    return true;
  }

  function onNextStep() {
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
  }

  function onPrevStep() {
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function onUploadPhoto(mode: "library" | "camera") {
    if (!companyId) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om media toe te voegen.");
      return;
    }
    if (photoUploading) return;
    if (photoUrls.length >= 3) {
      Alert.alert("Max bereikt", "Per dienst kun je maximaal 3 foto's uploaden.");
      return;
    }

    try {
      setPhotoUploading(true);
      const media = mode === "library" ? await pickImageFromLibrary() : await captureImageWithCamera();
      if (!media) return;

      const uploaded = await uploadUriToStorage(
        `companies/${companyId}/services/${initialService?.id ?? "draft"}/${Date.now()}-${media.fileName}`,
        media.uri,
        media.mimeType
      );

      setPhotoUrls((prev) => [...prev, uploaded].slice(0, 3));
    } catch (error: any) {
      Alert.alert("Upload mislukt", error?.message ?? "Kon foto niet uploaden.");
    } finally {
      setPhotoUploading(false);
    }
  }

  function openUploadSourcePicker() {
    if (Platform.OS === "web") {
      onUploadPhoto("library").catch(() => null);
      return;
    }

    Alert.alert("Foto toevoegen", "Kies hoe je deze foto wilt toevoegen.", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Galerij",
        onPress: () => {
          onUploadPhoto("library").catch(() => null);
        },
      },
      {
        text: "Camera",
        onPress: () => {
          onUploadPhoto("camera").catch(() => null);
        },
      },
    ]);
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((item) => item !== url));
  }

  async function onSave() {
    if (!companyId) {
      Alert.alert("Niet ingelogd", "Log opnieuw in om diensten op te slaan.");
      return;
    }
    if (saving) return;

    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category,
        durationMin: Math.max(5, Math.round(parsedDuration || 0)),
        price: Number(parsedPrice.toFixed(2)),
        photoUrls,
        isActive: showInFeed,
        bufferBeforeMin,
        bufferAfterMin,
        capacity,
      };

      if (initialService?.id) {
        await updateMyService(companyId, initialService.id, payload);
      } else {
        await addMyService(companyId, payload);
      }

      await onSaved?.();
      onClose();
    } catch (error: any) {
      Alert.alert("Opslaan mislukt", error?.message ?? "Kon dienst niet opslaan.");
    } finally {
      setSaving(false);
    }
  }

  function renderStepContent() {
    if (step === 1) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Basisinformatie</Text>
          <Text style={styles.stepDescription}>Vertel duidelijk wat deze dienst inhoudt.</Text>

          <View style={styles.fieldWrap} onLayout={(event) => registerFieldY("name", event.nativeEvent.layout.y)}>
            <Text style={styles.fieldLabel}>Dienst naam</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onFocus={onInputFocus("name")}
              placeholder="Bijv. Knippen + föhnen"
              placeholderTextColor={COLORS.placeholder}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldWrap} onLayout={(event) => registerFieldY("description", event.nativeEvent.layout.y)}>
            <Text style={styles.fieldLabel}>Korte beschrijving</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              onFocus={onInputFocus("description")}
              placeholder="Wat krijgt de klant precies?"
              placeholderTextColor={COLORS.placeholder}
              style={[styles.input, styles.textarea]}
              multiline
              maxLength={240}
            />
            <Text style={styles.fieldCount}>{description.trim().length}/240</Text>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Categorie</Text>
            <CategoryChips items={[...CATEGORIES]} active={category} onChange={setCategory} iconMap={categoryIcons} />
          </View>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Tijd & prijs</Text>
          <Text style={styles.stepDescription}>Vul duidelijke waarden in. Geen losse nummer-vakjes zonder context.</Text>

          <View style={styles.fieldWrap} onLayout={(event) => registerFieldY("durationMin", event.nativeEvent.layout.y)}>
            <Text style={styles.fieldLabel}>Duur (minuten)</Text>
            <TextInput
              value={durationMin}
              onChangeText={setDurationMin}
              onFocus={onInputFocus("durationMin")}
              keyboardType="numeric"
              placeholder="Bijv. 45"
              placeholderTextColor={COLORS.placeholder}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldWrap} onLayout={(event) => registerFieldY("price", event.nativeEvent.layout.y)}>
            <Text style={styles.fieldLabel}>Prijs (EUR)</Text>
            <TextInput
              value={price}
              onChangeText={setPrice}
              onFocus={onInputFocus("price")}
              keyboardType="decimal-pad"
              placeholder="Bijv. 39.95"
              placeholderTextColor={COLORS.placeholder}
              style={styles.input}
            />
          </View>
        </View>
      );
    }

    if (step === 3) {
      return (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Foto&apos;s & zichtbaarheid</Text>
          <Text style={styles.stepDescription}>Voeg optioneel 1 tot 3 foto&apos;s toe zodat klanten direct zien wat je aanbiedt.</Text>

          <View style={styles.photoCard}>
            <View style={styles.photoTitleRow}>
              <Ionicons name="images-outline" size={14} color={COLORS.primary} />
              <Text style={styles.photoTitle}>Foto&apos;s ({photoUrls.length}/3) • optioneel</Text>
            </View>

            <View style={styles.photoActions}>
              <Pressable style={[styles.photoBtnPrimary, photoUploading && styles.disabled]} onPress={openUploadSourcePicker}>
                <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                <Text style={styles.photoBtnPrimaryText}>Upload foto</Text>
              </Pressable>
              <Pressable style={[styles.photoBtn, photoUploading && styles.disabled]} onPress={() => onUploadPhoto("camera")}>
                <Ionicons name="camera-outline" size={13} color={COLORS.primary} />
                <Text style={styles.photoBtnText}>Snelle camera</Text>
              </Pressable>
            </View>

            {photoUploading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}

            {photoUrls.length ? (
              <View style={styles.previewRow}>
                {photoUrls.map((url) => (
                  <View key={url} style={styles.previewWrap}>
                    <Image source={{ uri: url }} style={styles.previewImg} contentFit="cover" />
                    <Pressable style={styles.previewDelete} onPress={() => removePhoto(url)}>
                      <Ionicons name="close" size={11} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.photoHint}>Je kunt optioneel tot 3 foto&apos;s toevoegen voor klanten.</Text>
            )}
          </View>

          <View style={styles.toggleCard}>
            <View>
              <Text style={styles.toggleLabel}>Toon in feed</Text>
              <Text style={styles.toggleHint}>Als uit, blijft deze dienst verborgen voor klanten.</Text>
            </View>
            <Switch value={showInFeed} onValueChange={setShowInFeed} />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>Bevestigen</Text>
        <Text style={styles.stepDescription}>Controleer alles en sla je dienst op.</Text>

        <View style={styles.summaryCard}>
          <SummaryRow label="Dienst" value={name.trim() || "-"} />
          <SummaryRow label="Categorie" value={category} />
          <SummaryRow label="Duur" value={`${Math.max(5, Math.round(parsedDuration || 0))} min`} />
          <SummaryRow label="Prijs" value={`EUR ${Number(parsedPrice || 0).toFixed(2)}`} />
          <SummaryRow label="Foto&apos;s" value={`${photoUrls.length}/3`} />
          <SummaryRow label="Toon in feed" value={showInFeed ? "Ja" : "Nee"} />
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
        >
          <View
            style={[
              styles.modalCard,
              keyboardOpen && styles.modalCardKeyboard,
              Platform.OS === "android" && keyboardOpen
                ? {
                    marginBottom: Math.max(8, keyboardHeight - 30),
                  }
                : null,
            ]}
          >
            <View style={styles.topRow}>
              <View style={styles.topTitleWrap}>
                <Text style={styles.title}>{isEditing ? "Dienst bewerken" : "Nieuwe dienst toevoegen"}</Text>
                <Text style={styles.progressText}>
                  Stap {step} van {TOTAL_STEPS} • {currentStepMeta.label}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={16} color={COLORS.muted} />
              </Pressable>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
            </View>

            <View style={styles.stepChipsRow}>
              {STEP_META.map((item) => {
                const isActive = step === item.id;
                const isDone = step > item.id;
                return (
                  <View key={item.id} style={[styles.stepChip, (isActive || isDone) && styles.stepChipActive]}>
                    <Text style={[styles.stepChipText, (isActive || isDone) && styles.stepChipTextActive]}>
                      {item.id}. {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <ScrollView
              ref={scrollRef}
              contentContainerStyle={[
                styles.content,
                keyboardOpen && {
                  paddingBottom: Math.max(90, keyboardHeight + 100),
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              automaticallyAdjustKeyboardInsets
            >
              {renderStepContent()}
            </ScrollView>

            <View style={styles.footerRow}>
              {step > 1 ? (
                <Pressable style={styles.backBtn} onPress={onPrevStep}>
                  <Ionicons name="chevron-back-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.backText}>Vorige</Text>
                </Pressable>
              ) : (
                <View style={{ flex: 1 }} />
              )}

              {step < TOTAL_STEPS ? (
                <Pressable style={styles.nextBtn} onPress={onNextStep}>
                  <Text style={styles.nextText}>Volgende</Text>
                  <Ionicons name="chevron-forward-outline" size={14} color="#fff" />
                </Pressable>
              ) : (
                <Pressable style={[styles.saveBtn, saving && styles.disabled]} onPress={onSave} disabled={saving}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={14} color="#fff" />}
                  <Text style={styles.saveText}>Dienst opslaan</Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17,17,17,0.35)",
    justifyContent: "flex-end",
  },
  keyboardAvoid: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "95%",
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 11,
  },
  modalCardKeyboard: {
    maxHeight: "96%",
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  topTitleWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: COLORS.text,
    fontSize: 19,
    fontWeight: "900",
  },
  progressText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f2d9e6",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
  },
  stepChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  stepChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stepChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  stepChipText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  stepChipTextActive: {
    color: COLORS.primary,
  },
  content: {
    paddingBottom: 12,
    gap: 2,
  },
  stepCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 13,
    gap: 12,
  },
  stepTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  stepDescription: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  fieldWrap: {
    gap: 7,
  },
  fieldLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontWeight: "600",
  },
  textarea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  fieldCount: {
    alignSelf: "flex-end",
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: -2,
  },
  photoCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: 8,
  },
  photoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  photoTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
  },
  photoActions: {
    flexDirection: "row",
    gap: 8,
  },
  photoBtnPrimary: {
    flex: 1.2,
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  photoBtnPrimaryText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  photoBtn: {
    flex: 0.9,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  photoBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  previewRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  previewWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    position: "relative",
  },
  previewImg: {
    width: "100%",
    height: "100%",
  },
  previewDelete: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoHint: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  toggleCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  toggleLabel: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 12,
  },
  toggleHint: {
    color: COLORS.muted,
    fontWeight: "600",
    fontSize: 11,
    marginTop: 2,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  summaryValue: {
    flex: 1,
    textAlign: "right",
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
    paddingTop: 6,
  },
  backBtn: {
    minHeight: 42,
    minWidth: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  backText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 12,
  },
  nextBtn: {
    minHeight: 42,
    minWidth: 130,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10,
  },
  nextText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  saveBtn: {
    minHeight: 46,
    flex: 1,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  saveText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
});
