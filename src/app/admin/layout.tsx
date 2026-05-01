import AppShell from "@/components/shell/AppShell";
import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Admin — Cassette" };

// Admin lives inside the standard AppShell now — it shares the top bar,
// left rail, and theme so the surface reads as "still cassette" instead
// of a stripped-down sub-app. The AdminSubNav stays as the secondary
// navigation strip (Overview / Users / Videos / Storage / etc.).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    await requireAdmin();

    return (
        <AppShell>
            <AdminSubNav />
            <div className="p-6">{children}</div>
        </AppShell>
    );
}
