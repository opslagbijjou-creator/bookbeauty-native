import React from "react";
import { useLocalSearchParams } from "expo-router";
import MarketplaceListingScreen from "../../../components/MarketplaceListingScreen";
import MarketplaceSeo from "../../../components/MarketplaceSeo";
import MarketplaceShell from "../../../components/MarketplaceShell";
import {
  buildListingSeo,
  getCategoryBySlug,
  getCityBySlug,
  getStaticCityCategoryPaths,
} from "../../../lib/marketplace";

export function generateStaticParams() {
  return getStaticCityCategoryPaths();
}

export default function CityCategoryListingScreen() {
  const params = useLocalSearchParams<{ city?: string; category?: string }>();
  const citySlug = typeof params.city === "string" ? params.city : "";
  const categorySlug = typeof params.category === "string" ? params.category : "";
  const city = getCityBySlug(citySlug);
  const category = getCategoryBySlug(categorySlug);
  const seo = buildListingSeo({ citySlug, categorySlug });

  return (
    <MarketplaceShell active="discover" scroll={false}>
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />
      <MarketplaceListingScreen
        mode="listing"
        citySlug={citySlug}
        categorySlug={categorySlug}
        title={`${category?.label || "Beauty"} in ${city?.label || "jouw stad"}`}
        subtitle="Gebruik filters voor prijs, rating, open nu en specialisaties. Gefilterde query’s houden dezelfde canonieke pagina."
      />
    </MarketplaceShell>
  );
}
