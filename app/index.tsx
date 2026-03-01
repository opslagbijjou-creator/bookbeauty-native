import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import {
  DEMO_MARKETPLACE_FEED,
  DEMO_MARKETPLACE_SALONS,
  buildHomeSeo,
  getDefaultCityPath,
} from "../lib/marketplace";
import { COLORS } from "../lib/ui";

export default function HomeScreen() {
  const router = useRouter();
  const [installOpen, setInstallOpen] = useState(false);
  const seo = buildHomeSeo();

  return (
    <MarketplaceShell active="home">
      <MarketplaceSeo
        title={seo.title}
        description={seo.description}
        pathname={seo.pathname}
        image={DEMO_MARKETPLACE_SALONS[0].coverImageUrl}
      />

      <View style={styles.hero}>
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroKicker}>Phase 1 marketplace</Text>
          <Text style={styles.heroTitle}>Ontdek salons. Bekijk echte video&apos;s. Boek direct.</Text>
          <Text style={styles.heroSubtitle}>
            BookBeauty verbindt beauty professionals en klanten via video en een simpele boekervaring.
          </Text>

          <View style={styles.heroCtas}>
            <Pressable onPress={() => router.push(getDefaultCityPath() as never)} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Ontdek salons</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/(auth)/register" as never)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Meld je salon gratis aan</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.heroPreview}>
          {DEMO_MARKETPLACE_FEED.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.previewCard}>
              <Image source={{ uri: item.posterUrl }} style={styles.previewImage} contentFit="cover" transition={220} />
              <View style={styles.previewOverlay}>
                <Text style={styles.previewTitle}>{item.title}</Text>
                <Text style={styles.previewCaption} numberOfLines={2}>
                  {item.caption}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionGrid}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Hoe het werkt</Text>
          {[
            "1. Kies stad en categorie.",
            "2. Bekijk echte video’s en salonprofielen.",
            "3. Vergelijk diensten en vanaf-prijzen.",
            "4. Verstuur direct een boekingsaanvraag als gast of met account.",
          ].map((line) => (
            <Text key={line} style={styles.stepText}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Voor salons</Text>
          {[
            "Kom direct live na registratie.",
            "Toon je studio via video in de feed.",
            "Krijg boekingsaanvragen zonder extra drempels.",
            "Beheer bevestigen, afwijzen of tijd voorstellen vanuit je dashboard.",
          ].map((line) => (
            <Text key={line} style={styles.stepText}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Early access city</Text>
          <Text style={styles.infoTitle}>Rotterdam is live als startstad</Text>
          <Text style={styles.infoText}>
            We openen de marketplace slim per stad. Rotterdam is het uitgangspunt voor launch, daarna volgen Amsterdam, Den Haag en Utrecht.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Install as app</Text>
          <Text style={styles.infoTitle}>Gebruik BookBeauty als PWA</Text>
          <Text style={styles.infoText}>
            Voeg BookBeauty toe aan je beginscherm voor sneller openen, een app-achtige ervaring en direct terugkeren naar de feed.
          </Text>
          <Pressable onPress={() => setInstallOpen(true)} style={styles.inlineBtn}>
            <Text style={styles.inlineBtnText}>Bekijk installatie-instructies</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.showcaseSection}>
        <Text style={styles.sectionTitle}>Marketplace preview</Text>
        <View style={styles.showcaseGrid}>
          {DEMO_MARKETPLACE_SALONS.slice(0, 3).map((salon) => (
            <Pressable
              key={salon.slug}
              onPress={() => router.push(`/salon/${salon.slug}` as never)}
              style={({ pressed }) => [styles.showcaseCard, pressed && styles.showcaseCardPressed]}
            >
              <Image source={{ uri: salon.coverImageUrl }} style={styles.showcaseImage} contentFit="cover" transition={220} />
              <View style={styles.showcaseBody}>
                <Text style={styles.showcaseName}>{salon.name}</Text>
                <Text style={styles.showcaseMeta}>
                  {salon.city} • {salon.categoryLabel}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      <Modal visible={installOpen} transparent animationType="fade" onRequestClose={() => setInstallOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Installeer BookBeauty als app</Text>
              <Pressable onPress={() => setInstallOpen(false)} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={COLORS.text} />
              </Pressable>
            </View>
            <Text style={styles.modalText}>iPhone / iPad: tik op Deel en kies &quot;Zet op beginscherm&quot;.</Text>
            <Text style={styles.modalText}>
              Android: open het browsermenu en kies &quot;App installeren&quot; of &quot;Toevoegen aan startscherm&quot;.
            </Text>
            <Text style={styles.modalText}>
              Desktop: gebruik de install-knop in de adresbalk wanneer je browser die toont.
            </Text>
          </View>
        </View>
      </Modal>
    </MarketplaceShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    padding: 24,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    shadowColor: "#102544",
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  heroTextWrap: {
    flex: 1,
    minWidth: 280,
    gap: 12,
  },
  heroKicker: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "800",
    maxWidth: 640,
  },
  heroSubtitle: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 620,
  },
  heroCtas: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  heroPreview: {
    flex: 1,
    minWidth: 280,
    gap: 12,
  },
  previewCard: {
    height: 138,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    gap: 4,
    backgroundColor: "rgba(12,20,31,0.36)",
  },
  previewTitle: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 15,
  },
  previewCaption: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    lineHeight: 18,
  },
  sectionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 18,
  },
  sectionCard: {
    flex: 1,
    minWidth: 280,
    padding: 22,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "800",
  },
  stepText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 18,
  },
  infoCard: {
    flex: 1,
    minWidth: 280,
    padding: 22,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    gap: 8,
  },
  infoLabel: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  infoTitle: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  infoText: {
    color: COLORS.muted,
    lineHeight: 22,
  },
  inlineBtn: {
    alignSelf: "flex-start",
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  inlineBtnText: {
    color: COLORS.primary,
    fontWeight: "800",
    fontSize: 13,
  },
  showcaseSection: {
    marginTop: 18,
    gap: 14,
  },
  showcaseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  showcaseCard: {
    flex: 1,
    minWidth: 240,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: COLORS.card,
  },
  showcaseCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  showcaseImage: {
    width: "100%",
    height: 180,
    backgroundColor: COLORS.surface,
  },
  showcaseBody: {
    padding: 16,
    gap: 4,
  },
  showcaseName: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
  },
  showcaseMeta: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12,20,31,0.44)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 24,
    backgroundColor: COLORS.card,
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 22,
    flex: 1,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalText: {
    color: COLORS.muted,
    lineHeight: 22,
    fontSize: 14,
  },
});

