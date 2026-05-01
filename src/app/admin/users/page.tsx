import { headers } from "next/headers";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";

interface SearchParams {
    q?: string;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireAdmin(await headers());
    const { q } = await searchParams;

    const { items } = await trpc.admin.users.list({ q, limit: 50 });

    const formatDate = (d: Date | string | null | undefined) =>
        d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Users</h1>
                    <p className="text-sm text-muted-foreground">
                        {items.length} user{items.length !== 1 ? "s" : ""} shown
                    </p>
                </div>
                <form method="GET" className="flex gap-2">
                    <input
                        name="q"
                        defaultValue={q ?? ""}
                        placeholder="Search by name or email…"
                        className="w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Search
                    </button>
                </form>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40">
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Channels</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last sign-in</th>
                            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Admin</th>
                            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((u) => (
                            <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                                <td className="px-4 py-3">
                                    <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                                        {u.name}
                                    </Link>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                                <td className="px-4 py-3 tabular-nums">{u.channelCount}</td>
                                <td className="px-4 py-3 text-muted-foreground">{formatDate(u.lastSignIn)}</td>
                                <td className="px-4 py-3">
                                    {u.isAdmin && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                            <ShieldCheck className="h-3 w-3" />
                                            Admin
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <UserActionsMenu userId={u.id} userName={u.name} isAdmin={u.isAdmin} />
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                                    No users found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
