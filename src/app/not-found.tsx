import Link from "next/link";

import { CassetteWordmark } from "@/components/branding/CassetteWordmark";

export const metadata = {
    title: "Not found",
};

const NotFoundPage = () => {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8 text-center">
            <CassetteWordmark className="text-foreground" />
            <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">404</p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                    We could not find that.
                </h1>
                <p className="mx-auto max-w-md text-balance text-sm text-muted-foreground">
                    The page or video you were looking for does not exist, has been removed, or is not visible to you.
                    Try heading back to the home page.
                </p>
            </div>
            <Link
                href="/"
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
                Back to home
            </Link>
        </main>
    );
};

export default NotFoundPage;
