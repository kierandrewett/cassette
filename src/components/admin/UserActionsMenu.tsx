"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface UserActionsMenuProps {
    userId: string;
    userName: string;
    isAdmin: boolean;
}

type Pending = "promote" | "demote" | "signout" | "delete" | null;

export const UserActionsMenu = ({ userId, userName, isAdmin }: UserActionsMenuProps) => {
    const router = useRouter();
    const [pending, setPending] = useState<Pending>(null);

    const promote = api.admin.users.promote.useMutation({
        onSuccess: () => { setPending(null); router.refresh(); },
    });
    const demote = api.admin.users.demote.useMutation({
        onSuccess: () => { setPending(null); router.refresh(); },
    });
    const signOutAll = api.admin.users.signOutAll.useMutation({
        onSuccess: () => { setPending(null); router.refresh(); },
    });
    const deleteUser = api.admin.users.delete.useMutation({
        onSuccess: () => { setPending(null); router.refresh(); },
    });

    const busy = promote.isPending || demote.isPending || signOutAll.isPending || deleteUser.isPending;

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">User actions</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <a href={`/admin/users/${userId}`}>View detail</a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isAdmin ? (
                        <DropdownMenuItem onSelect={() => setPending("demote")}>
                            Demote from admin
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem onSelect={() => setPending("promote")}>
                            Promote to admin
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setPending("signout")}>
                        Sign out all sessions
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setPending("delete")}
                    >
                        Delete user
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Promote confirm */}
            <Dialog open={pending === "promote"} onOpenChange={(o) => !o && setPending(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Promote to admin?</DialogTitle>
                        <DialogDescription>
                            {userName} will gain full admin access to the control panel.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
                        <Button disabled={busy} onClick={() => promote.mutate({ userId })}>Promote</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Demote confirm */}
            <Dialog open={pending === "demote"} onOpenChange={(o) => !o && setPending(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove admin access?</DialogTitle>
                        <DialogDescription>
                            {userName} will lose admin access immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={busy} onClick={() => demote.mutate({ userId })}>
                            Demote
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Sign out confirm */}
            <Dialog open={pending === "signout"} onOpenChange={(o) => !o && setPending(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Sign out all sessions?</DialogTitle>
                        <DialogDescription>
                            All active sessions for {userName} will be invalidated.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={busy} onClick={() => signOutAll.mutate({ userId })}>
                            Sign out all
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete confirm */}
            <Dialog open={pending === "delete"} onOpenChange={(o) => !o && setPending(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete user?</DialogTitle>
                        <DialogDescription>
                            This will permanently delete {userName} and all associated data. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
                        <Button variant="destructive" disabled={busy} onClick={() => deleteUser.mutate({ userId })}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
