import React from "react";
import MarketplaceListingScreen from "../components/MarketplaceListingScreen";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { DEFAULT_MARKETPLACE_CITY, buildDiscoverSeo } from "../lib/marketplace";

export default function DiscoverScreen() {
  const seo = buildDiscoverSeo();

  return (
    <MarketplaceShell active="discover">
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />
      <MarketplaceListingScreen
        mode="discover"
        citySlug={DEFAULT_MARKETPLACE_CITY.slug}
        title="Ontdek salons per stad en categorie"
        subtitle="Zoek lokaal, filter slim en bekijk direct welke salons passen bij je prijs, stijl en beschikbaarheid."
      />
    </MarketplaceShell>
  );
}

