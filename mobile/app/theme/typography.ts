import { Platform } from "react-native"

/**
 * The web app ships Inter and Noto Sans Devanagari. On a phone the system fonts render Hindi and Latin well and
 * load instantly, so no custom fonts are bundled.
 */
export const customFontsToLoad = {}

const fonts = {
  system: {
    light: Platform.select({ ios: "System", android: "sans-serif-light", default: "System" }),
    normal: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
    medium: Platform.select({ ios: "System", android: "sans-serif-medium", default: "System" }),
    semiBold: Platform.select({ ios: "System", android: "sans-serif-medium", default: "System" }),
    bold: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
  },
  monospace: {
    normal: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  /**
   * Headings and the big numbers. The platform's own serif — Georgia on iOS, Noto Serif on Android — so the
   * app reads as a printed register rather than a dashboard, with no font file to download and no first
   * paint in the wrong face.
   */
  display: {
    normal: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }),
    bold: Platform.select({ ios: "Georgia-Bold", android: "serif", default: "Georgia, serif" }),
  },
}

export const typography = {
  fonts,
  primary: fonts.system,
  secondary: fonts.system,
  display: fonts.display,
  code: fonts.monospace,
}
