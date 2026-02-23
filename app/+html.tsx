import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
  const iconVersion = "20260223";
  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        <meta name="theme-color" content="#df4f9a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="BookBeauty" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        <link rel="manifest" href={`/manifest.webmanifest?v=${iconVersion}`} />
        <link rel="apple-touch-icon" sizes="180x180" href={`/apple-touch-icon.png?v=${iconVersion}`} />
        <link rel="icon" type="image/png" sizes="192x192" href={`/icon-192.png?v=${iconVersion}`} />
        <link rel="icon" type="image/png" sizes="512x512" href={`/icon-512.png?v=${iconVersion}`} />
        <link rel="icon" type="image/png" href={`/favicon.png?v=${iconVersion}`} />

        <style
          dangerouslySetInnerHTML={{
            __html: `
              html {
                -webkit-text-size-adjust: 100%;
              }

              input,
              textarea,
              select {
                font-size: 16px;
              }

              @supports (-webkit-touch-callout: none) {
                input,
                textarea,
                select {
                  font-size: 16px !important;
                }
              }
            `,
          }}
        />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
