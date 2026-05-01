import type { Metadata } from "next";

import { AuthLoginForm } from "@/components/auth/AuthLoginForm";

export const metadata: Metadata = {
    title: "Sign in",
};

const LoginPage = () => {
    return <AuthLoginForm />;
};

export default LoginPage;
