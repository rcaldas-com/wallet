import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#3b82f6",
          dark: "#1d4ed8",
        },
        secondary: {
          DEFAULT: "#10b981",
          dark: "#059669",
        },
      },
    },
  },
  plugins: [],
};

export default config;
