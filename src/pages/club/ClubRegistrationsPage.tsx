import React, {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {CheckCircle2, Clock, Download, Search, Ticket} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {PaginationBar} from '../../components/ui/PaginationBar.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';
import {useDebouncedValue} from '../../hooks/useDebouncedValue.ts';
import {triggerBlobDownload} from '../../lib/download.ts';

export const ClubRegistrationsPage: React.FC = () => {
  const {activeClubId} = useAuth();
  const {toast} = useToast();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 250);

  const {data: events = []} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    setPage(1);
  }, [selectedEventId, debouncedSearch, statusFilter]);

  const {data: regPage, isLoading} = useQuery({
    queryKey: ['event-registrations', selectedEventId, page, debouncedSearch, statusFilter],
    queryFn: () =>
      apiClient.listEventRegistrationsPaginated(selectedEventId, {
        page,
        pageSize: 25,
        search: debouncedSearch,
        status: statusFilter,
      }),
    enabled: Boolean(selectedEventId),
  });

  const registrations = regPage?.items || [];

  const handleExportCsv = async () => {
    if (!selectedEventId) return;
    setExporting(true);
    try {
      const {blob, filename} = await apiClient.downloadEventCsv(selectedEventId, 'registrations');
      triggerBlobDownload(blob, filename);
      toast.success('Registrations CSV exported', filename);
    } catch (err) {
      toast.error(
        'Export failed',
        err instanceof Error ? err.message : 'Unable to export registrations CSV',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Participant Directory &amp; Registrations
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect confirmed participants, FIFO waitlist positions, attendance status, and export
            sanitized CSV rosters.
          </p>
        </div>

        <Button
          variant="outline"
          loading={exporting}
          disabled={!selectedEventId || (regPage?.pagination.total ?? 0) === 0}
          onClick={() => void handleExportCsv()}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <select
            aria-label="Select event"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.registeredCount}/{ev.capacity}
                {ev.waitlistedCount ? ` · +${ev.waitlistedCount} waitlist` : ''})
              </option>
            ))}
          </select>
        </div>
        <div className="relative md:col-span-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, email, or QR token..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900"
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter by registration status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="attended">Attended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title="No participants found"
          description="Published events will list confirmed and waitlisted students here once registrations arrive."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-6 py-3">Participant</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">QR Token</th>
                  <th className="px-6 py-3">Registration</th>
                  <th className="px-6 py-3">Attendance</th>
                  <th className="px-6 py-3">Form</th>
                  <th className="px-6 py-3 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map((reg) => {
                  const checkedIn =
                    Boolean(reg.qrUsedAt) ||
                    reg.attendanceStatus === 'present' ||
                    reg.status === 'attended';
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 font-medium text-slate-900">{reg.studentName}</td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">{reg.studentEmail}</td>
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-700">{reg.qrToken}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <StatusLabel status={reg.status} />
                          {reg.status === 'waitlisted' && reg.waitlistPosition ? (
                            <span className="font-mono text-xs text-amber-800">
                              #{reg.waitlistPosition}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        {checkedIn ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Checked In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
                            <Clock className="h-3.5 w-3.5" />
                            Not Checked In
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-500">
                        v{reg.formVersion ?? 1}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                        {new Date(reg.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={regPage?.pagination} onPageChange={setPage} />
        </Card>
      )}
    </div>
  );
};
