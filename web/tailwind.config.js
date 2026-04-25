/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary warm palette
        warm: {
          50:  "#FFF8ED",
          100: "#FFF0D6",
          200: "#FDDBA8",
          300: "#FCC071",
          400: "#FBA037",  // marigold
          500: "#F97316",  // sunrise orange  — main action colour
          600: "#EA580C",  // deeper orange
          700: "#C2410C",
          800: "#9A3412",
          900: "#7C2D12",
        },
        // Accent gold / amber
        gold: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",  // amber
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
