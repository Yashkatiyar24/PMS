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
}

export const typography = {
  fonts,
  primary: fonts.system,
  secondary: fonts.system,
  code: fonts.monospace,
}
