"use client";

// global-error.tsx is rendered when the root layout itself throws. It must
// own the html/body tags. Keep it minimal so it has no chance of itself
// crashing.
const GlobalErrorPage = ({ reset }: { error: Error & { digest?: string }; reset: () => void }) => {
    return (
        <html lang="en">
            <body
                style={{
                    background: "#000",
                    color: "#fff",
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "2rem",
                }}
            >
                <div style={{ textAlign: "center", maxWidth: 480 }}>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                        cassette is offline
                    </h1>
                    <p style={{ opacity: 0.75, marginBottom: "1.5rem" }}>
                        Something failed before we could render the app. Please refresh; if the problem persists, check
                        the server logs.
                    </p>
                    <button
                        type="button"
                        onClick={() => reset()}
                        style={{
                            padding: "0.5rem 1.25rem",
                            borderRadius: 9999,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#fff",
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
};

export default GlobalErrorPage;
