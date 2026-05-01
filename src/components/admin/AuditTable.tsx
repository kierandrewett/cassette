"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditRow {
    id: string;
    actorId: string | null;
    actorName: string | null;
    actorEmail: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    details: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
}

interface AuditTableProps {
    rows: AuditRow[];
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

const relativeTime = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
};

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

const AuditRowItem = ({ row }: { row: AuditRow }) => {
    const [expanded, setExpanded] = useState(false);

    const hasDetails = row.details !== null && row.details !== undefined;

    return (
        <>
            <tr className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    <span title={row.createdAt.toISOString()}>{relativeTime(row.createdAt)}</span>
                </td>
                <td className="px-4 py-3">
                    {row.actorName ? (
                        <div>
                            <span className="font-medium">{row.actorName}</span>
                            {row.actorEmail && <div className="text-xs text-muted-foreground">{row.actorEmail}</div>}
                        </div>
                    ) : (
                        <span className="italic text-muted-foreground">system</span>
                    )}
                </td>
                <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.action}</code>
                </td>
                <td className="px-4 py-3 text-sm">
                    {row.targetId ? (
                        <div>
                            <span className="text-muted-foreground">{row.targetType}</span>
                            <div className="max-w-[160px] truncate font-mono text-xs text-muted-foreground">
                                {row.targetId}
                            </div>
                        </div>
                    ) : (
                        <span className="text-muted-foreground">{row.targetType}</span>
                    )}
                </td>
                <td className="px-4 py-3">
                    {hasDetails ? (
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className={cn(
                                "flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors",
                                "border border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            aria-expanded={expanded}
                        >
                            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            {expanded ? "Hide" : "Show"}
                        </button>
                    ) : (
                        <span className="text-muted-foreground">—</span>
                    )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.ipAddress ?? "—"}</td>
            </tr>
            {expanded && hasDetails && (
                <tr className="border-b border-border bg-muted/10">
                    <td colSpan={6} className="px-4 py-3">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted p-3 font-mono text-xs">
                            {JSON.stringify(row.details, null, 2)}
                        </pre>
                    </td>
                </tr>
            )}
        </>
    );
};

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export const AuditTable = ({ rows }: AuditTableProps) => {
    if (rows.length === 0) {
        return (
            <div className="rounded-lg border border-border px-4 py-12 text-center text-muted-foreground">
                No audit events found.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border bg-muted/40">
                        <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-muted-foreground">
                            When
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actor</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Target</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <AuditRowItem key={row.id} row={row} />
                    ))}
                </tbody>
            </table>
        </div>
    );
};
