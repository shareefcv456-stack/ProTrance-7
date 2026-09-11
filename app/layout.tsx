import type { Metadata } from "next";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MotionProvider } from "@/components/motion/MotionProvider";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
  // Not preloaded. next/font puts a high-priority <link rel="preload"> in the
  // head for every family, and this one only ever sets the small uppercase
  // eyebrows and data chips — 22k of the critical path competing with the
  // hero's own download for a handful of 11px labels. Discovered from CSS
  // instead, and `swap` already covers the gap.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.protransllp.com"),
  title: {
    default: "PRO TRANS Logistics — Speed. Safety. Reliability.",
    template: "%s · PRO TRANS Logistics",
  },
  description:
    "PRO TRANS LOGISTICS LLP — technology-driven FMCG transportation across South India with Pan-India connectivity. Cold chain, fragile handling, and 24/7 live fleet tracking.",
  keywords: [
    "FMCG logistics",
    "cold chain transport",
    "fleet management",
    "South India logistics",
    "Ashok Leyland fleet",
    "Thermo King",
    "Malappuram logistics",
  ],
  openGraph: {
    title: "PRO TRANS Logistics — Speed. Safety. Reliability.",
    description:
      "Technology-driven FMCG transportation across South India with Pan-India connectivity.",
    type: "website",
    url: "https://www.protransllp.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <MotionProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </MotionProvider>
      </body>
    </html>
  );
}
