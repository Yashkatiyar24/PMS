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
  themeColor: "#0b5c4a",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hi" data-text="normal">
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
