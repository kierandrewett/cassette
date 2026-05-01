"use client";

// global-error.tsx is rendered when the root layout itself throws. It must
// own the html/body tags. Keep it minimal so it has no chance of itself
// crashing — that means no Tailwind class lookups, no imports beyond React.
//
// Theme handling: we can't trust that the layout's pre-paint script ran (it
// may have been the thing that crashed), so we read the persisted theme
// choice ourselves and fall back to prefers-color-scheme. The result drives
// inline CSS variables so the error surface respects light/dark.
//
// Next does not always provide `reset` — for example when the boundary is
// invoked from a server-rendered error path where the client-side recovery
// machinery is unavailable. Type it as optional and fall back to a hard
// reload so the button never throws "reset is not a function".

const STYLE = `
:root {
    color-scheme: light;
    --error-bg: #f7f7f8;
    --error-fg: #111;
    --error-muted: #5b5b5b;
    --error-border: rgba(0, 0, 0, 0.12);
    --error-button-bg: rgba(0, 0, 0, 0.06);
    --error-button-hover: rgba(0, 0, 0, 0.1);
}
@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
        --error-bg: #18181a;
        --error-fg: #fafafa;
        --error-muted: rgba(250, 250, 250, 0.7);
        --error-border: rgba(255, 255, 255, 0.14);
        --error-button-bg: rgba(255, 255, 255, 0.08);
        --error-button-hover: rgba(255, 255, 255, 0.14);
    }
}
html.dark {
    color-scheme: dark;
    --error-bg: #18181a;
    --error-fg: #fafafa;
    --error-muted: rgba(250, 250, 250, 0.7);
    --error-border: rgba(255, 255, 255, 0.14);
    --error-button-bg: rgba(255, 255, 255, 0.08);
    --error-button-hover: rgba(255, 255, 255, 0.14);
}
.cassette-error-body {
    margin: 0;
    background: var(--error-bg);
    color: var(--error-fg);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
}
.cassette-error-button {
    padding: 0.5rem 1.25rem;
    border-radius: 9999px;
    border: 1px solid var(--error-border);
    background: var(--error-button-bg);
    color: var(--error-fg);
    font: inherit;
    cursor: pointer;
    transition: background-color 0.15s ease;
}
.cassette-error-button:hover { background: var(--error-button-hover); }
.cassette-error-muted { color: var(--error-muted); }
`;

// Pre-paint script: applies the persisted theme choice to <html> so the
// CSS variables resolve to the right palette before first paint. Mirrors
// the script in app/layout.tsx but inlined here so a layout crash doesn't
// leave the error page on the wrong palette.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('cassette.theme');var h=document.documentElement;if(t==='dark'){h.classList.add('dark');}else if(t==='light'){h.classList.remove('dark');}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){h.classList.add('dark');}}catch(e){}})();`;

const GlobalErrorPage = ({ reset }: { error: Error & { digest?: string }; reset?: () => void }) => {
    const handleRetry = () => {
        if (typeof reset === "function") {
            reset();
            return;
        }
        if (typeof window !== "undefined") {
            window.location.reload();
        }
    };
    return (
        <html lang="en">
            <head>
                <style dangerouslySetInnerHTML={{ __html: STYLE }} />
                <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
            </head>
            <body className="cassette-error-body">
                <div style={{ textAlign: "center", maxWidth: 480 }}>
                    <h1 style={{ fontSize: "1.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                        cassette is offline
                    </h1>
                    <p className="cassette-error-muted" style={{ marginBottom: "1.5rem" }}>
                        Something failed before we could render the app. Please refresh; if the problem persists, check
                        the server logs.
                    </p>
                    <button type="button" onClick={handleRetry} className="cassette-error-button">
                        Try again
                    </button>
                </div>
            </body>
        </html>
    );
};

export default GlobalErrorPage;
