import { redirect } from "next/navigation";

// /home was the signed-in landing page in earlier waves. The home shell now
// renders at the root path /. Keep this route as a permanent redirect so old
// bookmarks, links, and shared URLs do not 404.
const RedirectHome = (): never => {
    redirect("/");
};

export default RedirectHome;
