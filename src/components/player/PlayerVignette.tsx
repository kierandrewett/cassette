// Top and bottom dark gradient overlays — always visible, never fade.
// Ensures light video frames don't wash out the player chrome.
export const PlayerVignette = () => (
    <>
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-24 z-10"
            style={{
                background: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)",
            }}
        />
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32 z-10"
            style={{
                background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
            }}
        />
    </>
);
