import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/lib/auth";
import AppShell from "@/components/shell/AppShell";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { PasskeysPanel } from "@/components/settings/PasskeysPanel";
import { PreferencesPanel } from "@/components/settings/PreferencesPanel";
import { SessionsPanel } from "@/components/settings/SessionsPanel";
import { TwoFactorPanel } from "@/components/settings/TwoFactorPanel";
import { SignOutButton } from "./SettingsClient";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
        redirect("/login");
    }

    const { user } = session;

    return (
        <AppShell>
            <div className="mx-auto max-w-2xl space-y-8 px-4 py-10 md:px-6">
                <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

                {/* Account section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Account
                    </h2>
                    <div className="rounded-xl border border-border bg-card divide-y divide-border">
                        <SettingsRow label="Name" value={user.name} />
                        <SettingsRow label="Email" value={user.email} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Account details are managed by your administrator. Contact them to update your
                        name or email address.
                    </p>
                </section>

                {/* Theme section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Theme
                    </h2>
                    <div className="rounded-xl border border-border bg-card divide-y divide-border">
                        <SettingsRow label="Colour scheme" value="Dark (system)" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        cassette is dark-only by design. System preference is respected where the
                        browser supports the{" "}
                        <code className="font-mono text-[11px]">prefers-color-scheme</code> media query,
                        but no light theme is available.
                    </p>
                </section>

                {/* Preferences section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Preferences
                    </h2>
                    <div className="rounded-xl border border-border bg-card divide-y divide-border">
                        <PreferencesPanel />
                    </div>
                </section>

                {/* Password section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Password
                    </h2>
                    <div className="rounded-xl border border-border bg-card px-4 py-4">
                        <ChangePasswordForm />
                    </div>
                </section>

                {/* Passkeys section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Passkeys
                    </h2>
                    <PasskeysPanel />
                </section>

                {/* Two-factor authentication section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Two-factor authentication
                    </h2>
                    <div className="rounded-xl border border-border bg-card px-4 py-4">
                        <TwoFactorPanel twoFactorEnabled={(user as unknown as { twoFactorEnabled?: boolean }).twoFactorEnabled ?? false} />
                    </div>
                </section>

                {/* Sessions section */}
                <section className="space-y-4">
                    <h2 className="text-base font-semibold text-foreground/80 uppercase tracking-wider">
                        Active Sessions
                    </h2>
                    <SessionsPanel />
                </section>

                {/* Sign out */}
                <section className="space-y-2">
                    <SignOutButton />
                </section>
            </div>
        </AppShell>
    );
}

// Simple read-only label/value row for the settings card.
const SettingsRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground truncate max-w-xs text-right">{value}</span>
    </div>
);
