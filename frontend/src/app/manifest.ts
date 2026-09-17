import type { MetadataRoute } from "next"

/** Installed to the home screen so the desk opens it like an app, with no browser chrome in the way. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dharamshala PMS",
    short_name: "PMS",
    description: "Guest register, receipts and daily accounts",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#0b5c4a",
    lang: "hi",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
