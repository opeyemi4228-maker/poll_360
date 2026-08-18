import coreWebVitals from "eslint-config-next/core-web-vitals";

/* eslint-config-next 16 ships a real flat config, so it is imported directly.
   Wrapping it in FlatCompat — which the older Next scaffolds did — throws a
   circular-structure error on load, because the plugin object it exports now
   references itself. */
const config = [
  ...coreWebVitals,
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
];

export default config;
