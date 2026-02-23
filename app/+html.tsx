import { ScrollViewStyleReset } from "expo-router/html";

export default function Root({ children }: { children: React.ReactNode }) {
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

        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
        <link rel="icon" type="image/png" href="/favicon.png" />

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
