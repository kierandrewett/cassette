import { headers } from "next/headers";
import { redirect } from "next/navigation";

import AppShell from "@/components/shell/AppShell";
import { auth } from "@/lib/auth";

// /home is the landing surface for signed-in viewers. The full subscription
// feed and recommendations land in M7; for now we render the shell so the
// app frame is exercised end-to-end.
const HomePage = async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
        redirect("/login");
    }

    return (
        <AppShell>
            <div className="container mx-auto py-10">
                <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
                <p className="mt-2 max-w-2xl text-muted-foreground">
                    Your subscriptions feed and recommendations land with M7 (library and home rails).
                    Until then, head to{" "}
                    <a href="/studio" className="text-foreground underline-offset-4 hover:underline">
                        Studio
                    </a>{" "}
                    to create a channel and upload.
                </p>
            </div>
        </AppShell>
    );
};

export default HomePage;
