'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function MigrationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    currentWeekStart?: string;
    nextWeekStart?: string;
    staffCount?: number;
    nextWeekDataCount?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runMigration = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      // Call the Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('weekly-migration', {
        body: {}
      });

      if (error) {
        throw error;
      }

      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      <div className="max-w-4xl mx-auto bg-white/90 rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-pink-700 mb-8 text-center">
          Weekly Migration Admin
        </h1>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">⚠️ Important</h2>
          <p className="text-yellow-700">
            This migration process will:
          </p>
          <ul className="list-disc list-inside text-yellow-700 mt-2 space-y-1">
            <li>Archive current week data from staff table to weekly_schedules</li>
            <li>Move next week&apos;s data from weekly_schedules to staff table</li>
            <li>Update the &quot;current week&quot; to be next week</li>
          </ul>
          <p className="text-yellow-700 mt-2 font-semibold">
            Only run this when you&apos;re ready to advance to the next week!
          </p>
        </div>

        <div className="text-center">
          <button
            onClick={runMigration}
            disabled={isRunning}
            className="px-8 py-4 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-3 mx-auto"
          >
            {isRunning ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                Running Migration...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Run Weekly Migration
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-green-800 mb-2">Migration Result</h3>
            <div className="text-green-700">
              <p><strong>Status:</strong> {result.success ? 'Success' : 'Failed'}</p>
              <p><strong>Message:</strong> {result.message}</p>
              {result.currentWeekStart && (
                <p><strong>Previous Week:</strong> {result.currentWeekStart}</p>
              )}
              {result.nextWeekStart && (
                <p><strong>New Current Week:</strong> {result.nextWeekStart}</p>
              )}
              {result.staffCount && (
                <p><strong>Staff Processed:</strong> {result.staffCount}</p>
              )}
              {result.nextWeekDataCount !== undefined && (
                <p><strong>Next Week Records Found:</strong> {result.nextWeekDataCount}</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">How It Works</h3>
          <div className="text-blue-700 space-y-2">
            <p><strong>Step 1:</strong> Current week data in staff table gets archived to weekly_schedules</p>
            <p><strong>Step 2:</strong> Next week data from weekly_schedules gets moved to staff table</p>
            <p><strong>Step 3:</strong> Next week data is removed from weekly_schedules (now it&apos;s current)</p>
            <p><strong>Result:</strong> The system advances one week forward</p>
          </div>
        </div>
      </div>
    </div>
  );
} 