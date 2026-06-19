import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // ── Brand: Manrope ──────────────────────────────────────────────────────
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
      },

      // ── Brand: Type Scale ───────────────────────────────────────────────────
      // H1 64px | H2 48px | Sub1 32px | Sub2 24px | P1 18px | P2 16px
      fontSize: {
        "h1":        ["4rem",    { lineHeight: "1",    letterSpacing: "-0.02em", fontWeight: "800" }],
        "h2":        ["3rem",    { lineHeight: "1.05", letterSpacing: "-0.015em", fontWeight: "700" }],
        "subheader1":["2rem",    { lineHeight: "1.2",  letterSpacing: "-0.01em", fontWeight: "600" }],
        "subheader2":["1.5rem",  { lineHeight: "1.3",  letterSpacing: "-0.005em", fontWeight: "600" }],
        "p1":        ["1.125rem",{ lineHeight: "1.7",  fontWeight: "400" }],
        "p2":        ["1rem",    { lineHeight: "1.6",  fontWeight: "400" }],
      },

      // ── Brand: Colors ───────────────────────────────────────────────────────
      colors: {
        // Primary
        bone:    "var(--bone)",    // #F0EDE4 — off-white / cream
        dark:    "var(--dark)",    // #161616 — near-black

        // Grayscale scale (01 → 08)
        cloud:   "var(--cloud)",   // #EDEFF7
        smoke:   "var(--smoke)",   // #D3D6E0
        steel:   "var(--steel)",   // #BCBFCC
        space:   "var(--space)",   // #9DA2B3
        graphite:"var(--graphite)",// #6E7180
        arsenic: "var(--arsenic)", // #40424D
        phantom: "var(--phantom)", // #1E1E24
        black:   "var(--black)",   // #000000

        // shadcn / Radix UI semantic tokens (kept intact)
        border:     "hsl(var(--border))",
        input:      "hsl(var(--input))",
        ring:       "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT:    "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT:              "hsl(var(--sidebar-background))",
          foreground:           "hsl(var(--sidebar-foreground))",
          primary:              "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent:               "hsl(var(--sidebar-accent))",
          "accent-foreground":  "hsl(var(--sidebar-accent-foreground))",
          border:               "hsl(var(--sidebar-border))",
          ring:                 "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "var(--radius)",
        sm: "var(--radius)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
