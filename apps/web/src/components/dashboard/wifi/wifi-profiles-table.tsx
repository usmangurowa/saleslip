"use client";

import type { HotspotProfile } from "@/hooks/use-wifi-router";
import * as React from "react";
import {
  useCreateProfile,
  useDeleteProfile,
  useHotspotProfiles,
  useUpdateProfile,
} from "@/hooks/use-wifi-router";
import { Delete02Icon, PencilEdit01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@turbo/ui/components/alert";
import { Badge } from "@turbo/ui/components/badge";
import { Button } from "@turbo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@turbo/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@turbo/ui/components/field";
import { Icon } from "@turbo/ui/components/icon";
import { Input } from "@turbo/ui/components/input";
import { Skeleton } from "@turbo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@turbo/ui/components/table";
import { QueryError } from "@/components/dashboard/query-error";
import { TableCard } from "@/components/dashboard/table-card";

interface ProfileForm {
  name: string;
  rateLimit: string;
  sharedUsers: string;
  sessionTimeout: string;
}

/** Read a form row back into the editable fields; blank means "unset". */
const toForm = (profile?: HotspotProfile): ProfileForm => ({
  name: profile?.name ?? "",
  rateLimit: profile?.rateLimit ?? "",
  sharedUsers: profile?.sharedUsers?.toString() ?? "",
  sessionTimeout: profile?.sessionTimeout ?? "",
});

const ProfileDialog = ({
  profile,
  open,
  onOpenChange,
}: {
  profile?: HotspotProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const isEdit = profile !== undefined;
  const [form, setForm] = React.useState<ProfileForm>(() => toForm(profile));
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile();
  const pending = isEdit ? updateProfile : createProfile;

  React.useEffect(() => {
    if (open) setForm(toForm(profile));
  }, [open, profile]);

  const set =
    (key: keyof ProfileForm) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = () => {
    const input = {
      name: form.name.trim(),
      rateLimit: form.rateLimit.trim() || undefined,
      sharedUsers: form.sharedUsers ? Number(form.sharedUsers) : undefined,
      sessionTimeout: form.sessionTimeout.trim() || undefined,
    };
    const onError = (error: Error) => toast.error(error.message);
    const onSuccess = () => {
      onOpenChange(false);
      toast.success(isEdit ? "Profile updated" : "Profile created");
    };
    if (isEdit) {
      updateProfile.mutate({ id: profile.id, ...input }, { onSuccess, onError });
    } else {
      createProfile.mutate(input, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit profile" : "New profile"}</DialogTitle>
          <DialogDescription>
            Speed and session limits for hotspot codes minted against this
            profile.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              value={form.name}
              onChange={set("name")}
              placeholder="Saleslip-1d-1"
              disabled={pending.isPending}
            />
            <FieldDescription>
              Plans on the buy page reference this name; renaming can break
              minting.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-rate">Rate limit</FieldLabel>
            <Input
              id="profile-rate"
              value={form.rateLimit}
              onChange={set("rateLimit")}
              placeholder="5M/5M"
              disabled={pending.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-shared">Shared users</FieldLabel>
            <Input
              id="profile-shared"
              type="number"
              min={1}
              value={form.sharedUsers}
              onChange={set("sharedUsers")}
              placeholder="1"
              disabled={pending.isPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-timeout">Session timeout</FieldLabel>
            <Input
              id="profile-timeout"
              value={form.sessionTimeout}
              onChange={set("sessionTimeout")}
              placeholder="1d"
              disabled={pending.isPending}
            />
            <FieldDescription>
              RouterOS duration, e.g. `1d`, `12h`, `30m`. Blank means
              unlimited.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending.isPending}>
            {isEdit ? "Save changes" : "Create profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeleteDialog = ({
  profile,
  open,
  onOpenChange,
}: {
  profile: HotspotProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const deleteProfile = useDeleteProfile();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{profile.name}”?</DialogTitle>
          <DialogDescription>
            This removes the profile from the router permanently.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="destructive">
          <AlertTitle>Plans may reference this profile</AlertTitle>
          <AlertDescription>
            If a plan on the buy page mints against “{profile.name}”, voucher
            generation will fail until the plan points at another profile.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteProfile.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteProfile.isPending}
            onClick={() =>
              deleteProfile.mutate(profile.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  toast.success("Profile deleted");
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            <Icon icon={Delete02Icon} />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The hotspot user profiles codes are minted against, managed here so plans
 * stay in sync with what the router actually offers.
 */
export const WifiProfilesTable = () => {
  const { data, isPending, isError, error, refetch } = useHotspotProfiles();
  const [editing, setEditing] = React.useState<HotspotProfile | undefined>();
  const [deleting, setDeleting] = React.useState<HotspotProfile | undefined>();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  if (isError) {
    return (
      <TableCard title="Hotspot profiles" padding="sm">
        <QueryError
          title="Could not load profiles"
          showSignIn
          framed={false}
          onRetry={() => void refetch()}
        />
      </TableCard>
    );
  }

  const profiles = data?.profiles ?? [];

  return (
    <TableCard
      title="Hotspot profiles"
      description="Speed plans configured on the router. Vouchers are minted against these."
      action={
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          <Icon icon={PlusSignIcon} />
          New profile
        </Button>
      }
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Rate limit</TableHead>
            <TableHead>Shared users</TableHead>
            <TableHead>Session timeout</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            Array.from({ length: 3 }, (_, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : profiles.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="h-24 text-center">
                <span className="text-muted-foreground text-sm">
                  No profiles configured on the router.
                </span>
              </TableCell>
            </TableRow>
          ) : (
            profiles.map((profile) => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">{profile.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {profile.rateLimit ?? (
                    <Badge variant="secondary">Unlimited</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {profile.sharedUsers ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {profile.sessionTimeout ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <span className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(profile);
                        setDialogOpen(true);
                      }}
                    >
                      <Icon icon={PencilEdit01Icon} />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleting(profile)}
                    >
                      <Icon icon={Delete02Icon} />
                      Delete
                    </Button>
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ProfileDialog
        profile={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      {deleting ? (
        <DeleteDialog
          profile={deleting}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleting(undefined);
          }}
        />
      ) : null}
    </TableCard>
  );
};
