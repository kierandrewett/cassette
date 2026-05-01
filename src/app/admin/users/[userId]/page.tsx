import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { UserActionsMenu } from "@/components/admin/UserActionsMenu";

interface Props {
    params: Promise<{ userId: string }>;
}

const formatDate = (d: Date | string | null | undefined) =>
    d
        ? new Date(d).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "—";

export default async function AdminUserDetailPage({ params }: Props) {
    await requireAdmin(await headers());
    const { userId } = await params;

    let data: Awaited<ReturnType<typeof trpc.admin.users.byId>>;
    try {
        data = await trpc.admin.users.byId({ userId });
    } catch {
        notFound();
    }

    const { user, ownedChannels, videoCount, sessions, isAdmin, adminGrant } = data;

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-2xl font-bold">{user.name}</h1>
                        {isAdmin && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                <ShieldCheck className="h-3 w-3" />
                                Admin
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Joined {formatDate(user.createdAt)}</p>
                </div>
                <UserActionsMenu userId={user.id} userName={user.name} isAdmin={isAdmin} />
            </div>

            {isAdmin && adminGrant && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                    <p>
                        Admin since {formatDate(adminGrant.grantedAt)}.
                        {adminGrant.grantedBy && ` Granted by user ID ${adminGrant.grantedBy}.`}
                    </p>
                </div>
            )}

            {/* Channels */}
            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Channels ({ownedChannels.length})</h2>
                {ownedChannels.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No channels owned.</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Handle</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ownedChannels.map((ch) => (
                                    <tr key={ch.id} className="border-b border-border last:border-0">
                                        <td className="px-4 py-2 font-mono text-xs">
                                            <Link href={`/channel/${ch.handle}`} className="text-primary hover:underline">
                                                @{ch.handle}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2">{ch.name}</td>
                                        <td className="px-4 py-2 text-muted-foreground">{formatDate(ch.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs text-muted-foreground">Videos across all channels: {videoCount}</p>
            </section>

            {/* Sessions */}
            <section className="space-y-2">
                <h2 className="text-lg font-semibold">Recent sessions ({sessions.length})</h2>
                {sessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No sessions found.</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/40">
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                        IP address
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                                        User agent
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Expires</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map((s) => (
                                    <tr key={s.id} className="border-b border-border last:border-0">
                                        <td className="px-4 py-2 font-mono text-xs">{s.ipAddress ?? "—"}</td>
                                        <td className="max-w-xs truncate px-4 py-2 text-xs text-muted-foreground">
                                            {s.userAgent ?? "—"}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-muted-foreground">
                                            {formatDate(s.createdAt)}
                                        </td>
                                        <td className="px-4 py-2 text-xs text-muted-foreground">
                                            {formatDate(s.expiresAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
