import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
    title: "Reset password",
};

type Props = {
    searchParams: Promise<{ token?: string }>;
};

const ResetPasswordPage = async ({ searchParams }: Props) => {
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight">Invalid link</h1>
                    <p className="text-sm text-muted-foreground">
                        This password reset link is missing a token. Please request a new one.
                    </p>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                    <a
                        href="/forgot-password"
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                        Request a new link
                    </a>
                </p>
            </div>
        );
    }

    return <ResetPasswordForm token={token} />;
};

export default ResetPasswordPage;
