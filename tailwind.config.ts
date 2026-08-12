import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "#F8FAFC",
        surface: "#FFFFFF",
        ink: "#111827",
        muted: "#8A94A6",
        line: "#E1E6EF",
        handle: "#C8CDD4",
        map: {
          DEFAULT: "#F4F7F8",
          land: "#F4F7F8",
          water: "#DCE9F6",
          road: "#FFFFFF",
          building: "#EEF3F7",
          route: "#0F8A7A",
        },
        marker: {
          campus: "#FF5A4F",
          current: "#2F80ED",
        },
        primary: {
          DEFAULT: "#0F8A7A",
          dark: "#087468",
          soft: "#E8F8F4",
          pale: "#D9F2EC",
        },
      },
      borderRadius: {
        card: "12px",
        button: "10px",
        input: "12px",
        sheet: "20px",
      },
      boxShadow: {
        card: "0 2px 10px rgba(17, 24, 39, 0.06)",
        floating: "0 4px 14px rgba(17, 24, 39, 0.12)",
        sheet: "0 -8px 24px rgba(17, 24, 39, 0.12)",
        button: "0 6px 14px rgba(15, 138, 122, 0.18)",
        marker: "0 4px 12px rgba(17, 24, 39, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
