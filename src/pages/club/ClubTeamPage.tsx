import React, {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Trash2, UserPlus} from 'lucide-react';
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
  const {activeClubId, activeMembership} = useAuth();
  const {toast, confirm} = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'core_member' | 'club_admin'>('core_member');
  const [title, setTitle] = useState('Operations Coordinator');
  const [permissions, setPermissions] = useState<CoreMemberPermission[]>([
    'VIEW_REGISTRATIONS',
    'SCAN_ATTENDANCE',
  ]);

  const {data: team = [], isLoading} = useQuery({
    queryKey: ['club-team', activeClubId],
    queryFn: () => apiClient.getClubTeam(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      apiClient.upsertClubMember(activeClubId!, {
        email,
        role,
        title,
        permissions: role === 'club_admin' ? [...CORE_MEMBER_PERMISSIONS] : permissions,
      }),
    onSuccess: async () => {
      setAddOpen(false);
      setEmail('');
      await queryClient.invalidateQueries({queryKey: ['club-team', activeClubId]});
      toast.success('Team member added');
    },
    onError: (err) => {
      toast.error('Could not add member', err instanceof Error ? err.message : undefined);
    },
  });

  const updatePermsMutation = useMutation({
    mutationFn: (vars: {member: ClubMembership; nextPerms: CoreMemberPermission[]}) =>
      apiClient.updateMemberPermissions(activeClubId!, vars.member.id, {
        permissions: vars.nextPerms,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['club-team', activeClubId]});
      toast.success('Permissions updated');
    },
    onError: (err) => {
      toast.error('Failed to update permissions', err instanceof Error ? err.message : undefined);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.removeClubMember(activeClubId!, membershipId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['club-team', activeClubId]});
      toast.info('Member removed from club team');
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

        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="h-4 w-4" />
          Add Team Member
        </Button>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          {team.map((member) => (
            <Card key={member.id} className="p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="font-display text-base font-semibold text-slate-900">
                    {member.userName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {member.userEmail} · {member.title} ·{' '}
                    <span className="font-medium text-violet-700 capitalize">
                      {member.role.replace('_', ' ')}
                    </span>
                  </p>
                </div>

                {member.role !== 'club_admin' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRemove(member)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    Remove
                  </Button>
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
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Club Team Member"
        subtitle="Assign Club Admin or Core Member permissions using an existing institutional email"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
          className="space-y-4"
        >
          <Input
            label="Institutional Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. aarav.mehta@campusverse.edu"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Club Role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'core_member' | 'club_admin')}
              options={[
                {label: 'Core Member (Scoped)', value: 'core_member'},
                {label: 'Club Admin (Full Club)', value: 'club_admin'},
              ]}
            />
            <Input
              label="Officer Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {role === 'core_member' && (
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
    </div>
  );
};
