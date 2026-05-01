import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
    darkMode: "class",
    content: ["./src/**/*.{ts,tsx}"],
    theme: {
        container: {
            center: true,
            padding: "1rem",
            screens: {
                "2xl": "1440px",
            },
        },
        // Ultra-wide breakpoints. Tailwind's defaults stop at `2xl` (1536px);
        // on a 21:9 / 32:9 monitor that leaves a vast unused gutter. Pull
        // the column ladder out to 8-up at 5xl.
        screens: {
            sm: "640px",
            md: "768px",
            lg: "1024px",
            xl: "1280px",
            "2xl": "1536px",
            "3xl": "1920px",
            "4xl": "2560px",
            "5xl": "3440px",
        },
        extend: {
            fontFamily: {
                // system-ui resolves to SF on Apple, Segoe on Windows, Roboto on Android.
                // Per project brief: no Google Fonts, no custom font binaries.
                sans: [
                    "system-ui",
                    "-apple-system",
                    '"Segoe UI"',
                    "Roboto",
                    '"Helvetica Neue"',
                    "Arial",
                    "sans-serif",
                ],
                mono: [
                    "ui-monospace",
                    "SFMono-Regular",
                    "Menlo",
                    "Monaco",
                    "Consolas",
                    '"Liberation Mono"',
                    '"Courier New"',
                    "monospace",
                ],
            },
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
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            backdropBlur: {
                glass: "20px",
            },
            keyframes: {
                "fade-in": {
                    from: { opacity: "0", transform: "translateY(4px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "fade-out": {
                    from: { opacity: "1", transform: "translateY(0)" },
                    to: { opacity: "0", transform: "translateY(4px)" },
                },
            },
            animation: {
                "fade-in": "fade-in 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                "fade-out": "fade-out 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
            },
        },
    },
    plugins: [animate],
};

export default config;
