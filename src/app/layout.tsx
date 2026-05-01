import type { Metadata, Viewport } from "next";
import "./globals.css";

import { TRPCProvider } from "@/lib/trpc/client";
import { Providers } from "./providers";

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
            <body className="min-h-full bg-background text-foreground antialiased">
                {/* Providers is the outermost client boundary; TRPCProvider sits inside it. */}
                <Providers>
                    <TRPCProvider>{children}</TRPCProvider>
                </Providers>
            </body>
        </html>
    );
};

export default RootLayout;
