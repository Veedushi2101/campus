import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Calendar, MapPin, QrCode, Ticket} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {Link} from 'react-router-dom';
import type {Registration} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

export const MyRegistrationsPage: React.FC = () => {
  const {user} = useAuth();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedPass, setSelectedPass] = useState<Registration | null>(null);

  const {data: registrations = [], isLoading} = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: () => apiClient.listMyRegistrations(),
  });

  const upcoming = registrations.filter((r) => r.status === 'confirmed' || r.status === 'waitlisted');
  const past = registrations.filter((r) => r.status === 'attended' || r.status === 'cancelled');
  const activeList = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">My Registrations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Access your event tickets, non-PII QR passes, and check-in history.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'upcoming' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('past')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'past' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Past ({past.length})
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : activeList.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title={`No ${tab} registrations`}
          description="Explore upcoming campus events to reserve your spot and generate an entry pass."
          action={
            <Link
              to="/app/student/events"
              className="inline-flex items-center rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800"
            >
              Browse Events
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activeList.map((reg) => (
            <Card key={reg.id} className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-violet-700">{reg.clubName}</span>
                  <StatusLabel status={reg.status} />
                </div>
                <Link
                  to={`/app/student/events/${reg.eventId}`}
                  className="mt-2 block font-display text-base font-semibold text-slate-900 hover:text-violet-700"
                >
                  {reg.eventTitle}
                </Link>
                <div className="mt-3 space-y-1 text-xs text-slate-500">
                  {reg.eventStartTime && (
                    <p className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{new Date(reg.eventStartTime).toLocaleString()}</span>
                    </p>
                  )}
                  {reg.eventVenue && (
                    <p className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{reg.eventVenue}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="font-mono text-xs text-slate-600">{reg.qrToken}</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedPass(reg)}>
                  <QrCode className="h-3.5 w-3.5" />
                  Open QR Pass
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selectedPass)}
        onClose={() => setSelectedPass(null)}
        title={selectedPass?.eventTitle || 'Event QR Pass'}
        subtitle="Single-use opaque attendance token (contains zero personal PII)"
      >
        {selectedPass && (
          <div className="flex flex-col items-center text-center">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <QRCodeSVG value={selectedPass.qrToken} size={184} level="M" />
            </div>
            <p className="mt-4 font-mono text-base font-semibold text-slate-900">
              {selectedPass.qrToken}
            </p>
            <div className="mt-2">
              <StatusLabel status={selectedPass.status} />
            </div>
            {selectedPass.qrUsedAt && (
              <p className="mt-2 text-xs text-slate-500">
                Checked in at {new Date(selectedPass.qrUsedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
