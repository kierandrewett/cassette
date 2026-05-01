"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Data section of the Settings page.
 *
 * Provides:
 * - Download your data  → JSON export via account.requestDataExport
 * - Download OPML       → triggers /account/subscriptions.opml route
 * - Delete account      → confirmation dialog + account.deleteAccount
 */
export const DataPanel = ({ userEmail }: { userEmail: string }) => {
    return (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
            <ExportDataRow />
            <ExportOpmlRow />
            <DeleteAccountRow userEmail={userEmail} />
        </div>
    );
};

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

const ExportDataRow = () => {
    const [busy, setBusy] = useState(false);
    const exportMutation = api.account.requestDataExport.useMutation();

    const handleExport = async () => {
        setBusy(true);
        try {
            const data = await exportMutation.mutateAsync();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `cassette-data-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Your data export has been downloaded.");
        } catch {
            toast.error("Failed to export data. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">Download your data</p>
                <p className="text-xs text-muted-foreground">
                    Export all of your account data as a JSON file (profile, videos, comments, history).
                </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={busy} className="shrink-0">
                <Download className="mr-2 h-4 w-4" />
                {busy ? "Preparing…" : "Download"}
            </Button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// OPML subscriptions export
// ---------------------------------------------------------------------------

const ExportOpmlRow = () => {
    const handleDownload = () => {
        // Navigate to the authenticated route — the browser will receive the file.
        window.location.href = "/account/subscriptions.opml";
    };

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">Download OPML of subscriptions</p>
                <p className="text-xs text-muted-foreground">
                    Export your channel subscriptions in OPML format for use in RSS readers.
                </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleDownload} className="shrink-0">
                <Download className="mr-2 h-4 w-4" />
                Download OPML
            </Button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Delete account
// ---------------------------------------------------------------------------

const DeleteAccountRow = ({ userEmail }: { userEmail: string }) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirmValue, setConfirmValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const deleteMutation = api.account.deleteAccount.useMutation({
        onSuccess: () => {
            toast.success("Your account has been deleted.");
            router.push("/");
        },
        onError: (err) => {
            toast.error(err.message ?? "Failed to delete account. Please try again.");
        },
    });

    const emailMatch = confirmValue.toLowerCase() === userEmail.toLowerCase();

    const handleDelete = () => {
        if (!emailMatch) return;
        deleteMutation.mutate({ confirmEmail: confirmValue });
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) setConfirmValue("");
    };

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-destructive">Delete account</p>
                <p className="text-xs text-muted-foreground">
                    Permanently delete your account, all your channels, videos, and data. This cannot be undone.
                </p>
            </div>

            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="shrink-0">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                    </Button>
                </DialogTrigger>

                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete your account</DialogTitle>
                        <DialogDescription>
                            This will permanently delete your account, all channels you own, all videos those channels
                            contain, and all associated data. This action <strong>cannot be undone</strong>.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-2">
                        <Label htmlFor="confirm-email">
                            Type your email address to confirm:{" "}
                            <span className="font-mono text-foreground">{userEmail}</span>
                        </Label>
                        <Input
                            id="confirm-email"
                            ref={inputRef}
                            type="email"
                            placeholder={userEmail}
                            value={confirmValue}
                            onChange={(e) => setConfirmValue(e.target.value)}
                            autoComplete="off"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && emailMatch) handleDelete();
                            }}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={deleteMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={!emailMatch || deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? "Deleting…" : "Delete my account"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
