"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Plus, Power, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSub, MenuSubPopup, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCan, useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import { toast } from "@/lib/toast";
import { SettingsSection } from "./settings-ui";

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  lastLoginAt: string | null;
  role: { id: string; key: string; name: string };
}
interface Role {
  id: string;
  key: string;
  name: string;
  permissions: string[];
  _count: { users: number };
}

const PERMISSION_LABEL: Record<string, string> = {
  "*": "Everything",
  "documents:read": "View documents",
  "documents:write": "Create and edit documents",
  "documents:send": "Send documents",
  "customers:read": "View customers",
  "customers:write": "Edit customers and follow-ups",
  "inventory:read": "View inventory",
  "inventory:write": "Edit products and stock",
  "payments:write": "Record payments",
  "reports:read": "View reports",
  "settings:write": "Change settings",
  "users:manage": "Manage users",
};

export function UsersSection() {
  const qc = useQueryClient();
  const canManage = useCan("users:manage");
  const { data: me } = useMe();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/users/roles") });
  const [addOpen, setAddOpen] = useState(false);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; roleId?: string; active?: boolean; password?: string }) => api.patch(`/users/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success("User updated");
      setResetFor(null);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <div className="grid gap-4">
      <SettingsSection
        title="Team"
        description="Everyone who can sign in. Activity in the app is recorded against each person."
        footer={
          canManage ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus /> Add person
            </Button>
          ) : undefined
        }
      >
        {users.isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="-mx-5 -my-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Person</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Last sign-in</TableHead>
                  <TableHead className="w-10 pr-5">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.map((u) => (
                  <TableRow key={u.id} className={u.active ? undefined : "opacity-60"}>
                    <TableCell className="pl-5">
                      <div className="font-medium">
                        {u.name} {u.id === me?.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role.key === "owner" ? "success" : "outline"}>{u.role.name}</Badge>
                      {!u.active && (
                        <Badge variant="secondary" className="ml-1">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{u.lastLoginAt ? fmtRelative(u.lastLoginAt) : "Never"}</TableCell>
                    <TableCell className="pr-5">
                      {canManage && (
                        <Menu>
                          <MenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label={`Actions for ${u.name}`} />}>
                            <MoreHorizontal />
                          </MenuTrigger>
                          <MenuPopup align="end" className="w-52">
                            <MenuSub>
                              <MenuSubTrigger disabled={u.id === me?.id}>
                                <ShieldCheck /> Change role
                              </MenuSubTrigger>
                              <MenuSubPopup>
                                {roles.data?.map((r) => (
                                  <MenuItem key={r.id} disabled={r.id === u.role.id} onClick={() => update.mutate({ id: u.id, roleId: r.id })}>
                                    {r.name}
                                  </MenuItem>
                                ))}
                              </MenuSubPopup>
                            </MenuSub>
                            <MenuItem onClick={() => setResetFor(u)}>
                              <KeyRound /> Set new password
                            </MenuItem>
                            <MenuItem disabled={u.id === me?.id} onClick={() => update.mutate({ id: u.id, active: !u.active })}>
                              <Power /> {u.active ? "Deactivate" : "Reactivate"}
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Roles" description="What each role can do. Permissions are enforced by the server on every request.">
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.data?.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r._count.users} {r._count.users === 1 ? "person" : "people"}
                </span>
              </div>
              <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                {r.permissions.map((p) => (
                  <li key={p}>{PERMISSION_LABEL[p] ?? p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SettingsSection>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} roles={roles.data ?? []} />
      <PasswordDialog user={resetFor} onClose={() => setResetFor(null)} onSave={(password) => resetFor && update.mutate({ id: resetFor.id, password })} saving={update.isPending} />
    </div>
  );
}

function AddUserDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (v: boolean) => void; roles: Role[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState("");
  const create = useMutation({
    mutationFn: () => api.post("/users", { name, email, roleId, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
      toast.success(`${name} can now sign in`, "Share the password with them securely.");
      onOpenChange(false);
      setName("");
      setEmail("");
      setPassword("");
    },
    onError: (e) => toast.error(e),
  });
  const role = roleId || roles.find((r) => r.key === "sales")?.id || roles[0]?.id || "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
          <DialogDescription>They sign in with this email and password.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Role
            <Select value={role} onValueChange={(v) => setRoleId(v as string)}>
              <SelectTrigger>
                <SelectValue>{(v: string) => roles.find((r) => r.id === v)?.name ?? ""}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Password
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="text-xs font-normal text-muted-foreground">At least 10 characters.</span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled={!name.trim() || !email.includes("@") || password.length < 10 || !role} loading={create.isPending} onClick={() => create.mutate()}>
            Add person
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onSave, saving }: { user: UserRow | null; onClose: () => void; onSave: (p: string) => void; saving: boolean }) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && (onClose(), setPassword(""))}>
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New password for {user?.name}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New password" autoFocus />
          <p className="mt-1.5 text-xs text-muted-foreground">At least 10 characters.</p>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled={password.length < 10} loading={saving} onClick={() => onSave(password)}>
            Set password
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
