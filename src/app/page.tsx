import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "@/lib/auth";
import { CassetteWordmark } from "@/components/branding/CassetteWordmark";

// Server component — checks session and redirects authenticated users to /home.
// Unauthenticated visitors see the logged-out hero with sign-in / register CTAs.
const HomePage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });

    if (session?.user) {
        redirect("/home");
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
            <div className="space-y-6">
                <div className="flex justify-center">
                    <CassetteWordmark className="scale-150 text-foreground" />
                </div>
                <div className="space-y-3">
                    <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-6xl">
                        Your videos. Your hardware. Your rules.
                    </h1>
                    <p className="mx-auto max-w-xl text-balance text-base text-muted-foreground">
                        A self-hosted personal video platform. Upload via a simple HTTP API, watch back as adaptive HLS,
                        and keep your library on disc where you can see it.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                    href="/login"
                    className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    Sign in
                </Link>
                <Link
                    href="/register"
                    className="rounded-full border border-border bg-secondary/40 px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    Create an account
                </Link>
            </div>

            <footer className="absolute bottom-6 text-xs text-muted-foreground">
                Built with Next.js, Drizzle, Better-Auth, and Vidstack.
            </footer>
        </main>
    );
};

export default HomePage;
