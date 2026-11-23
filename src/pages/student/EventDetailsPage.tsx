import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {ArrowLeft, Calendar, CheckCircle2, MapPin, QrCode, Users} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {Link, useParams} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const EventDetailsPage: React.FC = () => {
  const {eventId = ''} = useParams();
  const {user} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const [answers, setAnswers] = useState<Record<string, string | boolean | number>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const {data: event, isLoading: eventLoading} = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => apiClient.getEventDetail(eventId),
    enabled: Boolean(eventId),
  });

  const {data: form} = useQuery({
    queryKey: ['event-form', eventId],
    queryFn: () => apiClient.getEventForm(eventId),
    enabled: Boolean(eventId),
  });

  const {data: myRegistrations = []} = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: () => apiClient.listMyRegistrations(),
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!form) return;
    const defaults: Record<string, string | boolean | number> = {};
    for (const field of form.fields) {
      if (field.type === 'select' && field.options?.length) {
        defaults[field.id] = field.options[0];
      } else if (field.type === 'checkbox') {
        defaults[field.id] = false;
      } else {
        defaults[field.id] = '';
      }
    }
    setAnswers(defaults);
  }, [form]);

  const registerMutation = useMutation({
    mutationFn: () => apiClient.submitRegistration(eventId, answers),
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({queryKey: ['my-registrations']});
      await queryClient.invalidateQueries({queryKey: ['event', eventId]});
      await queryClient.invalidateQueries({queryKey: ['notifications']});
      toast.success('Registration confirmed', 'Your opaque QR entry pass is ready.');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to submit registration';
      setFormError(msg);
      toast.error('Registration error', msg);
    },
  });

  if (eventLoading) return <LoadingSkeleton rows={4} />;
  if (!event) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-slate-800">Event not found.</p>
        <Link to="/app/student/events" className="mt-3 inline-block text-xs font-medium text-blue-600">
          Back to Events
        </Link>
      </Card>
    );
  }

  const existingRegistration = myRegistrations.find(
    (r) => r.eventId === event.id && r.status !== 'cancelled',
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    registerMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Link
        to="/app/student/events"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Events
      </Link>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 sm:p-8 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <Link
              to={`/app/student/clubs/${event.clubId}`}
              className="text-xs font-semibold text-violet-700 hover:underline"
            >
              {event.clubName}
            </Link>
            <StatusLabel status={event.status} />
          </div>

          <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">{event.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {event.category} · {event.isPaid ? `Registration Fee: INR ${event.feeAmount}` : 'Free Entry'}
          </p>

          <div className="mt-6 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
              <span>
                {new Date(event.startTime).toLocaleDateString()} ·{' '}
                {new Date(event.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
              <span>{event.venue}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="font-mono tabular-nums">
                {event.registeredCount} / {event.capacity} seats filled
              </span>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="font-display text-sm font-semibold text-slate-900">Event Description</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{event.description}</p>
          </div>
        </Card>

        <Card className="p-6 sm:p-8 lg:col-span-5">
          {existingRegistration ? (
            <div className="text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
                You are registered
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Present this single-use opaque QR pass at {event.venue}. No personal PII is encoded
                inside the token.
              </p>

              <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-white p-4">
                <QRCodeSVG value={existingRegistration.qrToken} size={160} level="M" />
              </div>

              <p className="mt-3 font-mono text-sm font-semibold text-slate-900">
                {existingRegistration.qrToken}
              </p>
              <div className="mt-2 flex justify-center">
                <StatusLabel status={existingRegistration.status} />
              </div>
            </div>
          ) : event.status !== 'published' ? (
            <div className="py-8 text-center">
              <QrCode className="mx-auto h-8 w-8 text-slate-400" />
              <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
                Registration Closed
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                This event is currently in <span className="font-medium">{event.status}</span> state.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900">
                  Register for Event
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Form version v{form?.version || 1} configured by {event.clubName}
                </p>
              </div>

              {formError && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {formError}
                </p>
              )}

              {form?.fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  {field.type === 'checkbox' ? (
                    <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(answers[field.id])}
                        onChange={(e) =>
                          setAnswers((prev) => ({...prev, [field.id]: e.target.checked}))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-violet-700"
                      />
                      <span>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </span>
                    </label>
                  ) : (
                    <>
                      <label className="block text-xs font-medium text-slate-800">
                        {field.label}
                        {field.required ? ' *' : ''}
                      </label>
                      {field.type === 'select' ? (
                        <select
                          value={String(answers[field.id] || '')}
                          onChange={(e) =>
                            setAnswers((prev) => ({...prev, [field.id]: e.target.value}))
                          }
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          {(field.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'textarea' ? (
                        <textarea
                          rows={3}
                          value={String(answers[field.id] || '')}
                          placeholder={field.placeholder}
                          onChange={(e) =>
                            setAnswers((prev) => ({...prev, [field.id]: e.target.value}))
                          }
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
                          value={String(answers[field.id] || '')}
                          placeholder={field.placeholder}
                          onChange={(e) =>
                            setAnswers((prev) => ({...prev, [field.id]: e.target.value}))
                          }
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                      )}
                    </>
                  )}
                </div>
              ))}

              <Button type="submit" loading={registerMutation.isPending} className="w-full">
                Confirm Registration &amp; Issue QR Pass
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
