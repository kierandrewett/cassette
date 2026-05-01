import { redirect } from "next/navigation";

interface VideoTabPageProps {
    params: Promise<{ handle: string }>;
}

// /channel/<handle>/videos always redirects to /channel/<handle> — the
// videos grid is the default tab and lives at the root. We keep this route
// alive so that links written as /channel/<h>/videos still work and so the
// tab nav can highlight Videos symmetrically with the other tabs.
const ChannelVideosTabPage = async ({ params }: VideoTabPageProps) => {
    const { handle } = await params;
    redirect(`/channel/${handle}`);
};

export default ChannelVideosTabPage;
