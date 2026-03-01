import React from "react";
import Head from "expo-router/head";
import { buildCanonicalUrl } from "../lib/marketplace";

type MarketplaceSeoProps = {
  title: string;
  description: string;
  pathname: string;
  image?: string;
  structuredData?: string;
};

export default function MarketplaceSeo({
  title,
  description,
  pathname,
  image,
  structuredData,
}: MarketplaceSeoProps) {
  const canonical = buildCanonicalUrl(pathname);
  const ogImage = image || "https://bookbeauty.nl/icon-512.png";
  const verification = String(process.env.EXPO_PUBLIC_GOOGLE_SITE_VERIFICATION || "").trim();

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index,follow,max-image-preview:large" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="BookBeauty" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <link rel="canonical" href={canonical} />
      {verification ? <meta name="google-site-verification" content={verification} /> : null}
      {structuredData ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      ) : null}
    </Head>
  );
}
