"use client";

import { Download01Icon } from "hugeicons-react";
import { useEffect, useState } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

// Chrome's `BeforeInstallPromptEvent` is not in the standard DOM lib; declare
// the minimal surface we use locally to avoid a global type pollution.
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Renders a "Install app" dropdown item that hides itself unless the browser
 * has fired `beforeinstallprompt` (i.e. PWA install is currently available
 * and the page is not already installed).
 *
 * Mounted inside the avatar dropdown menu in AppHeader.
 */
export const PwaInstallButton = () => {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(false);

    useEffect(() => {
        const onPrompt = (e: Event) => {
            // Stash the event for later; calling preventDefault() prevents
            // Chrome's default mini-bar so we can show our own affordance.
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setInstalled(true);
            setDeferred(null);
        };

        window.addEventListener("beforeinstallprompt", onPrompt);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onPrompt);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    if (installed || !deferred) return null;

    const handleInstall = async () => {
        const evt = deferred;
        if (!evt) return;
        try {
            await evt.prompt();
            await evt.userChoice;
        } finally {
            // Browsers fire `beforeinstallprompt` exactly once per session.
            setDeferred(null);
        }
    };

    return (
        <DropdownMenuItem className="cursor-pointer" onSelect={() => void handleInstall()}>
            <Download01Icon size={16} strokeWidth={1.6} />
            Install app
        </DropdownMenuItem>
    );
};
