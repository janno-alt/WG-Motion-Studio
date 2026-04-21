/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./remotion/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface tiers — from dark base to elevated panels
        surface: {
          0: "#0B0C0F",
          1: "#111318",
          2: "#171A21",
          3: "#1E222B",
          4: "#272C37",
        },
        // Text / content
        content: {
          primary: "#ECEEF3",
          secondary: "#9CA3AF",
          tertiary: "#6B7280",
          inverse: "#0B0C0F",
        },
        // Accent — used sparingly for primary actions and selection
        accent: {
          DEFAULT: "#7C5CFF",
          soft: "#A596FF",
          muted: "#5A46B8",
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
          3: "#7C5CFF",
        },
        // Borders & dividers
        border: {
          subtle: "#1F232C",
          DEFAULT: "#2A2F3B",
          strong: "#3A4150",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Helvetica Neue",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        xs: "2px",
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)",
        popover: "0 8px 32px rgba(0,0,0,0.5)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
