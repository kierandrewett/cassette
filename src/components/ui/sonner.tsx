"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Toaster: always dark — cassette is dark-first, no theme toggle needed here.
const Toaster = ({ ...props }: ToasterProps) => {
    return (
        <Sonner
            theme="dark"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast: "group toast group-[.toaster]:surface-glass group-[.toaster]:text-foreground group-[.toaster]:shadow-xl",
                    description: "group-[.toast]:text-muted-foreground",
                    actionButton:
                        "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full",
                    cancelButton:
                        "group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground group-[.toast]:rounded-lg",
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
