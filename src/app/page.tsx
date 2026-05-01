import Link from "next/link";

const HomePage = () => {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-8 text-center">
            <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">cassette</p>
                <h1 className="text-balance text-5xl font-semibold tracking-tight md:text-6xl">
                    Your videos. Your hardware. Your rules.
                </h1>
                <p className="mx-auto max-w-xl text-balance text-base text-muted-foreground">
                    A self-hosted personal video platform. Upload through a simple HTTP API, watch back as adaptive
                    HLS, and keep your library on disk where you can see it.
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                    href="/login"
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                >
                    Sign in
                </Link>
                <Link
                    href="/register"
                    className="rounded-full border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/70"
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
