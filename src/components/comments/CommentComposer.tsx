"use client";

import { useState } from "react";

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
    className?: string;
}

export const CommentComposer = ({
    placeholder = "Add a comment…",
    onSubmit,
    onCancel,
    cancelable = true,
    initialValue = "",
    isPending = false,
    submitLabel = "Comment",
    className,
}: CommentComposerProps) => {
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

    return (
        <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2", className)}>
            <div className="relative">
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onFocus={() => setFocused(true)}
                    placeholder={placeholder}
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
                            "absolute bottom-2 right-3 text-xs text-muted-foreground select-none",
                            overLimit && "text-destructive",
                        )}
                    >
                        {charCount}/{MAX_BODY}
                    </span>
                )}
            </div>

            {focused && (
                <div className="flex items-center justify-end gap-2">
                    {cancelable && (
                        <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" size="sm" disabled={!canSubmit}>
                        {busy ? "Posting…" : submitLabel}
                    </Button>
                </div>
            )}
        </form>
    );
};
