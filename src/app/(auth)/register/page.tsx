import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthRegisterForm } from "@/components/auth/AuthRegisterForm";
import { getPrivacyMode } from "@/lib/site-config";

export const metadata: Metadata = {
    title: "Create an account",
};

const RegisterPage = async () => {
    const mode = await getPrivacyMode();
    if (mode === "login-only") {
        notFound();
    }

    return <AuthRegisterForm />;
};

export default RegisterPage;
