import React from "react";
import { useLocalSearchParams } from "expo-router";
import MarketplaceListingScreen from "../../../components/MarketplaceListingScreen";
import MarketplaceSeo from "../../../components/MarketplaceSeo";
import MarketplaceShell from "../../../components/MarketplaceShell";
import {
  MARKETPLACE_CITIES,
  buildListingSeo,
  buildListingStructuredData,
  getCityBySlug,
} from "../../../lib/marketplace";

export function generateStaticParams() {
  return MARKETPLACE_CITIES.map((city) => ({ city: city.slug }));
}

export default function CityListingScreen() {
  const params = useLocalSearchParams<{ city?: string }>();
  const citySlug = typeof params.city === "string" ? params.city : "";
  const city = getCityBySlug(citySlug);
  const seo = buildListingSeo({ citySlug });

  return (
    <MarketplaceShell active="discover" scroll={false}>
      <MarketplaceSeo
        title={seo.title}
        description={seo.description}
        pathname={seo.pathname}
        structuredData={buildListingStructuredData({ citySlug })}
      />
      <MarketplaceListingScreen
        mode="listing"
        citySlug={citySlug}
        title={`Beauty salons in ${city?.label || "jouw stad"} – online afspraak maken`}
        subtitle={`Top salons in ${city?.label || "jouw stad"}: snel vergelijken en direct reserveren.`}
      />
    </MarketplaceShell>
  );
}
