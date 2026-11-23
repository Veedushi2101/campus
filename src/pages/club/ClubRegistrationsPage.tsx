import React, {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Download, Search, Ticket} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

export const ClubRegistrationsPage: React.FC = () => {
  const {activeClubId} = useAuth();
  const [selectedEventId, setSelectedEventId] = useState('');
  const [search, setSearch] = useState('');

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

  const {data: registrations = [], isLoading} = useQuery({
    queryKey: ['event-registrations', selectedEventId],
    queryFn: () => apiClient.listEventRegistrations(selectedEventId),
    enabled: Boolean(selectedEventId),
  });

  const filtered = registrations.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.studentName.toLowerCase().includes(q) ||
      r.studentEmail.toLowerCase().includes(q) ||
      r.qrToken.toLowerCase().includes(q)
    );
  });

  const handleExportCsv = () => {
    const header = ['Student Name', 'Email', 'QR Token', 'Status', 'Registered At'];
    const rows = filtered.map((r) => [
      r.studentName,
      r.studentEmail,
      r.qrToken,
      r.status,
      r.createdAt,
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registrations-${selectedEventId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Participant Directory &amp; Registrations
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect confirmed participants, waitlist status, and export rosters.
          </p>
        </div>

        <Button
          variant="outline"
          disabled={filtered.length === 0}
          onClick={handleExportCsv}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-6">
          <select
            aria-label="Select event"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.registeredCount}/{ev.capacity})
              </option>
            ))}
          </select>
        </div>
        <div className="relative md:col-span-6">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by participant name, email, or QR token..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900"
          />
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : filtered.length === 0 ? (
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
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((reg) => (
                  <tr key={reg.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-medium text-slate-900">{reg.studentName}</td>
                    <td className="px-6 py-3.5 text-xs text-slate-600">{reg.studentEmail}</td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-700">{reg.qrToken}</td>
                    <td className="px-6 py-3.5">
                      <StatusLabel status={reg.status} />
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-slate-500 tabular-nums">
                      {new Date(reg.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
