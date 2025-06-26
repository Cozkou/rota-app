'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function MigrationPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    currentWeekData?: any[];
    nextWeekData?: any[];
    allWeeksData?: any[];
    staffCount?: number;
  } | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    currentWeekStart?: string;
    nextWeekStart?: string;
    staffCount?: number;
    nextWeekDataCount?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCurrentSunday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    return new Date(today.setDate(diff));
  };

  const getNextSunday = () => {
    const currentSunday = getCurrentSunday();
    const nextSunday = new Date(currentSunday);
    nextSunday.setDate(currentSunday.getDate() + 7);
    return nextSunday;
  };

  const checkCurrentState = async () => {
    setIsChecking(true);
    setError(null);
    
    try {
      const currentSunday = getCurrentSunday();
      const nextSunday = getNextSunday();
      const currentWeekStart = currentSunday.toISOString().split('T')[0];
      const nextWeekStart = nextSunday.toISOString().split('T')[0];

      // Get current staff data
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*');

      if (staffError) throw staffError;

      // Get next week data
      const { data: nextWeekData, error: nextWeekError } = await supabase
        .from('weekly_schedules')
        .select('*')
        .eq('week_starting_date', nextWeekStart);

      if (nextWeekError) throw nextWeekError;

      // Get all weekly_schedules data for overview
      const { data: allWeeksData, error: allWeeksError } = await supabase
        .from('weekly_schedules')
        .select('week_starting_date, staff_id')
        .order('week_starting_date');

      if (allWeeksError) throw allWeeksError;

      setDebugInfo({
        currentWeekData: staffData,
        nextWeekData,
        allWeeksData,
        staffCount: staffData?.length || 0
      });

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsChecking(false);
    }
  };

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
      // Refresh debug info after migration
      setTimeout(() => checkCurrentState(), 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      <div className="max-w-6xl mx-auto bg-white/90 rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-pink-700 mb-8 text-center">
          Weekly Migration Admin
        </h1>

        {/* Debug Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
              🔍 System Status Check
              <button
                onClick={checkCurrentState}
                disabled={isChecking}
                className="ml-auto px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded text-sm"
              >
                {isChecking ? 'Checking...' : 'Check Now'}
              </button>
            </h2>
            
            {debugInfo && (
              <div className="space-y-2 text-sm text-blue-700">
                <p><strong>Staff in System:</strong> {debugInfo.staffCount}</p>
                <p><strong>Current Week (Staff Table):</strong> {debugInfo.currentWeekData?.length} records</p>
                <p><strong>Next Week (Weekly Schedules):</strong> {debugInfo.nextWeekData?.length} records</p>
                <p><strong>Total Weeks in Archive:</strong> {
                  debugInfo.allWeeksData ? 
                    [...new Set(debugInfo.allWeeksData.map(w => w.week_starting_date))].length : 
                    0
                } weeks</p>
                
                {debugInfo.allWeeksData && debugInfo.allWeeksData.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer font-medium">View All Archived Weeks</summary>
                    <div className="mt-2 pl-4 space-y-1">
                      {[...new Set(debugInfo.allWeeksData.map(w => w.week_starting_date))]
                        .sort()
                        .map(week => (
                          <div key={week} className="text-xs">
                            Week {week}: {debugInfo.allWeeksData?.filter(w => w.week_starting_date === week).length} staff records
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">⚠️ Migration Process</h2>
            <p className="text-yellow-700 text-sm mb-3">
              This migration process will:
            </p>
            <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
              <li>Archive current week → weekly_schedules</li>
              <li>Move next week → staff table (current)</li>
              <li>Clean up promoted data</li>
              <li>Week numbers will update automatically</li>
            </ul>
            
            <div className="mt-4 p-3 bg-yellow-100 rounded text-xs text-yellow-800">
              <strong>Note:</strong> If there's no next week data, migration will result in empty schedules becoming current (which is normal - manager can then fill them in).
            </div>
          </div>
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
          <div className="text-blue-700 space-y-2 text-sm">
            <p><strong>Step 1:</strong> Current week data in staff table gets archived to weekly_schedules</p>
            <p><strong>Step 2:</strong> Next week data from weekly_schedules gets moved to staff table</p>
            <p><strong>Step 3:</strong> Next week data is removed from weekly_schedules (now it's current)</p>
            <p><strong>Result:</strong> The system advances one week forward, week numbers update automatically</p>
          </div>
        </div>
      </div>
    </div>
  );
} 