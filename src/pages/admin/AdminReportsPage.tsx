import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {FileText} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';

export const AdminReportsPage: React.FC = () => {
  const {data: reports = [], isLoading} = useQuery({
    queryKey: ['admin-reports'],
    queryFn: () => apiClient.listAdminReports(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Submitted Event Completion Reports
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Review post-event outcomes, turnout figures, and operational notes across all clubs.
        </p>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No event reports submitted yet"
          description="Submitted completion reports from club teams will appear here."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((rep) => (
            <Card key={rep.id} className="p-6">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-medium text-violet-700">{rep.clubName}</p>
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    {rep.eventTitle}
                  </h2>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-slate-600 tabular-nums">
                    Attendance: {rep.actualAttendance} / {rep.registeredTotal}
                  </span>
                  <StatusLabel status={rep.completionStatus} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-slate-500">Outcome Summary</p>
                  <p className="mt-1 text-slate-700 leading-relaxed">{rep.outcomeSummary}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Highlights &amp; Challenges</p>
                  <p className="mt-1 text-slate-700 leading-relaxed">{rep.highlights}</p>
                  <p className="mt-1 text-xs text-slate-500">Challenges: {rep.challenges}</p>
                </div>
              </div>

              <p className="mt-4 text-xs text-slate-400">
                Submitted by {rep.submittedByName} on {new Date(rep.submittedAt).toLocaleString()}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
