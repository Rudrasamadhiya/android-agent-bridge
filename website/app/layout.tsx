import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import SmoothScroll from "@/components/SmoothScroll";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://rudrasamadhiya.github.io/android-agent-bridge/"),
  title: { default: "Agent Bridge — give your AI agent a real phone", template: "%s · Agent Bridge" },
  description: "Let Claude Code, Cursor, Antigravity or any MCP agent use your Android phone: read the screen, tap, type, open apps, change settings and move files. Pair by QR over Wi-Fi or USB. Open source, Android 5.0+.",
  openGraph: { title: "Agent Bridge", description: "Give your AI agent a real Android phone. One npx command, one QR scan.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#07080a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${geist.variable} ${mono.variable}`}>
      <body>
        <SmoothScroll>
          <a className="skip" href="#main">Skip to content</a>
          <Nav />
          <main id="main">{children}</main>
          <Footer />
        </SmoothScroll>
      </body>
    </html>
  );
}
