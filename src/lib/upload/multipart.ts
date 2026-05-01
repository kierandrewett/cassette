import { type IncomingMessage } from "node:http";
import { type Writable } from "node:stream";

import busboy from "busboy";

export type ParsedField = string;

export type FileInfo = {
    filename: string;
    mimeType: string;
    /** Total bytes written to the writable. */
    bytesWritten: number;
};

export type ParsedMultipart = {
    fields: Record<string, ParsedField>;
    file: FileInfo;
    /** Each extra caption file, collected in memory as a buffer. */
    captions: Array<{ filename: string; mimeType: string; data: Buffer }>;
};

const MAX_FIELD_SIZE = 12_000; // bytes; covers title + description + privacy + channelId
const MAX_CAPTION_SIZE = 2_000_000; // 2 MB per caption sidecar

export type MultipartOptions = {
    /** Max total bytes the file field may produce; caller sends 413 on rejection. */
    maxFileBytes: number;
    /** Writable stream to pipe the video file into. */
    fileTarget: Writable;
    /** Headers from the incoming request (needed by busboy). */
    headers: Record<string, string | string[] | undefined>;
};

// Parse a multipart upload with busboy, streaming the `file` field to
// `options.fileTarget` and collecting everything else in memory.
//
// Rejects if:
//   - more than one `file` field is present
//   - the file exceeds `maxFileBytes`
//   - any field value exceeds MAX_FIELD_SIZE
//   - a caption buffer exceeds MAX_CAPTION_SIZE
export const parseMultipart = (req: IncomingMessage, options: MultipartOptions): Promise<ParsedMultipart> =>
    new Promise((resolve, reject) => {
        const bb = busboy({
            headers: options.headers as Record<string, string>,
            limits: {
                fieldSize: MAX_FIELD_SIZE,
                fileSize: options.maxFileBytes,
                files: 50, // 1 video + up to 49 caption sidecars
            },
        });

        const fields: Record<string, ParsedField> = {};
        let fileInfo: FileInfo | null = null;
        let fileOversize = false;
        const captions: ParsedMultipart["captions"] = [];
        let captionError: Error | null = null;
        let fileCount = 0;
        let pending = 0; // count of in-flight async operations

        const done = (): void => {
            if (pending !== 0) return; // wait until all streams finish
            if (captionError) {
                reject(captionError);
                return;
            }
            if (fileOversize) {
                reject(Object.assign(new Error("upload exceeds maximum size"), { code: "LIMIT_FILE_SIZE" }));
                return;
            }
            if (!fileInfo) {
                reject(new Error("no file field in multipart body"));
                return;
            }
            resolve({ fields, file: fileInfo, captions });
        };

        bb.on("field", (name, value, info) => {
            if (info.valueTruncated) {
                reject(new Error(`field '${name}' exceeds maximum length`));
                return;
            }
            // For repeated fields (captions[]), store as comma-separated for simplicity.
            // Actual per-field parsing is done in the route handler.
            if (name in fields) {
                fields[name] = `${fields[name]},${value}`;
            } else {
                fields[name] = value;
            }
        });

        bb.on("file", (name, stream, info) => {
            const { filename, mimeType } = info;

            if (name === "file") {
                fileCount++;
                if (fileCount > 1) {
                    stream.resume(); // drain and ignore
                    reject(new Error("only one file field is permitted"));
                    return;
                }

                let bytesWritten = 0;
                pending++;

                stream.on("data", (chunk: Buffer) => {
                    bytesWritten += chunk.length;
                });

                stream.on("limit", () => {
                    fileOversize = true;
                    // Let busboy drain; we resolve/reject after finish.
                });

                stream.pipe(options.fileTarget, { end: true });

                options.fileTarget.on("finish", () => {
                    if (!fileOversize) {
                        fileInfo = { filename, mimeType, bytesWritten };
                    }
                    pending--;
                    done();
                });

                options.fileTarget.on("error", (err) => {
                    pending--;
                    reject(err);
                });
            } else if (name === "captions[]" || name === "captions") {
                // Sidecar .vtt files — buffer in memory (small).
                const chunks: Buffer[] = [];
                let captionBytes = 0;
                pending++;

                stream.on("data", (chunk: Buffer) => {
                    captionBytes += chunk.length;
                    if (captionBytes > MAX_CAPTION_SIZE) {
                        captionError = new Error(`caption file '${filename}' exceeds ${MAX_CAPTION_SIZE} bytes`);
                        stream.resume();
                        return;
                    }
                    chunks.push(chunk);
                });

                stream.on("end", () => {
                    if (!captionError) {
                        captions.push({ filename, mimeType, data: Buffer.concat(chunks) });
                    }
                    pending--;
                    done();
                });

                stream.on("error", (err) => {
                    pending--;
                    reject(err);
                });
            } else {
                // Unknown file field — drain and ignore.
                stream.resume();
            }
        });

        bb.on("finish", () => {
            // File streams may still be writing; `done()` is called when pending === 0.
            done();
        });

        bb.on("error", reject);
        bb.on("fieldsLimit", () => reject(new Error("too many fields in multipart body")));

        req.pipe(bb);
    });
