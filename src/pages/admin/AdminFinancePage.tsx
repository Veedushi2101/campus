import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';

export const AdminFinancePage: React.FC = () => {
  const {data, isLoading} = useQuery({
    queryKey: ['admin-finance'],
    queryFn: () => apiClient.getAdminFinance(),
  });

  if (isLoading || !data) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Institutional Financial Oversight
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Consolidated collections, expenses, and itemized club event ledgers. Strictly hidden from
          student accounts.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Collections</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            INR {data.totalCollections.toLocaleString()}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Expenses</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            INR {data.totalExpenses.toLocaleString()}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Institutional Net Balance</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            INR {data.netBalance.toLocaleString()}
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        {data.reports.map((rep) => (
          <Card key={rep.id} className="overflow-hidden">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-violet-700">{rep.clubName}</p>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {rep.eventTitle}
                </h2>
              </div>
              <div className="flex items-center gap-5 font-mono text-xs tabular-nums">
                <span className="text-emerald-700">
                  +INR {rep.totalCollections.toLocaleString()}
                </span>
                <span className="text-red-700">-INR {rep.totalExpenses.toLocaleString()}</span>
                <span className="font-semibold text-slate-900">
                  Net INR {rep.netBalance.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-6 py-2.5">Line Item</th>
                    <th className="px-6 py-2.5">Type</th>
                    <th className="px-6 py-2.5">Category</th>
                    <th className="px-6 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rep.lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-6 py-2.5 font-medium text-slate-900">{li.label}</td>
                      <td className="px-6 py-2.5 capitalize text-slate-600">{li.type}</td>
                      <td className="px-6 py-2.5 text-slate-600">{li.category}</td>
                      <td className="px-6 py-2.5 text-right font-mono font-semibold text-slate-800 tabular-nums">
                        INR {li.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
