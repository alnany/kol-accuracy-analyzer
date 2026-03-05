import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0f",
        accent: "#7c3aed",
        hit: "#22c55e",
        miss: "#ef4444",
        pending: "#94a3b8",
      },
    },
  },
  plugins: [],
};

export default config;
