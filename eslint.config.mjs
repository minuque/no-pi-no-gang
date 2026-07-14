import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("./apps/web", import.meta.url));

const eslintConfig = [
  { ignores: [".claude/**"] },
  { settings: { next: { rootDir: webRoot } } },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  eslintConfigPrettier,
];

export default eslintConfig;
