"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";

import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_BODY = 5000;

interface CommentComposerProps {
    /** Placeholder text shown when the textarea is empty. */
    placeholder?: string;
    /** Called when the user submits a comment. Receives the trimmed body. */
    onSubmit: (body: string) => Promise<void> | void;
    /** Called when the user cancels (only shown when cancelable is true). */
    onCancel?: () => void;
    /** Whether to show the Cancel button. Defaults to true. */
    cancelable?: boolean;
    /** Initial value for the textarea (e.g. pre-fill when editing). */
    initialValue?: string;
    /** Whether the form is busy submitting. */
    isPending?: boolean;
    /** Label for the submit button. */
    submitLabel?: string;
    /**
     * Currently signed-in user, used to render the avatar to the left of the
     * composer. Omit (or pass null) to render the textarea full-width without
     * an avatar — useful for inline reply editors where the row is already
     * indented under the parent's avatar.
     */
    me?: { name?: string | null; image?: string | null; email?: string | null } | null;
    className?: string;
}

export const CommentComposer = ({
    placeholder,
    onSubmit,
    onCancel,
    cancelable = true,
    initialValue = "",
    isPending = false,
    submitLabel,
    me = null,
    className,
}: CommentComposerProps) => {
    const t = useTranslations("comments");
    const tActions = useTranslations("actions");
    const resolvedPlaceholder = placeholder ?? t("addComment");
    const resolvedSubmitLabel = submitLabel ?? t("comment");
    const [body, setBody] = useState(initialValue);
    const [focused, setFocused] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const trimmed = body.trim();
    const charCount = body.length;
    const overLimit = charCount > MAX_BODY;
    const canSubmit = trimmed.length > 0 && !overLimit && !submitting && !isPending;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await onSubmit(trimmed);
            setBody("");
            setFocused(false);
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = () => {
        setBody("");
        setFocused(false);
        onCancel?.();
    };

    const busy = submitting || isPending;

    const textareaBlock = (
        <div className="relative flex-1">
            <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setFocused(true)}
                placeholder={resolvedPlaceholder}
                rows={focused ? 4 : 1}
                disabled={busy}
                className={cn(
                    "resize-none text-sm transition-all",
                    overLimit && "border-destructive focus-visible:ring-destructive",
                )}
                aria-label="Comment text"
            />
            {focused && (
                <span
                    className={cn(
                        "absolute bottom-2 right-3 select-none text-xs text-muted-foreground",
                        overLimit && "text-destructive",
                    )}
                >
                    {charCount}/{MAX_BODY}
                </span>
            )}
        </div>
    );

    return (
        <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2", className)}>
            {/* Avatar + textarea row. The avatar aligns with the first line of
                text via the parent's items-start; padding-top on the avatar
                wrapper visually centres a 36 px circle against the textarea's
                first row of text. */}
            {me ? (
                <div className="flex items-start gap-3">
                    <div className="shrink-0 pt-1">
                        <UserAvatar user={me} size={36} />
                    </div>
                    {textareaBlock}
                </div>
            ) : (
                textareaBlock
            )}

            {focused && (
                <div className="flex items-center justify-end gap-2">
                    {cancelable && (
                        <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
                            {tActions("cancel")}
                        </Button>
                    )}
                    <Button type="submit" size="sm" disabled={!canSubmit}>
                        {busy ? t("posting") : resolvedSubmitLabel}
                    </Button>
                </div>
            )}
        </form>
    );
};
