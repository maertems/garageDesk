import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // Ouverture de la boîte de dialogue. Le `translate(-50%, -50%)` qui la
        // centre fait partie des images-clés : une animation qui n'écrivait que
        // `scale()` remplaçait TOUTE la propriété `transform` pendant ses 150 ms,
        // centrage compris — la boîte apparaissait en bas à droite, son coin haut
        // gauche au centre de l'écran, puis sautait à sa place. Mesuré en Chrome :
        // à la première image, `matrix(0.96, 0, 0, 0.96, 0, 0)`, bord gauche à
        // 713 px pour une fenêtre de 1 400. Sur la machine du garage, plus lente,
        // le saut se voyait à chaque ouverture.
        "dialog-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.96)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
        "dialog-in": "dialog-in 0.15s ease-out",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        card: "0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
