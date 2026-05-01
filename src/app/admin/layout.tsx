import { headers } from "next/headers";

import { requireAdmin } from "@/lib/admin";
import { AdminSubNav } from "@/components/admin/AdminSubNav";

export const metadata = { title: "Admin — Cassette" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    // Guard: non-admins are redirected to /.
    await requireAdmin(await headers());

    return (
        <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
            <div className="pt-14">
                <AdminSubNav />
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}
