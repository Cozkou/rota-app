"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { use } from "react";
import Image from 'next/image';

// Helper functions for week navigation
const getMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
};

const getSunday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Get the Sunday of the current week
  return new Date(d.setDate(diff));
};

const getWeekNumber = (date: Date): number => {
  // Get today's date and make it week 43
  const today = new Date();
  const todaySunday = getSunday(today);
  
  // Calculate which week the given date falls into
  const dateSunday = getSunday(date);
  const daysDiff = Math.floor((dateSunday.getTime() - todaySunday.getTime()) / (24 * 60 * 60 * 1000));
  const weeksDiff = Math.floor(daysDiff / 7);
  
  let weekNumber = 44 + weeksDiff;
  
  // Handle year transitions (weeks 1-53)
  if (weekNumber > 53) {
    weekNumber = ((weekNumber - 1) % 53) + 1;
  } else if (weekNumber < 1) {
    weekNumber = 53 + (weekNumber % 53);
  }
  
  return weekNumber;
};

interface Staff {
  id: string;
  name: string;
  role: string;
  shifts: string[];
  hours: number;
}

export default function TerminalView({ params }: { params: Promise<{ terminal: string }> }) {
  const router = useRouter();
  const { terminal } = use(params);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<Date>(new Date());

  const days = useMemo(() => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames.map((name) => ({
      date: '', // Not needed for display purposes
      name: name
    }));
  }, []);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/login");
          return;
        }

        // Fetch user role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);
          // Fetch staff data for the terminal
          await fetchStaffData();
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router, terminal, days]);

  const calculateHours = useCallback((timeRange: string): number => {
    if (!timeRange || !timeRange.includes('-')) return 0;
    
    const [start, end] = timeRange.split('-').map(time => time.trim());
    if (!start || !end) return 0;

    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) return 0;

    let hours = endHour - startHour;
    let minutes = endMinute - startMinute;

    if (minutes < 0) {
      hours -= 1;
      minutes += 60;
    }

    const totalHours = hours + minutes / 60;
    
    // Subtract 1 hour for breaks if shift is longer than 6 hours
    return totalHours > 6 ? totalHours - 1 : totalHours;
  }, []);

  const isCurrentWeek = useCallback((): boolean => {
    const today = new Date();
    const currentMonday = getMonday(today);
    const selectedMonday = getMonday(selectedWeek);
    return currentMonday.toDateString() === selectedMonday.toDateString();
  }, [selectedWeek]);

  const fetchStaffData = useCallback(async () => {
    try {
      const { data: staffData } = await supabase
        .from('staff')
        .select('*')
        .eq('terminal', terminal);

      if (staffData) {
        if (isCurrentWeek()) {
          // Current week: data is in staff table
          const staffWithShifts = staffData.map(person => {
            const shifts = days.map(day => {
              const dayLower = day.name.toLowerCase();
              return person[dayLower] || '';
            });
            
            const totalHours = shifts.reduce((sum, shift) => sum + calculateHours(shift), 0);
            return {
              ...person,
              shifts,
              hours: totalHours
            };
          });

          setStaff(staffWithShifts);
        } else {
          // Past or future week: data is in weekly_schedules table
          const monday = getMonday(selectedWeek);
          const weekStartDate = monday.toISOString().split('T')[0];

          const { data: weeklySchedules } = await supabase
            .from("weekly_schedules")
            .select("*")
            .eq("week_starting_date", weekStartDate)
            .in("staff_id", staffData.map(s => parseInt(s.id)));

          const staffWithShifts = staffData.map(person => {
            const weeklySchedule = weeklySchedules?.find(ws => ws.staff_id === parseInt(person.id));
            
            const shifts = days.map(day => {
              const dayLower = day.name.toLowerCase();
              if (weeklySchedule && weeklySchedule[dayLower]) {
                return weeklySchedule[dayLower];
              }
              return '';
            });
            
            const totalHours = shifts.reduce((sum, shift) => sum + calculateHours(shift), 0);
            return {
              ...person,
              shifts,
              hours: totalHours
            };
          });

          setStaff(staffWithShifts);
        }
      }
    } catch (error) {
      console.error('Error fetching staff data:', error);
    }
  }, [selectedWeek, terminal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load data when selected week changes
  useEffect(() => {
    if (userRole) {
      fetchStaffData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, userRole]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStaffData();
    setRefreshing(false);
  };

  const handlePreviousWeek = () => {
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(selectedWeek.getDate() - 7);
    setSelectedWeek(newWeek);
  };

  const handleNextWeek = () => {
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(selectedWeek.getDate() + 7);
    setSelectedWeek(newWeek);
  };

  const handleCurrentWeek = () => {
    setSelectedWeek(new Date());
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="animate-spin h-8 w-8 border-4 border-pink-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      {/* Hamburger Menu */}
      {!isMenuOpen && (
        <div className="fixed top-4 left-4 z-50 sm:top-6 sm:left-6">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg hover:bg-pink-100 transition-colors group"
          >
            <div className="relative w-6 h-6 flex items-center justify-center">
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-0' : '-translate-y-1.5'}`}></span>
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}></span>
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? '-rotate-45 translate-y-0' : 'translate-y-1.5'}`}></span>
            </div>
          </button>
        </div>
      )}

      {/* Sidebar Menu */}
      <div className={`fixed top-0 left-0 h-full w-[85%] sm:w-72 bg-white/90 backdrop-blur-md shadow-xl transform transition-all duration-300 ease-in-out z-40 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 sm:p-8">
          <div className="flex justify-between items-start mb-8 sm:mb-12">
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-pink-600 tracking-wide">Dashboard</h2>
              {userRole && (
                <p className="text-sm sm:text-base text-pink-500 mt-2 font-medium">Hello {userRole}</p>
              )}
            </div>
            <div className="ml-4">
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-pink-100/50 flex-shrink-0 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6 text-pink-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {[2, 3, 4, 5].map((t) => (
              <button
                key={t}
                onClick={() => router.push(`/dashboard/terminal/${t}`)}
                className={`w-full text-left px-4 sm:px-5 py-3 rounded-xl hover:bg-pink-100/50 text-pink-600 font-medium text-base sm:text-lg transition-all duration-300 flex items-center gap-3 group hover:translate-x-1 hover:shadow-md ${t === Number(terminal) ? 'bg-pink-100/50 shadow-md' : ''}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                </svg>
                <span className="transition-transform duration-300 group-hover:translate-x-1">Terminal {t}</span>
              </button>
            ))}
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 sm:px-5 py-3 rounded-xl hover:bg-pink-100/50 text-pink-600 font-medium text-base sm:text-lg transition-all duration-300 flex items-center gap-3 group hover:translate-x-1 hover:shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              <span className="transition-transform duration-300 group-hover:translate-x-1">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto bg-white/90 rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-4 sm:p-8 md:p-12">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 sm:mb-10 gap-6">
          {/* Logo */}
          <div className="flex justify-center lg:justify-start">
            <Image
              src="/accessorizelogo2.jpeg"
              alt="Accessorize Logo"
              width={200}
              height={60}
            />
          </div>

          {/* Week Navigation */}
          <div className="bg-white/50 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePreviousWeek}
                className="p-2 rounded-lg bg-pink-100 hover:bg-pink-200 text-pink-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              
              <div className="text-center">
                <div className="font-bold text-pink-700 text-lg">
                  Week {getWeekNumber(selectedWeek)}
                </div>
                <div className="text-sm text-pink-600">
                  {selectedWeek.getFullYear()}
                </div>
              </div>
              
              <button
                onClick={handleNextWeek}
                className="p-2 rounded-lg bg-pink-100 hover:bg-pink-200 text-pink-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {!isCurrentWeek() && (
                <button
                  onClick={handleCurrentWeek}
                  className="ml-4 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-lg font-medium transition-colors text-xs flex items-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Current
                </button>
              )}
            </div>
          </div>

          {/* Terminal and Refresh */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <span className="font-semibold text-pink-700 text-base sm:text-lg text-center md:text-right">Terminal {terminal}</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 text-sm"
            >
              {refreshing ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Refreshing...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh
                </>
              )}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl sm:rounded-2xl shadow-md">
          {loading ? (
            <div className="text-center text-pink-600 py-10 text-base sm:text-lg font-semibold">Loading staff...</div>
          ) : (
            <table className="min-w-full border-separate border-spacing-0 text-xs sm:text-sm md:text-base text-gray-800 bg-white rounded-xl sm:rounded-2xl overflow-hidden">
              <thead>
                <tr className="bg-pink-200 text-pink-700 text-sm sm:text-base">
                  <th className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3 font-bold">Name</th>
                  <th className="border-b border-pink-100 px-1 py-2 sm:py-3 font-bold w-14">Hours</th>
                  {days.map((day) => (
                    <th key={day.name} className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3 font-bold">{day.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id} className="hover:bg-pink-50/50">
                    <td className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3">
                      <div>
                        <div>{person.name}</div>
                        <div className="text-xs text-gray-500">{person.role}</div>
                      </div>
                    </td>
                    <td className="border-b border-pink-100 px-1 py-2 sm:py-3 w-14 text-center">
                      {person.hours !== undefined ? (Number.isInteger(person.hours) ? person.hours : person.hours.toFixed(1)) : '-'}
                    </td>
                    {days.map((day, dayIndex) => (
                      <td key={day.name} className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3">
                        <div className="text-xs text-gray-700 font-medium">
                          {person.shifts[dayIndex] || '-'}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
} 