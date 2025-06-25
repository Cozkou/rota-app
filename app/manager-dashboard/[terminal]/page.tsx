"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Staff {
  id: string;
  name: string;
  role: string;
  shifts: string[];
  hours: number;
}

export default function TerminalRotaPage() {
  const router = useRouter();
  const params = useParams();
  const terminal = Number(params.terminal);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [newStaff, setNewStaff] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState<Staff | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

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
          // Redirect if not a manager
          if (profile.role !== 'manager') {
            router.replace("/dashboard");
            return;
          }
          // User is authorized
          setIsAuthorized(true);

          // Fetch staff data
          const { data: staffData } = await supabase
            .from("staff")
            .select("*")
            .eq("terminal", String(terminal));

          if (staffData) {
            // Convert staff data to include shifts from draft columns (fallback to published if draft is empty)
            const staffWithShifts = staffData.map(person => {
              const shifts = days.map(day => {
                const draftColumn = `draft_${day.toLowerCase()}`;
                const publishedColumn = day.toLowerCase();
                // Use draft data if available, otherwise use published data
                return person[draftColumn] || person[publishedColumn] || '';
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
        console.error('Error checking auth:', error);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router, terminal]);

  const calculateHours = (timeRange: string): number => {
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
  };

  const handleShiftChange = (person: Staff, dayIndex: number, value: string) => {
    console.log('handleShiftChange called:', person.name, dayIndex, value);
    // Update local state only (don't save to database automatically)
    const updatedStaff = staff.map(p => {
      if (p.id === person.id) {
        const newShifts = [...p.shifts];
        newShifts[dayIndex] = value;
        const totalHours = newShifts.reduce((sum, shift) => sum + calculateHours(shift), 0);
        return { ...p, shifts: newShifts, hours: totalHours };
      }
      return p;
    });
    setStaff(updatedStaff);
    setHasUnsavedChanges(true);
    console.log('hasUnsavedChanges set to true');
  };

  const handleAddStaff = async () => {
    if (newStaff.trim()) {
      const { data, error } = await supabase.from("staff").insert([
        { name: newStaff.trim(), terminal: String(terminal) }
      ]).select();
      console.log('Add staff result:', data, 'Error:', error);
      if (!error && data && data.length > 0) {
        setStaff([...staff, { ...data[0], hours: 0, shifts: Array(7).fill("") }]);
        setNewStaff("");
      }
    }
  };

  const handleRemoveStaff = (person: Staff) => {
    setStaffToRemove(person);
    setShowModal(true);
  };

  const confirmRemoveStaff = async () => {
    if (!staffToRemove) return;
    
    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', staffToRemove.id);

      if (error) throw error;

      setStaff(staff.filter(p => p.id !== staffToRemove.id));
      setShowModal(false);
      setStaffToRemove(null);
    } catch (error) {
      console.error('Error removing staff:', error);
    }
  };

  const cancelRemoveStaff = () => {
    setShowModal(false);
    setStaffToRemove(null);
  };

  const handleSaveLocally = async () => {
    setIsSaving(true);
    try {
      // Save all shifts to draft columns in database
      for (const person of staff) {
        const updates: Record<string, string | null> = {};
        days.forEach((day, index) => {
          const dayColumn = `draft_${day.toLowerCase()}`;
          updates[dayColumn] = person.shifts[index] || null;
        });
        
        const { error } = await supabase
          .from('staff')
          .update(updates)
          .eq('id', person.id);

        if (error) throw error;
      }
      
      setHasUnsavedChanges(false);
      console.log('Changes saved locally');
    } catch (error) {
      console.error('Error saving locally:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishChanges = async () => {
    setIsPublishing(true);
    try {
      // Copy draft changes to published columns
      for (const person of staff) {
        const updates: Record<string, string | null> = {};
        days.forEach((day, index) => {
          const dayColumn = day.toLowerCase();
          const draftColumn = `draft_${day.toLowerCase()}`;
          updates[dayColumn] = person.shifts[index] || null;
          updates[draftColumn] = person.shifts[index] || null; // Keep draft in sync
        });
        
        const { error } = await supabase
          .from('staff')
          .update(updates)
          .eq('id', person.id);

        if (error) throw error;
      }
      
      setHasUnsavedChanges(false);
      console.log('Changes published successfully');
    } catch (error) {
      console.error('Error publishing changes:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading || !isAuthorized) {
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
              <h2 className="text-xl sm:text-2xl font-bold text-pink-600 tracking-wide">Manager Dashboard</h2>
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
                onClick={() => router.push(`/manager-dashboard/${t}`)}
                className={`w-full text-left px-4 sm:px-5 py-3 rounded-xl hover:bg-pink-100/50 text-pink-600 font-medium text-base sm:text-lg transition-all duration-300 flex items-center gap-3 group hover:translate-x-1 hover:shadow-md ${t === terminal ? 'bg-pink-100/50 shadow-md' : ''}`}
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 sm:mb-10 gap-4 sm:gap-6">
          <h1 className="playfair text-3xl sm:text-4xl md:text-5xl font-extrabold text-pink-600 tracking-widest drop-shadow-sm text-center md:text-left" style={{ letterSpacing: "0.15em" }}>ACCESSORIZE</h1>
          <div className="text-center md:text-right">
            <span className="font-semibold text-pink-700 text-base sm:text-lg">Terminal {terminal}</span>
            {/* Debug: Show unsaved changes state */}
            <div className="text-sm text-red-600 font-bold">
              DEBUG: hasUnsavedChanges = {hasUnsavedChanges ? 'TRUE' : 'FALSE'}
            </div>
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
                    <th key={day} className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3 font-bold">{day}</th>
                  ))}
                  <th className="border-b border-pink-100 w-10"></th>
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
                    <td className="border-b border-pink-100 px-1 py-2 sm:py-3 w-14 text-center">{Number.isInteger(person.hours) ? person.hours : person.hours.toFixed(1)}</td>
                    {days.map((day, d) => (
                      <td key={day} className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3">
                        <input
                          type="text"
                          value={person.shifts[d]}
                          onChange={(e) => handleShiftChange(person, d, e.target.value)}
                          placeholder="--:--"
                          className="w-full px-1.5 py-1 rounded-lg border border-pink-200 placeholder-red-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors text-xs"
                        />
                      </td>
                    ))}
                    <td className="border-b border-pink-100 px-1 py-2 sm:py-3 w-10">
                      <button
                        onClick={() => handleRemoveStaff(person)}
                        className="text-pink-500 hover:text-pink-700 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={newStaff}
            onChange={(e) => setNewStaff(e.target.value)}
            placeholder="Enter staff name"
            className="flex-1 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-pink-200 placeholder-pink-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors"
          />
          <button
            onClick={handleAddStaff}
            className="px-6 py-2 sm:py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm sm:text-base font-medium"
          >
            Add Staff
          </button>
        </div>


      </div>

      {/* Floating Notification Bar for Unsaved Changes */}
      {hasUnsavedChanges && (
        <div 
          className="fixed bottom-0 left-0 right-0 text-white border-t-4 border-red-600"
          style={{
            background: 'linear-gradient(to right, #f97316, #dc2626)',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.3)',
            zIndex: 9999
          }}
        >
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div 
                  className="rounded-full p-2 flex-shrink-0"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-lg">⚠️ Unsaved Changes</p>
                  <p className="text-sm" style={{ opacity: 0.9 }}>Save locally or publish to make changes visible to staff</p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleSaveLocally}
                  disabled={isSaving}
                  className="px-6 py-2.5 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors duration-200"
                  style={{
                    backgroundColor: isSaving ? '#9ca3af' : '#2563eb',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    cursor: isSaving ? 'not-allowed' : 'pointer'
                  }}
                  onMouseOver={(e) => {
                    if (!isSaving) {
                      e.currentTarget.style.backgroundColor = '#1d4ed8';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSaving) {
                      e.currentTarget.style.backgroundColor = '#2563eb';
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                      </svg>
                      Save Locally
                    </>
                  )}
                </button>
                
                <button
                  onClick={handlePublishChanges}
                  disabled={isPublishing}
                  className="px-6 py-2.5 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors duration-200"
                  style={{
                    backgroundColor: isPublishing ? '#9ca3af' : '#16a34a',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    cursor: isPublishing ? 'not-allowed' : 'pointer'
                  }}
                  onMouseOver={(e) => {
                    if (!isPublishing) {
                      e.currentTarget.style.backgroundColor = '#15803d';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isPublishing) {
                      e.currentTarget.style.backgroundColor = '#16a34a';
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  {isPublishing ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                      Publishing...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                      </svg>
                      Publish Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && staffToRemove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full">
            <h3 className="text-xl sm:text-2xl font-bold text-pink-600 mb-4">Remove Staff</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to remove {staffToRemove.name}?</p>
            <div className="flex gap-4">
              <button
                onClick={confirmRemoveStaff}
                className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm sm:text-base"
              >
                Remove
              </button>
              <button
                onClick={cancelRemoveStaff}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 