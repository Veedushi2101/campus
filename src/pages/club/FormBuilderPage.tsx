import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Plus, Save, Trash2} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import type {FormField, FormFieldType} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const FormBuilderPage: React.FC = () => {
  const {activeClubId} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const {data: events = [], isLoading: eventsLoading} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') || '');
  const [fields, setFields] = useState<FormField[]>([]);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const {data: form, isLoading: formLoading} = useQuery({
    queryKey: ['event-form', selectedEventId],
    queryFn: () => apiClient.getEventForm(selectedEventId),
    enabled: Boolean(selectedEventId),
  });

  useEffect(() => {
    if (form) setFields(form.fields);
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveEventForm(selectedEventId, fields),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({queryKey: ['event-form', selectedEventId]});
      toast.success(`Registration form saved (v${saved.version})`);
    },
    onError: (err) => {
      toast.error('Failed to save form', err instanceof Error ? err.message : undefined);
    },
  });

  const addField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: `fld-${Date.now()}`,
        label: 'New Question',
        type: 'text',
        required: false,
        placeholder: 'Enter response',
      },
    ]);
  };

  const updateField = (idx: number, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? {...f, ...patch} : f)));
  };

  const removeField = (idx: number) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  if (eventsLoading) return <LoadingSkeleton rows={3} />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Registration Form Builder
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure custom intake questions and validation rules per event (currently version v
            {form?.version || 1}).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="outline" onClick={addField}>
            <Plus className="h-4 w-4" />
            Add Field
          </Button>
          <Button
            loading={saveMutation.isPending}
            disabled={!selectedEventId || fields.length === 0}
            onClick={() => saveMutation.mutate()}
          >
            <Save className="h-4 w-4" />
            Save Form
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <label htmlFor="form-builder-event" className="block text-xs font-medium text-slate-500">
          Target Event
        </label>
        <select
          id="form-builder-event"
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

      {formLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <Card key={field.id} className="p-5">
              <div className="grid gap-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-5">
                  <label className="block text-xs font-medium text-slate-700">Field Label</label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(idx, {label: e.target.value})}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-700">Type</label>
                  <select
                    value={field.type}
                    onChange={(e) => {
                      const nextType = e.target.value as FormFieldType;
                      updateField(idx, {
                        type: nextType,
                        options:
                          nextType === 'select' && !field.options?.length
                            ? ['Option A', 'Option B']
                            : field.options,
                      });
                    }}
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900"
                  >
                    <option value="text">Short Text</option>
                    <option value="textarea">Long Text</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                    <option value="select">Dropdown Select</option>
                    <option value="checkbox">Checkbox</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(idx, {required: e.target.checked})}
                    />
                    Required
                  </label>
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={fields.length <= 1}
                    onClick={() => removeField(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    Delete
                  </Button>
                </div>
              </div>

              {field.type === 'select' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Dropdown Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={(field.options || []).join(', ')}
                    onChange={(e) =>
                      updateField(idx, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
