import React, {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Edit3, Trash2, UserPlus} from 'lucide-react';
import {
  CORE_MEMBER_PERMISSIONS,
  PERMISSION_LABELS,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import type {ClubMembership} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, Modal} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const ClubTeamPage: React.FC = () => {
  const {user, activeClubId, activeMembership} = useAuth();
  const {toast, confirm} = useToast();
  const queryClient = useQueryClient();

  const canManageClubAdmins = Boolean(user?.isSuperAdmin);

  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'core_member' | 'club_admin'>('core_member');
  const [title, setTitle] = useState('Operations Coordinator');
  const [permissions, setPermissions] = useState<CoreMemberPermission[]>([
    'VIEW_REGISTRATIONS',
    'SCAN_ATTENDANCE',
  ]);

  const [editingMember, setEditingMember] = useState<ClubMembership | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const {data: team = [], isLoading} = useQuery({
    queryKey: ['club-team', activeClubId],
    queryFn: () => apiClient.getClubTeam(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  const invalidateTeamCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: ['club-team', activeClubId]}),
      queryClient.invalidateQueries({queryKey: ['club', activeClubId]}),
      queryClient.invalidateQueries({queryKey: ['admin-clubs']}),
    ]);
  };

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.upsertClubMember(activeClubId!, {
        email: email.trim(),
        role: canManageClubAdmins ? role : 'core_member',
        title: title.trim(),
        permissions:
          canManageClubAdmins && role === 'club_admin'
            ? [...CORE_MEMBER_PERMISSIONS]
            : permissions,
      }),
    onSuccess: async () => {
      setAddOpen(false);
      setAddError(null);
      setEmail('');
      setRole('core_member');
      await invalidateTeamCaches();
      toast.success('Team member added');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to add team member';
      setAddError(msg);
      toast.error('Could not add member', msg);
    },
  });

  const updatePermsMutation = useMutation({
    mutationFn: (vars: {
      member: ClubMembership;
      nextPerms?: CoreMemberPermission[];
      nextTitle?: string;
    }) =>
      apiClient.updateMemberPermissions(activeClubId!, vars.member.id, {
        permissions: vars.nextPerms,
        title: vars.nextTitle,
      }),
    onSuccess: async (_data, vars) => {
      if (vars.nextTitle !== undefined) {
        setEditingMember(null);
      }
      await invalidateTeamCaches();
      toast.success(vars.nextTitle !== undefined ? 'Officer title updated' : 'Permissions updated');
    },
    onError: (err) => {
      toast.error('Failed to update member', err instanceof Error ? err.message : undefined);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.removeClubMember(activeClubId!, membershipId),
    onSuccess: async () => {
      await invalidateTeamCaches();
      toast.info('Member removed from club team');
    },
    onError: (err) => {
      toast.error('Could not remove member', err instanceof Error ? err.message : undefined);
    },
  });

  const toggleNewPerm = (perm: CoreMemberPermission) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const toggleExistingPerm = (member: ClubMembership, perm: CoreMemberPermission) => {
    const nextPerms = member.permissions.includes(perm)
      ? member.permissions.filter((p) => p !== perm)
      : [...member.permissions, perm];
    updatePermsMutation.mutate({member, nextPerms});
  };

  const handleRemove = async (member: ClubMembership) => {
    const ok = await confirm({
      title: `Remove ${member.userName}?`,
      description: 'They will immediately lose scoped leadership permissions for this club.',
      confirmLabel: 'Remove Member',
      destructive: true,
    });
    if (ok) removeMutation.mutate(member.id);
  };

  const openAddModal = () => {
    setAddError(null);
    setRole('core_member');
    setAddOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Team &amp; Permission Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Delegate granular event, form, attendance, and reporting permissions to Core Members of{' '}
            {activeMembership?.clubName}.
          </p>
        </div>

        <Button onClick={openAddModal}>
          <UserPlus className="h-4 w-4" />
          Add Team Member
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          {team.map((member) => {
            const canModifyThisMember = member.role !== 'club_admin' || canManageClubAdmins;
            return (
              <Card key={member.id} className="p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-display text-base font-semibold text-slate-900">
                      {member.userName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {member.userEmail ? `${member.userEmail} · ` : ''}
                      {member.title} ·{' '}
                      <span className="font-medium text-violet-700 capitalize">
                        {member.role.replace('_', ' ')}
                      </span>
                    </p>
                  </div>

                  {canModifyThisMember && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingMember(member);
                          setEditingTitle(member.title);
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Title
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRemove(member)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-500">
                    {member.role === 'club_admin'
                      ? 'Club Admins hold full club-scoped permissions:'
                      : 'Assigned Core Member Permissions:'}
                  </p>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {CORE_MEMBER_PERMISSIONS.map((perm) => {
                      const checked = member.permissions.includes(perm);
                      return (
                        <label
                          key={perm}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                            checked
                              ? 'border-violet-200 bg-violet-50/50 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-600'
                          } ${member.role === 'club_admin' ? 'opacity-75' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            disabled={member.role === 'club_admin' || updatePermsMutation.isPending}
                            checked={checked}
                            onChange={() => toggleExistingPerm(member, perm)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-700"
                          />
                          <span>{PERMISSION_LABELS[perm]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Club Team Member"
        subtitle={
          canManageClubAdmins
            ? 'Assign Club Admin or Core Member permissions using an existing institutional email'
            : 'Assign Core Member permissions using an existing institutional email'
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddError(null);
            addMutation.mutate();
          }}
          className="space-y-4"
        >
          {addError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {addError}
            </div>
          )}

          <Input
            label="Institutional Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. student@vitbhopal.ac.in"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {canManageClubAdmins ? (
              <Select
                label="Club Role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'core_member' | 'club_admin')}
                options={[
                  {label: 'Core Member (Scoped)', value: 'core_member'},
                  {label: 'Club Admin (Full Club)', value: 'club_admin'},
                ]}
              />
            ) : (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">Club Role</span>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  Core Member (Scoped)
                </div>
                <p className="text-[11px] text-slate-500">
                  Only a Super Admin can assign Club Admins.
                </p>
              </div>
            )}
            <Input
              label="Officer Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {(!canManageClubAdmins || role === 'core_member') && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Select Delegated Permissions</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CORE_MEMBER_PERMISSIONS.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={permissions.includes(perm)}
                      onChange={() => toggleNewPerm(perm)}
                    />
                    <span>{PERMISSION_LABELS[perm]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={addMutation.isPending}>
              Add Member
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title="Update Officer Title"
        subtitle={editingMember ? `Updating role title for ${editingMember.userName}` : ''}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingMember || !editingTitle.trim()) return;
            updatePermsMutation.mutate({
              member: editingMember,
              nextTitle: editingTitle.trim(),
            });
          }}
          className="space-y-4"
        >
          <Input
            label="Officer Title"
            required
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updatePermsMutation.isPending}>
              Save Title
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
