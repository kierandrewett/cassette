import { headers } from "next/headers";

import { requireAdmin } from "@/lib/admin";
import { SitePrivacyForm } from "@/components/admin/SitePrivacyForm";

export default async function AdminSettingsPage() {
    await requireAdmin(await headers());

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="mt-1 text-sm text-muted-foreground">Platform-level configuration.</p>
            </div>
            <SitePrivacyForm />
        </div>
    );
}
