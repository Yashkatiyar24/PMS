import type { Metadata, Viewport } from "next"
import { Inter, Noto_Sans_Devanagari } from "next/font/google"
import "./globals.css"
import { I18nProvider } from "@/i18n"
import { SessionProvider } from "@/lib/session"
import { AppShell } from "@/components/AppShell"
import { ServiceWorker } from "@/components/ServiceWorker"

export const metadata: Metadata = {
  title: "Padav",
  description: "Guest register, receipts and daily accounts for small hotels, guest houses and dharamshalas",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Padav", statusBarStyle: "default" },
}

/** Designed at 360px first; the viewport must not zoom away the tap targets. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The browser chrome follows the page: white screens by day, the deep teal-navy ground in dark mode.
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0f1a20" }],
}

/**
 * Both faces are self-hosted at build time, so the phone never asks Google for them and the text never
 * reflows when they arrive. Inter carries Latin; Noto Sans Devanagari carries Hindi.
 */
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" })
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari", "latin"], display: "swap", variable: "--font-devanagari" })

/** Applies the theme before the first paint: light, unless someone chose dark or "follow the device" in the menu. */
const THEME_BOOT = `try{var t=localStorage.getItem("pms.theme");if(t!=="dark"&&t!=="system")t="light";if(t!=="system")document.documentElement.dataset.theme=t;var s=localStorage.getItem("pms.textSize");if(s==="large")document.documentElement.dataset.text=s}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi" data-text="normal" className={`${inter.variable} ${devanagari.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <I18nProvider>
          <SessionProvider>
            <AppShell>{children}</AppShell>
            <ServiceWorker />
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
