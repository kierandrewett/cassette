import PgBoss from "pg-boss";

import { env } from "@/env";

import { transcodeHandler, type TranscodePayload } from "./jobs/transcode";
import { pruneHandler } from "./jobs/prune";
import { publishHandler, type PublishPayload } from "./jobs/publish";
import { transcribeHandler, type TranscribePayload } from "./jobs/transcribe";

// Why globalThis: Next.js loads instrumentation.ts and route handlers into
// separate module trees, so a module-scoped `let boss` would be initialised
// by instrumentation but read as `null` from the upload route. Stashing the
// instance on globalThis gives both module trees the same handle.
type WorkerGlobals = {
    __CASSETTE_WORKER_BOOTED__?: boolean;
    __CASSETTE_WORKER_BOOT_PROMISE__?: Promise<void>;
    __CASSETTE_PG_BOSS__?: PgBoss;
};

const workerGlobal = globalThis as unknown as WorkerGlobals;

const bootOnce = async (): Promise<void> => {
    if (workerGlobal.__CASSETTE_WORKER_BOOTED__) return;
    workerGlobal.__CASSETTE_WORKER_BOOTED__ = true;

    const boss = new PgBoss({
        connectionString: env.DATABASE_URL,
        schema: "pgboss",
        // Retain completed jobs for 24 h so the studio can display history.
        archiveCompletedAfterSeconds: 60 * 60 * 24,
        deleteAfterSeconds: 60 * 60 * 24 * 7,
    });

    boss.on("error", (err) => {
        console.error("[worker] pg-boss error:", err);
    });

    await boss.start();

    workerGlobal.__CASSETTE_PG_BOSS__ = boss;

    // pg-boss v10 makes queues explicit objects: createQueue is required
    // before send() or work() will accept the name. v9 created queues
    // implicitly which is why the original plan did not mention this.
    // retryLimit / retryBackoff are passed on send() per-job so we leave
    // the queue defaults alone here.
    await boss.createQueue("transcode-video");
    await boss.createQueue("transcribe-video");
    await boss.createQueue("prune-old-videos");
    await boss.createQueue("publish-video");

    // pg-boss v10 fetches up to batchSize jobs at once. Our handler iterates
    // serially, so batchSize maps onto the v9 teamSize/teamConcurrency knob.
    await boss.work<TranscodePayload>("transcode-video", { batchSize: env.TRANSCODE_CONCURRENCY }, transcodeHandler);

    await boss.work<TranscribePayload>("transcribe-video", { batchSize: 1 }, transcribeHandler);

    await boss.work<Record<string, never>>("prune-old-videos", { batchSize: 1 }, pruneHandler);

    // Scheduled publishes: small burst-size, no rate-limit. The handler is
    // a thin guard around video.publish so cost is dominated by the
    // transcode it enqueues.
    await boss.work<PublishPayload>("publish-video", { batchSize: 5 }, publishHandler);

    // Schedule the prune job to run daily at 03:00 UTC.
    // pg-boss schedule is idempotent so this is safe to call on every boot.
    await boss.schedule("prune-old-videos", "0 3 * * *");

    console.log(`[worker] pg-boss started; registered transcode-video worker (batchSize=${env.TRANSCODE_CONCURRENCY})`);
};

// registerWorker is called from instrumentation.ts on server boot. Idempotent.
export const registerWorker = async (): Promise<void> => {
    if (!workerGlobal.__CASSETTE_WORKER_BOOT_PROMISE__) {
        workerGlobal.__CASSETTE_WORKER_BOOT_PROMISE__ = bootOnce();
    }
    await workerGlobal.__CASSETTE_WORKER_BOOT_PROMISE__;
};

// Returns the live boss instance, or null if boot has not yet completed.
export const getBoss = (): PgBoss | null => workerGlobal.__CASSETTE_PG_BOSS__ ?? null;

// On-demand boot for routes that hit the queue before instrumentation has
// finished its first run (cold-start race in dev). Awaits whichever boot is
// already in flight via the same workerGlobal flag.
export const ensureBoss = async (): Promise<PgBoss> => {
    await registerWorker();
    const boss = workerGlobal.__CASSETTE_PG_BOSS__;
    if (!boss) {
        throw new Error("pg-boss failed to initialise");
    }
    return boss;
};
