"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * Toggle for the sign-in alerts preference. Sits inside the Security section
 * of the Settings page.
 */
export const SignInAlertsToggle = () => {
    const utils = api.useUtils();
    const { data, isLoading } = api.account.getSignInAlerts.useQuery();

    const [optimistic, setOptimistic] = useState<boolean | null>(null);

    // Sync optimistic state when data arrives.
    useEffect(() => {
        if (data !== undefined) {
            setOptimistic(data.enabled);
        }
    }, [data]);

    const mutation = api.account.setSignInAlerts.useMutation({
        onSuccess: (result) => {
            setOptimistic(result.enabled);
            void utils.account.getSignInAlerts.invalidate();
            toast.success(result.enabled ? "Sign-in alerts enabled." : "Sign-in alerts disabled.");
        },
        onError: () => {
            // Revert the optimistic toggle.
            setOptimistic(data?.enabled ?? false);
            toast.error("Failed to update sign-in alert preference.");
        },
    });

    const enabled = optimistic ?? data?.enabled ?? false;

    const handleToggle = (checked: boolean) => {
        setOptimistic(checked);
        mutation.mutate({ enabled: checked });
    };

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex flex-col gap-0.5">
                <Label htmlFor="sign-in-alerts" className="cursor-pointer text-sm font-medium text-foreground">
                    Sign-in alerts
                </Label>
                <p className="text-xs text-muted-foreground">
                    Receive an email when a new device or IP address signs in to your account.
                </p>
            </div>
            <Switch
                id="sign-in-alerts"
                checked={enabled}
                onCheckedChange={handleToggle}
                disabled={isLoading || mutation.isPending}
                aria-label="Enable sign-in alerts"
            />
        </div>
    );
};
