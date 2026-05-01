import { redirect } from "next/navigation";

interface VideoTabPageProps {
    params: Promise<{ handle: string }>;
}

// Redirect to the main channel page with the videos tab selected.
// The channel layout renders all content via searchParams.tab on the root [handle]/page.tsx.
const ChannelVideosTabPage = async ({ params }: VideoTabPageProps) => {
    const { handle } = await params;
    redirect(`/c/${handle}?tab=videos`);
};

export default ChannelVideosTabPage;
