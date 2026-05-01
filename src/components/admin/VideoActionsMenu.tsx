"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface VideoActionsMenuProps {
    videoId: string;
    videoTitle: string;
    videoStatus: "queued" | "transcoding" | "ready" | "failed";
    channelHandle: string;
}

export const VideoActionsMenu = ({ videoId, videoTitle, videoStatus, channelHandle }: VideoActionsMenuProps) => {
    const router = useRouter();
    const [confirmDelete, setConfirmDelete] = useState(false);

    const deleteVideo = api.admin.videos.delete.useMutation({
        onSuccess: () => {
            setConfirmDelete(false);
            router.refresh();
        },
    });

    const transcribeVideo = api.admin.videos.transcribe.useMutation({
        onSuccess: () => {
            toast.success("Captions queued — refresh in a minute or so.");
        },
        onError: (err) => {
            toast.error(`Failed to queue captions: ${err.message}`);
        },
    });

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Video actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <a href={`/watch/${videoId}`} target="_blank" rel="noopener noreferrer">
                            View
                        </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                        <a
                            href={`/studio/${channelHandle}/videos/${videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Open in Studio
                        </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        disabled={videoStatus !== "ready" || transcribeVideo.isPending}
                        onSelect={() => transcribeVideo.mutate({ videoId })}
                    >
                        Generate captions
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setConfirmDelete(true)}
                    >
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete video?</DialogTitle>
                        <DialogDescription>
                            &ldquo;{videoTitle}&rdquo; will be permanently deleted including all on-disk files. This
                            cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={deleteVideo.isPending}
                            onClick={() => deleteVideo.mutate({ videoId })}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
