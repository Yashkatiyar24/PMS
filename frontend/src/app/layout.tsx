import type { Metadata, Viewport } from "next"
import "./globals.css"
import { I18nProvider } from "@/i18n"
import { SessionProvider } from "@/lib/session"
import { AppShell } from "@/components/AppShell"
import { ServiceWorker } from "@/components/ServiceWorker"

export const metadata: Metadata = {
  title: "Dharamshala PMS",
  description: "Guest register, receipts and daily accounts for dharamshalas and small hotels",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "PMS", statusBarStyle: "default" },
}

/** Designed at 360px first; the viewport must not zoom away the tap targets. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1117" },
  ],
}

/** Applies the remembered theme before the first paint, so a dark-mode phone never flashes white. */
const THEME_BOOT = `try{var t=localStorage.getItem("pms.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;var s=localStorage.getItem("pms.textSize");if(s==="large")document.documentElement.dataset.text=s}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi" data-text="normal" suppressHydrationWarning>
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
