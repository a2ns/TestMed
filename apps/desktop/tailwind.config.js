/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Nuit + lavande — identité MagicMed
        nuit: {
          50: "#f5f5fa",
          100: "#ecebf6",
          200: "#d9d7ee",
          300: "#b8b3d9",
          400: "#8d84c2",
          500: "#6f63ad",
          600: "#5a4d94",
          700: "#4a3f7c",
          800: "#332b57",
          900: "#211c3c",
          950: "#16132a",
        },
        lavande: {
          50: "#f6f4ff",
          100: "#ede9ff",
          200: "#ddd5ff",
          300: "#c5b3ff",
          400: "#a889ff",
          500: "#8f66f5",
          600: "#7c4de3",
          700: "#6a3ccb",
          800: "#5933a9",
          900: "#4a2d88",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        soft: "0 2px 12px -2px rgb(22 19 42 / 0.08)",
        card: "0 1px 3px rgb(22 19 42 / 0.06)",
      },
    },
  },
  plugins: [],
};
