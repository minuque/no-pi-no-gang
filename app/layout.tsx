import type { Metadata, Viewport } from "next";

import "@fontsource/jetbrains-mono/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";

import Agentator from "@/components/Agentator";
import { I18nProvider } from "@/components/I18nProvider";

import "./globals.css";

const APP_NAME = "No Pi No Gang";
const APP_DESCRIPTION =
  "No Pi No Gang — interactive chat, code analysis, and automated development tasks.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  colorScheme: "dark light",
};

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: "/manifest.json",
  keywords: ["pi coding agent", "AI coding", "coding assistant", "code analysis"],
  authors: [{ name: "no-pi-no-gang" }],
  creator: "no-pi-no-gang",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    url: process.env.NEXT_PUBLIC_APP_URL || "https://no-pi-no-gang.vercel.app",
    siteName: APP_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="light"){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark")}else{document.documentElement.classList.add("dark");document.documentElement.classList.remove("light")}}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
        <I18nProvider>
          <main
            id="main"
            style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            {children}
          </main>
          <Agentator />
        </I18nProvider>
      </body>
    </html>
  );
}
