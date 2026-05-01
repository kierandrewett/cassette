import { redirect } from "next/navigation";

interface PlaylistsTabPageProps {
    params: Promise<{ handle: string }>;
}

// Redirect to the main channel page with the playlists tab selected.
const ChannelPlaylistsTabPage = async ({ params }: PlaylistsTabPageProps) => {
    const { handle } = await params;
    redirect(`/channel/${handle}?tab=playlists`);
};

export default ChannelPlaylistsTabPage;
