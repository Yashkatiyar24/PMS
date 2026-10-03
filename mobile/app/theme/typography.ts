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
   * Headings and the big numbers. Regular system sans so large figures carry weight, as in the reference
   * design, with no font file to download and no first paint in the wrong face.
   */
  display: {
    normal: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
    bold: Platform.select({ ios: "System", android: "sans-serif-medium", default: "System" }),
  },
}

export const typography = {
  fonts,
  primary: fonts.system,
  secondary: fonts.system,
  display: fonts.display,
  code: fonts.monospace,
}
