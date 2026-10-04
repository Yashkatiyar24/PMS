const preset = require("jest-expo/jest-preset")

/** @type {import('@jest/types').Config.ProjectConfig} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/test/setup.ts"],
  // mobx ships ESM; add it to the packages jest-expo already transforms.
  transformIgnorePatterns: preset.transformIgnorePatterns.map((p) =>
    p.replace("native-base", "native-base|mobx|mobx-state-tree|mobx-react-lite"),
  ),
  testPathIgnorePatterns: ["/node_modules/", "/ios/", "/android/"],
}
