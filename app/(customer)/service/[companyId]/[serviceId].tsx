import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchCompanyById } from "../../../../lib/companyRepo";
import { fetchCompanyServiceById } from "../../../../lib/serviceRepo";
import { COLORS } from "../../../../lib/ui";

export default function ServiceDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ companyId: string; serviceId: string }>();
  const companyId = typeof params.companyId === "string" ? params.companyId : "";
  const serviceId = typeof params.serviceId === "string" ? params.serviceId : "";

  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [service, setService] = useState<Awaited<ReturnType<typeof fetchCompanyServiceById>>>(null);
  const [selectedPhoto, setSelectedPhoto] = useState("");

  const photoUrls = useMemo(() => service?.photoUrls ?? [], [service]);
  const heroPhoto = selectedPhoto || photoUrls[0] || "";

  useEffect(() => {
    if (!companyId || !serviceId) return;
    let mounted = true;
    setLoading(true);

    Promise.all([fetchCompanyById(companyId), fetchCompanyServiceById(companyId, serviceId)])
      .then(([company, serviceData]) => {
        if (!mounted) return;
        setCompanyName(company?.name ?? "Salon");
        setService(serviceData);
        setSelectedPhoto(serviceData?.photoUrls?.[0] ?? "");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [companyId, serviceId]);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back-outline" size={16} color={COLORS.primary} />
        <Text style={styles.backText}>Terug</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : !service ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Dienst niet gevonden.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {heroPhoto ? (
              <Image source={{ uri: heroPhoto }} style={styles.heroImage} contentFit="cover" />
            ) : (
              <View style={styles.heroFallback}>
                <Ionicons name="image-outline" size={36} color={COLORS.primary} />
                <Text style={styles.heroFallbackText}>Nog geen foto&apos;s toegevoegd</Text>
              </View>
            )}
          </View>

          {photoUrls.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
              {photoUrls.map((url) => {
                const active = heroPhoto === url;
                return (
                  <Pressable
                    key={url}
                    onPress={() => setSelectedPhoto(url)}
                    style={[styles.thumbWrap, active && styles.thumbWrapActive]}
                  >
                    <Image source={{ uri: url }} style={styles.thumb} contentFit="cover" />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.serviceName}>{service.name}</Text>

            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <Ionicons name="pricetag-outline" size={13} color={COLORS.primary} />
                <Text style={styles.metaText}>{service.category}</Text>
              </View>
              <View style={styles.metaPill}>
                <Ionicons name="time-outline" size={13} color={COLORS.primary} />
                <Text style={styles.metaText}>{service.durationMin} min</Text>
              </View>
              <View style={styles.metaPill}>
                <Ionicons name="cash-outline" size={13} color={COLORS.primary} />
                <Text style={styles.metaText}>EUR {service.price}</Text>
              </View>
            </View>

            <Text style={styles.description}>{service.description || "Geen extra beschrijving beschikbaar."}</Text>

            <Pressable
              style={styles.bookBtn}
              onPress={() => router.push(`/(customer)/book/${companyId}/${service.id}` as never)}
            >
              <Ionicons name="calendar-outline" size={15} color="#fff" />
              <Text style={styles.bookText}>Boek nu</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 10,
  },
  backText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  content: {
    gap: 10,
    paddingBottom: 28,
  },
  hero: {
    height: 250,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#f5f0f3",
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  heroFallbackText: {
    color: COLORS.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  thumbRow: {
    gap: 8,
    paddingVertical: 2,
  },
  thumbWrap: {
    width: 82,
    height: 82,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  thumbWrapActive: {
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  companyName: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  serviceName: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "700",
  },
  description: {
    color: COLORS.muted,
    lineHeight: 20,
    fontWeight: "600",
  },
  bookBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  bookText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
});
