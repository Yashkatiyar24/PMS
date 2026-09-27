// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  root: true,
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-native/all",
    // `expo` must come after `standard` or its globals configuration will be overridden
    "expo",
    // `jsx-runtime` must come after `expo` or it will be overridden
    "plugin:react/jsx-runtime",
    "prettier",
  ],
  plugins: ["reactotron", "prettier"],
  overrides: [
    {
      files: ["app/utils/**/*.ts", "app/services/api/**/*.ts", "app/devtools/**", "test/**", "**/*.test.ts", "**/*.test.tsx"],
      rules: { "no-restricted-imports": "off", "no-console": "off", "max-lines": "off" },
    },
  ],
  rules: {
    "prettier/prettier": "error",
    // typescript-eslint
    "@typescript-eslint/array-type": 0,
    "@typescript-eslint/ban-ts-comment": 0,
    "@typescript-eslint/no-explicit-any": 0,
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-var-requires": 0,
    "@typescript-eslint/no-require-imports": 0,
    "@typescript-eslint/no-empty-object-type": 0,
    // eslint
    "no-use-before-define": 0,
    "no-restricted-imports": [
      "error",
      {
        paths: [
          // Prefer named exports from 'react' instead of importing `React`
          {
            name: "react",
            importNames: ["default"],
            message: "Import named exports from 'react' instead.",
          },
          {
            name: "react-native",
            importNames: ["SafeAreaView"],
            message: "Use the SafeAreaView from 'react-native-safe-area-context' instead.",
          },
          {
            name: "react-native",
            importNames: ["Text", "Button", "TextInput"],
            message: "Use the custom wrapper component from '@/components'.",
          },
          // Engineering rule 1: third-party libraries for dates, storage, validation, logging, images,
          // network and files are used only inside app/utils. Screens import the utils.
          { name: "date-fns", message: "Use @/utils/date." },
          { name: "react-native-mmkv", message: "Use @/utils/storage." },
          { name: "zod", message: "Use @/utils/validation." },
          { name: "@hookform/resolvers/zod", message: "Use resolverFor from @/utils/validation." },
          { name: "expo-image-picker", message: "Use @/utils/image." },
          { name: "expo-image-manipulator", message: "Use @/utils/image." },
          { name: "expo-network", message: "Use @/utils/network." },
          { name: "expo-file-system", message: "Use @/utils/files." },
          { name: "expo-sharing", message: "Use @/utils/files." },
          { name: "@react-native-firebase/messaging", message: "Use @/utils/notifications." },
          { name: "apisauce", message: "Use the ApiService in @/services/api." },
        ],
      },
    ],
    "no-console": "error",
    "max-lines": ["warn", { max: 260, skipBlankLines: true, skipComments: true }],
    // react
    "react/prop-types": 0,
    // react-native
    "react-native/no-raw-text": 0,
    // Small literal styles next to theme-driven ones read better inline than as a dozen named constants.
    "react-native/no-inline-styles": 0,
    // reactotron
    "reactotron/no-tron-in-production": "error",
    // eslint-config-standard overrides
    "comma-dangle": 0,
    "no-global-assign": 0,
    "quotes": 0,
    "space-before-function-paren": 0,
    // eslint-import
    "import/order": [
      "error",
      {
        "alphabetize": {
          order: "asc",
          caseInsensitive: true,
        },
        "newlines-between": "always",
        "groups": [["builtin", "external"], "internal", "unknown", ["parent", "sibling"], "index"],
        "distinctGroup": false,
        "pathGroups": [
          {
            pattern: "react",
            group: "external",
            position: "before",
          },
          {
            pattern: "react-native",
            group: "external",
            position: "before",
          },
          {
            pattern: "expo{,-*}",
            group: "external",
            position: "before",
          },
          {
            pattern: "@/**",
            group: "unknown",
            position: "after",
          },
        ],
        "pathGroupsExcludedImportTypes": ["react", "react-native", "expo", "expo-*"],
      },
    ],
    "import/newline-after-import": 1,
  },
}
