import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "OnTheBus",
    template: "%s · OnTheBus",
  },
  description:
    "Live bus tracking, student attendance, and parent alerts—giving schools and families peace of mind every school day.",
  applicationName: "OnTheBus",
  manifest: "/site.webmanifest",
  // Icons come from App Router files: app/favicon.ico, app/icon.png, app/apple-icon.png
};

export const viewport: Viewport = {
  themeColor: "#006B32",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
