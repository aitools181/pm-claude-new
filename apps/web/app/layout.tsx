import "./globals.css";
import type { ReactNode } from "react";
import PwaRegister from "../components/pwa/PwaRegister";
import { ThemeProvider } from "../components/theme/ThemeProvider";

// UI chrome is English-only. User-generated content is full-Unicode.
export const metadata = { title: "PM Platform", description: "Self-contained project management", manifest: "/manifest.webmanifest" };
export const viewport = { themeColor: "#6D5BD0" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><ThemeProvider>{children}<PwaRegister /></ThemeProvider></body>
    </html>
  );
}
