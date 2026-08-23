import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AudioStatusBar } from "@/components/Common/AudioStatusBar";
import { NetworkSupportBanner } from "@/components/Common/NetworkSupportBanner";
import { AppSettingsProvider } from "@/contexts/AppSettingsContext";
import { AudioGuideProvider } from "@/contexts/AudioGuideContext";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "AI Campus Docent",
  description: "Location-based AI campus guide for first-time visitors.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        <AppSettingsProvider>
          <AudioGuideProvider>
            {children}
            <AudioStatusBar />
            <NetworkSupportBanner />
          </AudioGuideProvider>
        </AppSettingsProvider>
      </body>
    </html>
  );
}
