import "./design-tokens.css";
import "./globals.css";
import "./ui-static.css";
import "./ui-standards.css";
import type { ReactNode } from "react";
import PwaRegister from "../components/pwa/PwaRegister";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import { VIEWPORT_THEME_COLOR } from "../components/theme/themeTokens";

// UI chrome is English-only. User-generated content is full-Unicode.
export const metadata = { title: "PM Platform", description: "Self-contained project management", manifest: "/manifest.webmanifest" };
export const viewport = { themeColor: VIEWPORT_THEME_COLOR };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ThemeProvider>{children}<PwaRegister /></ThemeProvider></body>
    </html>
  );
}
