import { redirect } from "next/navigation";

interface AboutTabPageProps {
    params: Promise<{ handle: string }>;
}

// Redirect to the main channel page with the about tab selected.
const ChannelAboutTabPage = async ({ params }: AboutTabPageProps) => {
    const { handle } = await params;
    redirect(`/channel/${handle}?tab=about`);
};

export default ChannelAboutTabPage;
