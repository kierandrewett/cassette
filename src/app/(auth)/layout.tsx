import Link from "next/link";

// Minimal centred layout for authentication pages (login, register).
const AuthLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="relative flex min-h-screen flex-col">
            {/* Wordmark */}
            <header className="absolute left-0 top-0 p-6">
                <Link
                    href="/"
                    className="text-sm font-semibold tracking-tight text-foreground hover:text-foreground/80"
                >
                    cassette
                </Link>
            </header>

            {/* Centred content */}
            <main className="flex flex-1 items-center justify-center px-4 py-24">{children}</main>
        </div>
    );
};

export default AuthLayout;
