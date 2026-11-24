import React, {useState} from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Building2, Edit3, Plus, Search, Trash2, Users} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {useSearchParams} from 'react-router-dom';
import {z} from 'zod';
import {
  CLUB_CATEGORIES,
  CORE_MEMBER_PERMISSIONS,
  PERMISSION_LABELS,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import {createClubSchema, updateClubSchema} from '../../../shared/schemas/validation.ts';
import type {Club, ClubMembership, ClubStatus} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {ClubLogo, LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type CreateClubValues = z.infer<typeof createClubSchema>;
type EditClubValues = z.infer<typeof updateClubSchema>;

export const AdminClubsPage: React.FC = () => {
  const {toast, confirm} = useToast();
  const {refreshSession} = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [managingClub, setManagingClub] = useState<Club | null>(null);

  const [leaderEmail, setLeaderEmail] = useState('');
  const [leaderRole, setLeaderRole] = useState<'club_admin' | 'core_member'>('club_admin');
  const [leaderTitle, setLeaderTitle] = useState('Club President');
  const [leaderPerms, setLeaderPerms] = useState<CoreMemberPermission[]>([
    'MANAGE_EVENTS',
    'VIEW_REGISTRATIONS',
    'SCAN_ATTENDANCE',
  ]);
  const [leaderError, setLeaderError] = useState<string | null>(null);

  const {data: clubs = [], isLoading} = useQuery({
    queryKey: ['admin-clubs'],
    queryFn: () => apiClient.listAdminClubs(),
  });

  const {data: managingTeam = [], isLoading: teamLoading} = useQuery({
    queryKey: ['club-team', managingClub?.id],
    queryFn: () => apiClient.getClubTeam(managingClub!.id),
    enabled: Boolean(managingClub?.id),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<CreateClubValues>({
    resolver: zodResolver(createClubSchema),
    defaultValues: {category: 'Technology'},
  });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    formState: {errors: editErrors, isSubmitting: isEditSubmitting},
  } = useForm<EditClubValues>({
    resolver: zodResolver(updateClubSchema),
    values: editingClub
      ? {
          name: editingClub.name,
          category: editingClub.category,
          tagline: editingClub.tagline,
          description: editingClub.description,
          meetingSchedule: editingClub.meetingSchedule,
          contactEmail: editingClub.contactEmail,
        }
      : undefined,
  });

  const invalidateClubCaches = async (clubId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: ['admin-clubs']}),
      queryClient.invalidateQueries({queryKey: ['admin-dashboard']}),
      queryClient.invalidateQueries({queryKey: ['admin-audit-logs']}),
      queryClient.invalidateQueries({queryKey: ['clubs']}),
      queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
      ...(clubId
        ? [
            queryClient.invalidateQueries({queryKey: ['club', clubId]}),
            queryClient.invalidateQueries({queryKey: ['club-team', clubId]}),
          ]
        : []),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (vals: CreateClubValues) => apiClient.createClub(vals),
    onSuccess: async (club) => {
      setCreateOpen(false);
      reset();
      await invalidateClubCaches(club.id);
      toast.success('Club charter registered');
    },
    onError: (err) => {
      toast.error('Failed to register club', err instanceof Error ? err.message : undefined);
    },
  });

  const editMutation = useMutation({
    mutationFn: (vars: {clubId: string; values: EditClubValues}) =>
      apiClient.updateClub(vars.clubId, vars.values),
    onSuccess: async (updated) => {
      setEditingClub(null);
      await invalidateClubCaches(updated.id);
      toast.success(`Updated ${updated.name}`);
    },
    onError: (err) => {
      toast.error('Failed to update club', err instanceof Error ? err.message : undefined);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: {clubId: string; status: ClubStatus}) =>
      apiClient.updateClubStatus(vars.clubId, vars.status),
    onSuccess: async (updated) => {
      await invalidateClubCaches(updated.id);
      toast.success(`${updated.name} status set to ${updated.status}`);
    },
    onError: (err) => {
      toast.error('Status change failed', err instanceof Error ? err.message : undefined);
    },
  });

  const assignMemberMutation = useMutation({
    mutationFn: () =>
      apiClient.upsertClubMember(managingClub!.id, {
        email: leaderEmail.trim(),
        role: leaderRole,
        title: leaderTitle.trim(),
        permissions: leaderRole === 'club_admin' ? [...CORE_MEMBER_PERMISSIONS] : leaderPerms,
      }),
    onSuccess: async () => {
      setLeaderError(null);
      setLeaderEmail('');
      await Promise.all([refreshSession(), invalidateClubCaches(managingClub!.id)]);
      toast.success('Leadership member assigned');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to assign member';
      setLeaderError(msg);
      toast.error('Assignment failed', msg);
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: (vars: {member: ClubMembership; nextRole: 'club_admin' | 'core_member'}) =>
      apiClient.updateMemberPermissions(managingClub!.id, vars.member.id, {
        role: vars.nextRole,
        permissions:
          vars.nextRole === 'club_admin' ? [...CORE_MEMBER_PERMISSIONS] : vars.member.permissions,
      }),
    onSuccess: async () => {
      await Promise.all([refreshSession(), invalidateClubCaches(managingClub!.id)]);
      toast.success('Membership role updated');
    },
    onError: (err) => {
      toast.error('Role update failed', err instanceof Error ? err.message : undefined);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) =>
      apiClient.removeClubMember(managingClub!.id, membershipId),
    onSuccess: async () => {
      await Promise.all([refreshSession(), invalidateClubCaches(managingClub!.id)]);
      toast.info('Removed member from club leadership');
    },
    onError: (err) => {
      toast.error('Failed to remove member', err instanceof Error ? err.message : undefined);
    },
  });

  const handleStatusChange = async (club: Club, nextStatus: ClubStatus) => {
    const descriptions: Record<ClubStatus, string> = {
      active:
        'Activating this club makes it visible to all students for following, Hall of Fame ranking, and event registration.',
      inactive:
        'Deactivating this club hides it from student discovery and Hall of Fame while preserving existing history.',
      suspended:
        'Suspended clubs are hidden from student discovery and cannot publish new events or receive follows.',
      pending_review: 'Move club back into Student Affairs charter review queue.',
    };
    const confirmLabels: Record<ClubStatus, string> = {
      active: 'Approve & Activate',
      inactive: 'Deactivate Club',
      suspended: 'Suspend Club',
      pending_review: 'Move to Review',
    };
    const ok = await confirm({
      title: `Set ${club.name} to ${nextStatus.replace('_', ' ')}?`,
      description: descriptions[nextStatus],
      confirmLabel: confirmLabels[nextStatus],
      destructive: nextStatus === 'suspended' || nextStatus === 'inactive',
    });
    if (ok) statusMutation.mutate({clubId: club.id, status: nextStatus});
  };

  const filtered = clubs.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Club Directory &amp; Charter Administration
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Register clubs, edit details, manage leadership assignments, and control active/inactive/suspended status.
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Charter New Club
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clubs..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-6 py-3">Club</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3 text-right">Followers</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((club) => (
                  <tr key={club.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <ClubLogo name={club.name} logoUrl={club.logoUrl} size="sm" />
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedClub(club)}
                            className="font-semibold text-slate-900 hover:text-violet-700 text-left"
                          >
                            {club.name}
                          </button>
                          <p className="text-xs text-slate-500">{club.contactEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-600">{club.category}</td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {club.followerCount}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusLabel status={club.status} />
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingClub(club)}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setLeaderError(null);
                            setManagingClub(club);
                          }}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Leadership
                        </Button>
                        {club.status !== 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'active')}
                          >
                            Activate
                          </Button>
                        )}
                        {club.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'inactive')}
                          >
                            Deactivate
                          </Button>
                        )}
                        {club.status !== 'suspended' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'suspended')}
                          >
                            Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(selectedClub)}
        onClose={() => setSelectedClub(null)}
        title={selectedClub?.name || 'Club Details'}
        subtitle={selectedClub ? `${selectedClub.category} · Founded ${selectedClub.foundedYear}` : ''}
      >
        {selectedClub && (
          <div className="space-y-3 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{selectedClub.tagline}</p>
            <p className="leading-relaxed">{selectedClub.description}</p>
            <p className="text-xs text-slate-500">
              Schedule: {selectedClub.meetingSchedule} · Contact: {selectedClub.contactEmail}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editingClub)}
        onClose={() => setEditingClub(null)}
        title={`Edit ${editingClub?.name || 'Club'}`}
        subtitle="Update official club profile metadata and contact channels"
      >
        {editingClub && (
          <form
            onSubmit={handleEditSubmit((vals) =>
              editMutation.mutate({clubId: editingClub.id, values: vals}),
            )}
            className="space-y-4"
          >
            <Input label="Club Name" error={editErrors.name?.message} {...registerEdit('name')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Category"
                error={editErrors.category?.message}
                options={CLUB_CATEGORIES.map((c) => ({label: c, value: c}))}
                {...registerEdit('category')}
              />
              <Input
                label="Contact Email"
                type="email"
                error={editErrors.contactEmail?.message}
                {...registerEdit('contactEmail')}
              />
            </div>
            <Input
              label="Tagline"
              error={editErrors.tagline?.message}
              {...registerEdit('tagline')}
            />
            <Textarea
              label="Charter Description"
              rows={3}
              error={editErrors.description?.message}
              {...registerEdit('description')}
            />
            <Input
              label="Meeting Schedule"
              error={editErrors.meetingSchedule?.message}
              {...registerEdit('meetingSchedule')}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingClub(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={isEditSubmitting || editMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(managingClub)}
        onClose={() => setManagingClub(null)}
        title={`Club Leadership · ${managingClub?.name || ''}`}
        subtitle="Assign Club Admins or Core Members and manage leadership transitions"
        maxWidth="max-w-2xl"
      >
        {managingClub && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLeaderError(null);
                assignMemberMutation.mutate();
              }}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <p className="text-xs font-semibold text-slate-900">Assign Club Leader / Member</p>
              {leaderError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                >
                  {leaderError}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="User Email"
                  type="email"
                  required
                  value={leaderEmail}
                  onChange={(e) => setLeaderEmail(e.target.value)}
                  placeholder="leader@vitbhopal.ac.in"
                />
                <Select
                  label="Role"
                  value={leaderRole}
                  onChange={(e) => setLeaderRole(e.target.value as 'club_admin' | 'core_member')}
                  options={[
                    {label: 'Club Admin', value: 'club_admin'},
                    {label: 'Core Member', value: 'core_member'},
                  ]}
                />
                <Input
                  label="Title"
                  required
                  value={leaderTitle}
                  onChange={(e) => setLeaderTitle(e.target.value)}
                />
              </div>

              {leaderRole === 'core_member' && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {CORE_MEMBER_PERMISSIONS.map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={leaderPerms.includes(perm)}
                        onChange={() =>
                          setLeaderPerms((prev) =>
                            prev.includes(perm)
                              ? prev.filter((p) => p !== perm)
                              : [...prev, perm],
                          )
                        }
                      />
                      <span>{PERMISSION_LABELS[perm]}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" size="sm" loading={assignMemberMutation.isPending}>
                  Assign to {managingClub.name}
                </Button>
              </div>
            </form>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current Leadership Team ({managingTeam.length})
              </h3>
              {teamLoading ? (
                <LoadingSkeleton rows={2} />
              ) : managingTeam.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No leadership members assigned yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {managingTeam.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{member.userName}</p>
                        <p className="text-xs text-slate-500">
                          {member.userEmail} · {member.title} ·{' '}
                          <span className="font-medium text-violet-700 capitalize">
                            {member.role.replace('_', ' ')}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={updateMemberRoleMutation.isPending}
                          onClick={() =>
                            updateMemberRoleMutation.mutate({
                              member,
                              nextRole:
                                member.role === 'club_admin' ? 'core_member' : 'club_admin',
                            })
                          }
                        >
                          {member.role === 'club_admin'
                            ? 'Demote to Core'
                            : 'Promote to Admin'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={removeMemberMutation.isPending}
                          onClick={() => removeMemberMutation.mutate(member.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Charter New Campus Club"
        subtitle="Create a new club record under institutional oversight"
      >
        <form
          onSubmit={handleSubmit((vals) => createMutation.mutate(vals))}
          className="space-y-4"
        >
          <Input label="Club Name" error={errors.name?.message} {...register('name')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              error={errors.category?.message}
              options={CLUB_CATEGORIES.map((c) => ({label: c, value: c}))}
              {...register('category')}
            />
            <Input
              label="Contact Email"
              type="email"
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
          </div>
          <Input label="Tagline" error={errors.tagline?.message} {...register('tagline')} />
          <Textarea
            label="Charter Description"
            rows={3}
            error={errors.description?.message}
            {...register('description')}
          />
          <Input
            label="Meeting Schedule"
            error={errors.meetingSchedule?.message}
            {...register('meetingSchedule')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>
              <Building2 className="h-4 w-4" />
              Create Club
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
