import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {AlertTriangle, CheckCircle2, QrCode, UserCheck} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const AttendancePage: React.FC = () => {
  const {activeClubId, hasPermission} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const {data: events = []} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') || '');
  const [qrInput, setQrInput] = useState('');
  const [scanResult, setScanResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const {data: attendanceSummary, isLoading} = useQuery({
    queryKey: ['event-attendance', selectedEventId],
    queryFn: () => apiClient.getEventAttendance(selectedEventId),
    enabled: Boolean(selectedEventId),
  });

  const canViewRegs = hasPermission('VIEW_REGISTRATIONS');
  const {data: registrations = []} = useQuery({
    queryKey: ['event-registrations', selectedEventId],
    queryFn: () => apiClient.listEventRegistrations(selectedEventId),
    enabled: Boolean(selectedEventId) && canViewRegs,
  });

  const scanMutation = useMutation({
    mutationFn: (payload: {
      qrToken?: string;
      registrationId?: string;
      method: 'qr_scan' | 'manual_override';
    }) => apiClient.scanAttendance(selectedEventId, payload),
    onSuccess: async (record) => {
      setScanResult({
        ok: true,
        message: `Checked in ${record.studentName} (${record.qrToken}) via ${record.method}.`,
      });
      setQrInput('');
      await queryClient.invalidateQueries({queryKey: ['event-attendance', selectedEventId]});
      await queryClient.invalidateQueries({queryKey: ['event-registrations', selectedEventId]});
      toast.success('Attendance recorded', `${record.studentName} verified`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setScanResult({ok: false, message});
      toast.error('Check-in rejected', message);
    },
  });

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;
    scanMutation.mutate({qrToken: qrInput.trim(), method: 'qr_scan'});
  };

  const registeredCount = attendanceSummary?.registeredCount || 0;
  const attendedCount = attendanceSummary?.attendedCount || 0;
  const attendancePct =
    registeredCount > 0 ? Math.round((attendedCount / registeredCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Attendance &amp; QR Check-In Gate
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Verify opaque single-use QR passes or run manual fallback check-ins. Duplicate scans are
          automatically blocked.
        </p>
      </div>

      <Card className="p-4">
        <label htmlFor="attendance-event-select" className="block text-xs font-medium text-slate-500">
          Active Event Gate
        </label>
        <select
          id="attendance-event-select"
          value={selectedEventId}
          onChange={(e) => {
            setSelectedEventId(e.target.value);
            setScanResult(null);
          }}
          className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev.status})
            </option>
          ))}
        </select>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* QR Scanner Simulation Card */}
        <Card className="p-6 lg:col-span-5">
          <div className="flex items-center gap-2.5 text-violet-700">
            <QrCode className="h-5 w-5" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              QR Pass Verification
            </h2>
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Scan or paste a student&apos;s opaque token (e.g.{' '}
            <span className="font-mono text-slate-800">CV-QR-8F92A1C4</span>) to verify and mark
            single-use attendance.
          </p>

          <form onSubmit={handleTokenSubmit} className="mt-4 space-y-3">
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="CV-QR-XXXXXXXX"
              aria-label="QR Verification Token"
              className="block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm uppercase text-slate-900 focus:border-blue-600"
            />
            <Button type="submit" loading={scanMutation.isPending} className="w-full">
              Verify &amp; Check In
            </Button>
          </form>

          {scanResult && (
            <div
              role="status"
              className={`mt-4 flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
                scanResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {scanResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              )}
              <span>{scanResult.message}</span>
            </div>
          )}

          {/* Attendance Summary Bar */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">Gate Turnout</span>
              <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {attendedCount} / {registeredCount} ({attendancePct}%)
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-violet-700 transition-all"
                style={{width: `${attendancePct}%`}}
              />
            </div>
          </div>
        </Card>

        {/* Quick-Test Registered Passes & Live Check-in Log */}
        <div className="space-y-6 lg:col-span-7">
          {canViewRegs && registrations.length > 0 && (
            <Card className="p-6">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Registered Participants (Quick Simulate &amp; Manual Fallback)
              </h2>
              <div className="mt-3 divide-y divide-slate-100">
                {registrations.map((reg) => (
                  <div key={reg.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{reg.studentName}</p>
                      <p className="font-mono text-xs text-slate-500">{reg.qrToken}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusLabel status={reg.status} />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={scanMutation.isPending}
                        onClick={() =>
                          scanMutation.mutate({qrToken: reg.qrToken, method: 'qr_scan'})
                        }
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        Simulate Scan
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={scanMutation.isPending}
                        onClick={() =>
                          scanMutation.mutate({
                            registrationId: reg.id,
                            method: 'manual_override',
                          })
                        }
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Manual
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Verified Check-In Ledger
              </h2>
            </div>
            {isLoading ? (
              <div className="p-6">
                <LoadingSkeleton rows={2} />
              </div>
            ) : !attendanceSummary?.records.length ? (
              <p className="p-6 text-sm text-slate-500">No attendees checked in yet for this event.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Student</th>
                      <th className="px-6 py-3">QR Token</th>
                      <th className="px-6 py-3">Method</th>
                      <th className="px-6 py-3 text-right">Checked In</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {attendanceSummary.records.map((rec) => (
                      <tr key={rec.id}>
                        <td className="px-6 py-3 font-medium text-slate-900">{rec.studentName}</td>
                        <td className="px-6 py-3 font-mono text-xs text-slate-600">{rec.qrToken}</td>
                        <td className="px-6 py-3 text-xs text-slate-600">
                          {rec.method === 'qr_scan' ? 'QR Scan' : 'Manual Override'}
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-xs text-slate-500 tabular-nums">
                          {new Date(rec.checkedInAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
