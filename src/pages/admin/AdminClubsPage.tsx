import React, {useState} from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Building2, Plus, Search} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {useSearchParams} from 'react-router-dom';
import {z} from 'zod';
import {CLUB_CATEGORIES} from '../../../shared/constants/permissions.ts';
import {createClubSchema} from '../../../shared/schemas/validation.ts';
import type {Club, ClubStatus} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {ClubLogo, LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type CreateClubValues = z.infer<typeof createClubSchema>;

export const AdminClubsPage: React.FC = () => {
  const {toast, confirm} = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);

  const {data: clubs = [], isLoading} = useQuery({
    queryKey: ['admin-clubs'],
    queryFn: () => apiClient.listAdminClubs(),
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

  const createMutation = useMutation({
    mutationFn: (vals: CreateClubValues) => apiClient.createClub(vals),
    onSuccess: async () => {
      setCreateOpen(false);
      reset();
      await queryClient.invalidateQueries({queryKey: ['admin-clubs']});
      await queryClient.invalidateQueries({queryKey: ['admin-dashboard']});
      toast.success('Club charter registered');
    },
    onError: (err) => {
      toast.error('Failed to register club', err instanceof Error ? err.message : undefined);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: {clubId: string; status: ClubStatus}) =>
      apiClient.updateClubStatus(vars.clubId, vars.status),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({queryKey: ['admin-clubs']});
      await queryClient.invalidateQueries({queryKey: ['admin-dashboard']});
      await queryClient.invalidateQueries({queryKey: ['clubs']});
      toast.success(`${updated.name} status set to ${updated.status}`);
    },
    onError: (err) => {
      toast.error('Status change failed', err instanceof Error ? err.message : undefined);
    },
  });

  const handleStatusChange = async (club: Club, nextStatus: ClubStatus) => {
    const ok = await confirm({
      title: `Set ${club.name} to ${nextStatus.replace('_', ' ')}?`,
      description:
        nextStatus === 'suspended'
          ? 'Suspended clubs are hidden from student discovery and cannot publish new events.'
          : 'Activating this club makes it visible to all students for following and event registration.',
      confirmLabel: nextStatus === 'suspended' ? 'Suspend Club' : 'Approve & Activate',
      destructive: nextStatus === 'suspended',
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
            Approve pending club charters, inspect operations, or suspend non-compliant clubs.
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
                      <div className="inline-flex items-center gap-2">
                        {club.status !== 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'active')}
                          >
                            Activate
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
