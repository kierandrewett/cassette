import { count, eq, isNull, or, sql, sum } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { env } from "@/env";
import { db } from "@/server/db/client";
import { session, user } from "@/server/db/schema/auth";
import { channels } from "@/server/db/schema/channels";
import { transcodeJobs } from "@/server/db/schema/jobs";
import { channelBandwidthDaily } from "@/server/db/schema/metrics";
import { comments } from "@/server/db/schema/social";
import { videos } from "@/server/db/schema/videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Prometheus text exposition helpers
// ---------------------------------------------------------------------------

function gauge(name: string, help: string, value: number, labels?: Record<string, string>): string {
    const labelStr = labels
        ? `{${Object.entries(labels)
              .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
              .join(",")}}`
        : "";
    return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name}${labelStr} ${value}\n`;
}

function gaugeLines(
    name: string,
    help: string,
    rows: Array<{ labels?: Record<string, string>; value: number }>,
): string {
    const lines: string[] = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
    for (const { labels, value } of rows) {
        const labelStr = labels
            ? `{${Object.entries(labels)
                  .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
                  .join(",")}}`
            : "";
        lines.push(`${name}${labelStr} ${value}`);
    }
    return lines.join("\n") + "\n";
}

function counter(name: string, help: string, value: number, labels?: Record<string, string>): string {
    const labelStr = labels
        ? `{${Object.entries(labels)
              .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
              .join(",")}}`
        : "";
    return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name}${labelStr} ${value}\n`;
}

function escapeLabelValue(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
    // Optional bearer token auth.
    const metricsToken = env.METRICS_TOKEN;
    if (metricsToken) {
        const authHeader = req.headers.get("authorization") ?? "";
        const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (provided !== metricsToken) {
            return new Response("Unauthorised", { status: 401 });
        }
    }

    // Collect all metrics in parallel.
    const [
        userCountRows,
        channelCountRows,
        videoStatusRows,
        commentCountRows,
        pendingJobRows,
        failedJobRows,
        activeVideoCount,
        sessionCountRows,
        bandwidthRows,
    ] = await Promise.all([
        db.select({ cnt: count(user.id) }).from(user),
        db.select({ cnt: count(channels.id) }).from(channels),
        db
            .select({ status: videos.status, cnt: count(videos.id) })
            .from(videos)
            .groupBy(videos.status),
        db
            .select({ cnt: count(comments.id) })
            .from(comments)
            .where(isNull(comments.deletedAt)),
        db
            .select({ cnt: count(transcodeJobs.id) })
            .from(transcodeJobs)
            .where(or(eq(transcodeJobs.state, "queued"), eq(transcodeJobs.state, "running"))),
        db
            .select({ cnt: count(transcodeJobs.id) })
            .from(transcodeJobs)
            .where(eq(transcodeJobs.state, "failed")),
        db
            .select({ cnt: count(videos.id) })
            .from(videos)
            .where(sql`${videos.privacy} = 'public' AND ${videos.status} = 'ready'`),
        db
            .select({ cnt: sql<number>`count(*)` })
            .from(session)
            .where(sql`expires_at > now()`),
        db
            .select({
                channelId: channelBandwidthDaily.channelId,
                channelHandle: channels.handle,
                totalBytes: sum(channelBandwidthDaily.bytes),
            })
            .from(channelBandwidthDaily)
            .innerJoin(channels, eq(channelBandwidthDaily.channelId, channels.id))
            .groupBy(channelBandwidthDaily.channelId, channels.handle)
            .orderBy(sql`sum(${channelBandwidthDaily.bytes}) desc`),
    ]);

    const statusMap: Record<string, number> = {};
    for (const r of videoStatusRows) {
        statusMap[r.status] = Number(r.cnt);
    }

    // Build bandwidth lines: top 50 channels by name, rest as "other".
    const top50 = bandwidthRows.slice(0, 50);
    const otherBytes = bandwidthRows.slice(50).reduce((acc, r) => acc + Number(r.totalBytes ?? 0), 0);

    const bandwidthLines: Array<{ labels?: Record<string, string>; value: number }> = top50.map((r) => ({
        labels: { channel: r.channelHandle },
        value: Number(r.totalBytes ?? 0),
    }));

    // Build Prometheus output.
    const parts: string[] = [
        gauge("cassette_uptime_seconds", "Process uptime in seconds.", Math.floor(process.uptime())),
        gauge("cassette_users_total", "Total number of user accounts.", Number(userCountRows[0]?.cnt ?? 0)),
        gauge("cassette_channels_total", "Total number of channels.", Number(channelCountRows[0]?.cnt ?? 0)),
        gaugeLines(
            "cassette_videos_total",
            "Number of videos grouped by status.",
            (["queued", "transcoding", "ready", "failed"] as const).map((s) => ({
                labels: { status: s },
                value: statusMap[s] ?? 0,
            })),
        ),
        gauge(
            "cassette_comments_total",
            "Total number of non-deleted comments.",
            Number(commentCountRows[0]?.cnt ?? 0),
        ),
        gauge(
            "cassette_transcode_jobs_pending",
            "Number of transcode jobs in queued or running state.",
            Number(pendingJobRows[0]?.cnt ?? 0),
        ),
        gauge(
            "cassette_transcode_jobs_failed_total",
            "Number of transcode jobs currently in failed state.",
            Number(failedJobRows[0]?.cnt ?? 0),
        ),
        gauge(
            "cassette_pg_active_video_count",
            "Number of public, ready videos.",
            Number(activeVideoCount[0]?.cnt ?? 0),
        ),
        gauge(
            "cassette_pg_session_count",
            "Number of non-expired database sessions.",
            Number(sessionCountRows[0]?.cnt ?? 0),
        ),
    ];

    // Bandwidth counters — only emit if there is any data.
    if (bandwidthLines.length > 0 || otherBytes > 0) {
        const allLines = [...bandwidthLines];
        if (otherBytes > 0) {
            allLines.push({ labels: { channel: "_other" }, value: otherBytes });
        }
        parts.push(
            gaugeLines(
                "cassette_bandwidth_bytes_total",
                "Cumulative bytes served per channel across all time.",
                allLines,
            ),
        );
    }

    // Always emit the _other counter even if 0 when top50 is non-empty, for
    // consistency in dashboards. Skip entirely if no bandwidth data at all.
    if (bandwidthLines.length === 0 && otherBytes === 0) {
        parts.push(
            counter("cassette_bandwidth_bytes_total", "Cumulative bytes served per channel across all time.", 0),
        );
    }

    return new Response(parts.join(""), {
        status: 200,
        headers: {
            "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
