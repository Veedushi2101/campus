import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {DollarSign, FileText, Plus, Trash2} from 'lucide-react';
import type {FinancialLineItem} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const ClubReportsPage: React.FC = () => {
  const {activeClubId, hasPermission} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const canSubmitEventReport = hasPermission('SUBMIT_EVENT_REPORTS');
  const canSubmitFinanceReport = hasPermission('SUBMIT_FINANCE_REPORTS');

  const {data: events = [], isLoading: eventsLoading} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const [selectedEventId, setSelectedEventId] = useState('');
  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  const {data: existingEventReport} = useQuery({
    queryKey: ['event-report', selectedEventId],
    queryFn: () => apiClient.getEventReport(selectedEventId),
    enabled: Boolean(selectedEventId) && canSubmitEventReport,
  });

  const {data: existingFinanceReport} = useQuery({
    queryKey: ['finance-report', selectedEventId],
    queryFn: () => apiClient.getFinancialReport(selectedEventId),
    enabled: Boolean(selectedEventId) && canSubmitFinanceReport,
  });

  // Event Report State
  const [outcomeSummary, setOutcomeSummary] = useState('');
  const [highlights, setHighlights] = useState('');
  const [challenges, setChallenges] = useState('');
  const [actualAttendance, setActualAttendance] = useState(0);
  const [completionStatus, setCompletionStatus] = useState<'completed' | 'partial'>('completed');

  useEffect(() => {
    if (existingEventReport) {
      setOutcomeSummary(existingEventReport.outcomeSummary);
      setHighlights(existingEventReport.highlights);
      setChallenges(existingEventReport.challenges);
      setActualAttendance(existingEventReport.actualAttendance);
      setCompletionStatus(existingEventReport.completionStatus);
    } else {
      setOutcomeSummary('');
      setHighlights('');
      setChallenges('');
      setActualAttendance(0);
      setCompletionStatus('completed');
    }
  }, [existingEventReport, selectedEventId]);

  // Financial Report State
  const [lineItems, setLineItems] = useState<FinancialLineItem[]>([
    {
      id: 'li-init-1',
      type: 'collection',
      label: 'Registration Fee Collections',
      category: 'Registrations',
      amount: 0,
    },
  ]);
  const [financeNotes, setFinanceNotes] = useState('');

  useEffect(() => {
    if (existingFinanceReport) {
      setLineItems(existingFinanceReport.lineItems);
      setFinanceNotes(existingFinanceReport.notes);
    } else {
      setLineItems([
        {
          id: `li-${Date.now()}`,
          type: 'collection',
          label: 'Registration Fee Collections',
          category: 'Registrations',
          amount: 0,
        },
      ]);
      setFinanceNotes('');
    }
  }, [existingFinanceReport, selectedEventId]);

  const eventReportMutation = useMutation({
    mutationFn: () =>
      apiClient.submitEventReport(selectedEventId, {
        outcomeSummary,
        highlights,
        challenges: challenges || 'None reported',
        actualAttendance: Number(actualAttendance),
        completionStatus,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['event-report', selectedEventId]});
      await queryClient.invalidateQueries({queryKey: ['club-events', activeClubId]});
      toast.success('Event report submitted');
    },
    onError: (err) => {
      toast.error('Failed to submit event report', err instanceof Error ? err.message : undefined);
    },
  });

  const financeMutation = useMutation({
    mutationFn: () =>
      apiClient.submitFinancialReport(selectedEventId, {
        lineItems,
        notes: financeNotes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['finance-report', selectedEventId]});
      toast.success('Financial report submitted');
    },
    onError: (err) => {
      toast.error('Failed to submit financial report', err instanceof Error ? err.message : undefined);
    },
  });

  const totalCollections = lineItems
    .filter((i) => i.type === 'collection')
    .reduce((acc, i) => acc + Number(i.amount || 0), 0);
  const totalExpenses = lineItems
    .filter((i) => i.type === 'expense')
    .reduce((acc, i) => acc + Number(i.amount || 0), 0);
  const netBalance = totalCollections - totalExpenses;

  if (eventsLoading) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Event &amp; Financial Reporting
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit completion summaries and itemized club financial reconciliations. Financial data is
          restricted to authorized officers and Super Admins.
        </p>
      </div>

      <Card className="p-4">
        <label htmlFor="report-event-select" className="block text-xs font-medium text-slate-500">
          Select Event
        </label>
        <select
          id="report-event-select"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev.status})
            </option>
          ))}
        </select>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {canSubmitEventReport && (
          <Card className="p-6">
            <div className="flex items-center gap-2 text-violet-700">
              <FileText className="h-5 w-5" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Event Completion Report
              </h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                eventReportMutation.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <Textarea
                label="Outcome Summary"
                rows={3}
                required
                value={outcomeSummary}
                onChange={(e) => setOutcomeSummary(e.target.value)}
                placeholder="Summarize session outcomes, deliverables, and student engagement..."
              />
              <Textarea
                label="Key Highlights"
                rows={2}
                required
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder="Notable achievements or guest speaker takeaways..."
              />
              <Textarea
                label="Operational Challenges"
                rows={2}
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                placeholder="Logistics or AV issues encountered (optional)"
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Actual Attendance"
                  type="number"
                  min={0}
                  value={actualAttendance}
                  onChange={(e) => setActualAttendance(Number(e.target.value))}
                />
                <Select
                  label="Completion Status"
                  value={completionStatus}
                  onChange={(e) =>
                    setCompletionStatus(e.target.value as 'completed' | 'partial')
                  }
                  options={[
                    {label: 'Completed', value: 'completed'},
                    {label: 'Partial', value: 'partial'},
                  ]}
                />
              </div>

              <Button type="submit" loading={eventReportMutation.isPending}>
                {existingEventReport ? 'Update Event Report' : 'Submit Event Report'}
              </Button>
            </form>
          </Card>
        )}

        {canSubmitFinanceReport && (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-600">
                <DollarSign className="h-5 w-5" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Financial Report
                </h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setLineItems((prev) => [
                    ...prev,
                    {
                      id: `li-${Date.now()}`,
                      type: 'expense',
                      label: 'Equipment / Supplies',
                      category: 'Materials',
                      amount: 0,
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line Item
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
              <div>
                <p className="text-slate-500">Collections</p>
                <p className="mt-1 font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                  INR {totalCollections.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Expenses</p>
                <p className="mt-1 font-mono text-sm font-semibold text-red-700 tabular-nums">
                  INR {totalExpenses.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Net Balance</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  INR {netBalance.toLocaleString()}
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                financeMutation.mutate();
              }}
              className="mt-4 space-y-3"
            >
              {lineItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-center"
                >
                  <select
                    aria-label="Line item type"
                    value={item.type}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((li, i) =>
                          i === idx
                            ? {...li, type: e.target.value as 'collection' | 'expense'}
                            : li,
                        ),
                      )
                    }
                    className="rounded-md border border-slate-200 px-2 py-1.5 text-xs sm:col-span-3"
                  >
                    <option value="collection">Collection</option>
                    <option value="expense">Expense</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={item.label}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((li, i) => (i === idx ? {...li, label: e.target.value} : li)),
                      )
                    }
                    placeholder="Item description"
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs sm:col-span-5"
                  />
                  <input
                    type="number"
                    min={0}
                    required
                    value={item.amount}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((li, i) =>
                          i === idx ? {...li, amount: Number(e.target.value)} : li,
                        ),
                      )
                    }
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs sm:col-span-3"
                  />
                  <button
                    type="button"
                    disabled={lineItems.length <= 1}
                    onClick={() =>
                      setLineItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove line item"
                    className="flex justify-center text-slate-400 hover:text-red-600 disabled:opacity-40 sm:col-span-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <Textarea
                label="Audit & Ledger Notes"
                rows={2}
                value={financeNotes}
                onChange={(e) => setFinanceNotes(e.target.value)}
                placeholder="Invoice references or grant allocation notes..."
              />

              <Button type="submit" variant="secondary" loading={financeMutation.isPending}>
                {existingFinanceReport ? 'Update Financial Report' : 'Submit Financial Report'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
};
