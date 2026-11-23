import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Search} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';

export const AdminEventsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const {data: events = [], isLoading} = useQuery({
    queryKey: ['admin-events', search, statusFilter],
    queryFn: () => apiClient.listEvents({search, status: statusFilter}),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Institution-Wide Events
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor all draft, published, and completed events across campus clubs.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {['All', 'published', 'draft', 'completed'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events or clubs..."
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
                  <th className="px-6 py-3">Event</th>
                  <th className="px-6 py-3">Organizing Club</th>
                  <th className="px-6 py-3">Schedule</th>
                  <th className="px-6 py-3 text-right">Registrations</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-900">{ev.title}</p>
                      <p className="text-xs text-slate-500">
                        {ev.category} · {ev.venue}
                      </p>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-700">{ev.clubName}</td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-600 tabular-nums">
                      {new Date(ev.startTime).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-xs text-slate-800 tabular-nums">
                      {ev.registeredCount} / {ev.capacity}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusLabel status={ev.status} />
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
