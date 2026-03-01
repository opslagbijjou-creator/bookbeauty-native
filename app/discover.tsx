import React from "react";
import MarketplaceListingScreen from "../components/MarketplaceListingScreen";
import MarketplaceSeo from "../components/MarketplaceSeo";
import MarketplaceShell from "../components/MarketplaceShell";
import { buildDiscoverSeo } from "../lib/marketplace";

export default function DiscoverScreen() {
  const seo = buildDiscoverSeo();

  return (
    <MarketplaceShell active="discover" scroll={false}>
      <MarketplaceSeo title={seo.title} description={seo.description} pathname={seo.pathname} />
      <MarketplaceListingScreen
        mode="discover"
        citySlug="all"
        title="Ontdek salons in heel Nederland"
        subtitle="Zoek per stad of categorie, vergelijk direct en verlies je plek niet terwijl je verder filtert."
      />
    </MarketplaceShell>
  );
}
