/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary warm palette — sunrise orange family
        warm: {
          50:  "#FFF8ED",
          100: "#FFF0D6",
          200: "#FDDBA8",
          300: "#FCC071",
          400: "#FBA037",  // marigold
          500: "#F97316",  // sunrise orange — main action colour
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
          800: "#92400E",  // rich amber  — deep border / active state
          900: "#78350F",
        },
        // Soft tangerine — bright, slightly pinkish orange for hover halos
        // and gradient transitions.
        tangerine: {
          50:  "#FFF4E6",
          100: "#FFE5C4",
          200: "#FFD0A0",
          300: "#FFB97A",
          400: "#FF9F4D",
          500: "#FF8A1E",
          600: "#F26F00",
        },
        // Peach — pastel warm wash for hover backgrounds and card tints.
        peach: {
          50:  "#FFF6F0",
          100: "#FFE7D6",
          200: "#FFD3B6",
          300: "#FCBA92",
          400: "#F7A06D",
          500: "#EE8550",
        },
        // Burnt orange — deep, saturated tones for borders, focused
        // outlines, and active toggles.
        burnt: {
          400: "#D2552B",
          500: "#B8431D",
          600: "#9C3613",
          700: "#7A2A0E",
          800: "#5C1F09",
        },
      },
      boxShadow: {
        // Warm-tinted elevation for active cards / dropdowns.
        warmGlow: "0 6px 20px -6px rgba(234, 88, 12, 0.35)",
        peachGlow: "0 4px 14px -4px rgba(247, 160, 109, 0.55)",
      },
      backgroundImage: {
        "gradient-warm":
          "linear-gradient(135deg, #FFF8ED 0%, #FFE7D6 40%, #FCC071 100%)",
        "gradient-sunset":
          "linear-gradient(135deg, #FBBF24 0%, #F97316 50%, #C2410C 100%)",
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
