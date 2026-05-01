import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: {
        default: "cassette",
        template: "%s · cassette",
    },
    description: "A self-hosted, YouTube-shaped personal video platform.",
    icons: [{ rel: "icon", url: "/favicon.svg" }],
};

export const viewport: Viewport = {
    themeColor: "#000000",
    colorScheme: "dark",
    width: "device-width",
    initialScale: 1,
};

const RootLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className="min-h-full bg-background text-foreground antialiased">{children}</body>
        </html>
    );
};

export default RootLayout;
