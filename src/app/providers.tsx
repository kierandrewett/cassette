"use client";

import { Suspense } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { TopLoader } from "@/components/shell/TopLoader";

interface ProvidersProps {
    children: React.ReactNode;
}

// Client-side providers. Wraps TooltipProvider (required by all Tooltip usage)
// and the Sonner Toaster. tRPC + Better-Auth providers are managed by A1 and
// must sit inside this component (this is the outermost client boundary).
//
// The TopLoader uses useSearchParams which requires a Suspense boundary; we
// provide one here so navigations show the slim top progress bar without
// forcing the rest of the tree to suspend.
export const Providers = ({ children }: ProvidersProps) => {
    return (
        <TooltipProvider delayDuration={400}>
            <Suspense fallback={null}>
                <TopLoader />
            </Suspense>
            {children}
            <Toaster position="bottom-right" />
        </TooltipProvider>
    );
};
