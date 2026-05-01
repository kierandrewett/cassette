import Image from "next/image";

interface PlaylistHeroProps {
    title: string;
    description?: string;
    /** Up to 4 thumbnail URLs used for the mosaic grid. */
    thumbnails: (string | null)[];
    itemCount: number;
    totalRuntimeSec: number;
    privacy: "public" | "unlisted" | "private";
}

const privacyLabel: Record<PlaylistHeroProps["privacy"], string> = {
    public: "Public",
    unlisted: "Unlisted",
    private: "Private",
};

// Mosaic hero: 4-quadrant thumbnail grid (or a single tile if fewer videos).
export const PlaylistHero = ({
    title,
    description,
    thumbnails,
    itemCount,
    totalRuntimeSec,
    privacy,
}: PlaylistHeroProps) => {
    const thumbs = thumbnails.slice(0, 4);

    const hours = Math.floor(totalRuntimeSec / 3600);
    const mins = Math.floor((totalRuntimeSec % 3600) / 60);
    const runtimeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return (
        <div className="flex flex-col gap-4">
            {/* Mosaic thumbnail */}
            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-secondary">
                {thumbs.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm text-muted-foreground">No videos yet</span>
                    </div>
                )}
                {thumbs.length === 1 && thumbs[0] && (
                    <Image src={thumbs[0]} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 400px" />
                )}
                {thumbs.length >= 2 && (
                    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
                        {Array.from({ length: 4 }, (_, i) => {
                            const src = thumbs[i] ?? null;
                            return (
                                <div key={i} className="relative overflow-hidden bg-secondary">
                                    {src ? (
                                        <Image
                                            src={src}
                                            alt=""
                                            fill
                                            className="object-cover"
                                            sizes="200px"
                                        />
                                    ) : (
                                        <div className="h-full w-full bg-secondary" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Text block */}
            <div className="space-y-1">
                <h1 className="text-xl font-semibold text-foreground leading-tight">{title}</h1>
                {description && (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                    <span>{itemCount} {itemCount === 1 ? "video" : "videos"}</span>
                    {totalRuntimeSec > 0 && (
                        <>
                            <span aria-hidden="true">&middot;</span>
                            <span>{runtimeLabel}</span>
                        </>
                    )}
                    <span aria-hidden="true">&middot;</span>
                    <span
                        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                    >
                        {privacyLabel[privacy]}
                    </span>
                </div>
            </div>
        </div>
    );
};
