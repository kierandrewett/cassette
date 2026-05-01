"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

interface JobActionsMenuProps {
    videoId: string;
    state: string;
}

export const JobActionsMenu = ({ videoId, state }: JobActionsMenuProps) => {
    const router = useRouter();

    const retry = api.admin.jobs.retry.useMutation({
        onSuccess: () => router.refresh(),
    });

    if (state !== "failed") return null;

    return (
        <Button
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            onClick={() => retry.mutate({ videoId })}
            className="gap-1.5"
        >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
        </Button>
    );
};
