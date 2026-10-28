import type { Metadata, Viewport } from "next";
import { appName } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: appName,
  description: `${appName} app`,
  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: "default",
  },
};

// viewportFit "cover" lets the layout use the safe-area insets around the notch and home bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
