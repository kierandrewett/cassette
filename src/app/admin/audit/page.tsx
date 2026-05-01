import { headers } from "next/headers";

import { requireAdmin } from "@/lib/admin";
import { trpc } from "@/lib/trpc/server";
import { auditActionValues } from "@/server/db/schema/audit";
import { AuditTable } from "@/components/admin/AuditTable";

interface SearchParams {
    action?: string;
    actorId?: string;
    targetType?: string;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    await requireAdmin(await headers());
    const sp = await searchParams;

    const { action, actorId, targetType } = sp;

    const { items } = await trpc.admin.audit.list({
        limit: 100,
        action: action || undefined,
        actorId: actorId || undefined,
        targetType: targetType || undefined,
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Audit log</h1>
                    <p className="text-sm text-muted-foreground">
                        {items.length} event{items.length !== 1 ? "s" : ""} shown
                    </p>
                </div>
                <form method="GET" className="flex flex-wrap gap-2">
                    <select
                        name="action"
                        defaultValue={action ?? ""}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">All actions</option>
                        {auditActionValues.map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                    <select
                        name="targetType"
                        defaultValue={targetType ?? ""}
                        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        <option value="">All targets</option>
                        <option value="user">user</option>
                        <option value="video">video</option>
                        <option value="channel">channel</option>
                        <option value="site">site</option>
                        <option value="apiKey">apiKey</option>
                        <option value="job">job</option>
                    </select>
                    {actorId && <input type="hidden" name="actorId" value={actorId} />}
                    <button
                        type="submit"
                        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        Filter
                    </button>
                    {(action || actorId || targetType) && (
                        <a
                            href="/admin/audit"
                            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                        >
                            Clear filters
                        </a>
                    )}
                </form>
            </div>

            {(action || actorId || targetType) && (
                <div className="flex flex-wrap gap-2">
                    {action && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-0.5 text-xs">
                            Action: <strong>{action}</strong>
                        </span>
                    )}
                    {targetType && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-0.5 text-xs">
                            Target: <strong>{targetType}</strong>
                        </span>
                    )}
                    {actorId && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-0.5 text-xs">
                            Actor ID: <strong className="font-mono">{actorId}</strong>
                        </span>
                    )}
                </div>
            )}

            <AuditTable rows={items} />
        </div>
    );
}
