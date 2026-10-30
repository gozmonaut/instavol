import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { appName } from "@/lib/config";
import "./globals.css";

// The "Leesbaar" option in the reader; not preloaded, so it only downloads when chosen
const legible = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-legible",
  preload: false,
});

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
    <html lang="nl" className={legible.variable}>
      <body>{children}</body>
    </html>
  );
}
