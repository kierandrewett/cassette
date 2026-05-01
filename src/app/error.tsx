"use client";

import { useEffect } from "react";
import Link from "next/link";

import { CassetteWordmark } from "@/components/branding/CassetteWordmark";

// Next.js renders this at any segment that throws on the server. The reset()
// callback re-renders the segment without a full reload.
const ErrorPage = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => {
    useEffect(() => {
        // Surface the error in the dev server logs and any future Sentry sink.
        // We deliberately log the digest so it can be cross-referenced with
        // server-side logs without leaking the stack trace to the user.
        console.error("[error.tsx]", error);
    }, [error]);

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8 text-center">
            <CassetteWordmark className="text-foreground" />
            <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Something went wrong</p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                    The cassette tape jammed.
                </h1>
                <p className="mx-auto max-w-md text-balance text-sm text-muted-foreground">
                    We hit an unexpected error rendering this page. Try again, or head home and come back later.
                </p>
                {error.digest ? (
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/70">
                        Reference: {error.digest}
                    </p>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={() => reset()}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                >
                    Try again
                </button>
                <Link
                    href="/"
                    className="rounded-full border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/70"
                >
                    Back to home
                </Link>
            </div>
        </main>
    );
};

export default ErrorPage;
