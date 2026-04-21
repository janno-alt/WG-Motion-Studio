/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./remotion/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface tiers — dark base to elevated panels
        surface: {
          0: "#0A0A0A",
          1: "#141414",
          2: "#1A1A1A",
          3: "#202020",
        },
        // Borders / dividers
        border: {
          subtle: "#2A2A2A",
          DEFAULT: "#3A3A3A",
        },
        // Accent — neon-lime signature
        accent: {
          primary: "#C8FF00",
          "primary-hover": "#B8E800",
        },
        // Text
        text: {
          primary: "#F0F0F0",
          secondary: "#A0A0A0",
          muted: "#707070",
        },
        // Status badges (used across project + plan-item statuses)
        status: {
          draft: "#707070",
          review: "#4EA6F5",
          generating: "#F5A623",
          rendered: "#C8FF00",
          exported: "#3FC27D",
          error: "#EF4444",
        },
        // Semantic
        success: "#3FC27D",
        warn: "#F5A623",
        danger: "#EF4444",
        info: "#4EA6F5",
        // Tier pills
        tier: {
          1: "#3FC27D",
          2: "#F5A623",
          3: "#C8FF00",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        default: "6px",
        card: "8px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.45)",
        popover: "0 8px 32px rgba(0,0,0,0.6)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        250: "250ms",
      },
    },
  },
  plugins: [],
};
