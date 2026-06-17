import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Prestige PMS — Luxury Property Management System",
  description: "World-class property management for luxury Airbnb and serviced apartment businesses",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
