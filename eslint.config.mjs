import { fileURLToPath } from "node:url";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

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
];

export default eslintConfig;
