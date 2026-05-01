import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthLoginForm } from "@/components/auth/AuthLoginForm";

export const metadata: Metadata = {
    title: "Sign in",
};

const LoginPage = () => {
    return (
        <Suspense>
            <AuthLoginForm />
        </Suspense>
    );
};

export default LoginPage;
