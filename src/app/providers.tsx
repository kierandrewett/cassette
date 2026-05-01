"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

interface ProvidersProps {
    children: React.ReactNode;
}

// Client-side providers. Wraps TooltipProvider (required by all Tooltip usage)
// and the Sonner Toaster. tRPC + Better-Auth providers are managed by A1 and
// must sit inside this component (this is the outermost client boundary).
export const Providers = ({ children }: ProvidersProps) => {
    return (
        <TooltipProvider delayDuration={400}>
            {children}
            <Toaster position="bottom-right" />
        </TooltipProvider>
    );
};
