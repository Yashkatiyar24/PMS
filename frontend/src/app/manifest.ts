import type { MetadataRoute } from "next"

/** Installed to the home screen so the desk opens it like an app, with no browser chrome in the way. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Padav",
    short_name: "Padav",
    description: "Guest register, receipts and daily accounts",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",   // --color-bg
    theme_color: "#26b9cd",        // --color-brand
    lang: "hi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
