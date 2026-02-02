const globals = require("globals");
const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha,
      },
    },
  },
  {
    files: ["utils/pollingClient.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];
