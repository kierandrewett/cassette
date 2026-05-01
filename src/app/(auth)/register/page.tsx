import type { Metadata } from "next";

import { AuthRegisterForm } from "@/components/auth/AuthRegisterForm";

export const metadata: Metadata = {
    title: "Create an account",
};

const RegisterPage = () => {
    return <AuthRegisterForm />;
};

export default RegisterPage;
