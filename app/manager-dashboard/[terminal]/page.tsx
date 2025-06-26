"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from 'next/image';
import Confetti from 'react-confetti';

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Helper functions for week navigation
const getSunday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Sunday is day 0, so subtract current day to get to Sunday
  return new Date(d.setDate(diff));
};

const getWeekNumber = (date: Date): number => {
  // Custom week numbering system aligned with workplace
  // Currently week 43, going to week 44 this Sunday
  // Week runs Sunday-Saturday
  
  // Define the reference point - when the current system was at week 43
  const today = new Date();
  const currentSunday = getSunday(today);
  const targetSunday = getSunday(date);
  
  // Calculate difference in weeks between target date and today
  const daysDiff = Math.floor((targetSunday.getTime() - currentSunday.getTime()) / (24 * 60 * 60 * 1000));
  const weeksDiff = Math.round(daysDiff / 7);
  
  // Current week is 43, calculate target week relative to that
  let weekNumber = 43 + weeksDiff;
  
  // Handle year transitions (weeks 1-53)
  if (weekNumber > 53) {
    weekNumber = ((weekNumber - 1) % 53) + 1;
  } else if (weekNumber < 1) {
    weekNumber = 53 + ((weekNumber % 53) || 0);
  }
  
  return weekNumber;
};

interface Staff {
  id: string;
  name: string;
  role: string;
  shifts: string[];
  publishedShifts: string[];
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
  const [newStaffRole, setNewStaffRole] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState<Staff | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<Date>(new Date());
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Track unsaved changes across all weeks
  const [unsavedWeeks, setUnsavedWeeks] = useState<Map<string, Staff[]>>(new Map());
  
  // Use ref to access current unsavedWeeks without triggering effects
  const unsavedWeeksRef = useRef<Map<string, Staff[]>>(new Map());
  
  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Confetti animation state
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });
  
  // Flag to prevent checking for unsaved changes when loading data
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Helper functions defined before callbacks that use them
  const getCurrentSundayDate = useCallback((): string => {
    const sunday = getSunday(selectedWeek);
    return sunday.toISOString().split('T')[0];
  }, [selectedWeek]);

  const isCurrentWeek = useCallback((): boolean => {
    const today = new Date();
    const currentSunday = getSunday(today);
    const selectedSunday = getSunday(selectedWeek);
    return currentSunday.toDateString() === selectedSunday.toDateString();
  }, [selectedWeek]);

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
    
    // Apply break rules:
    // - 6.5 hours: 30 minute break (0.5 hours)
    // - More than 6 hours: 1 hour break
    // - 6 hours or less: no break
    if (totalHours === 6.5) {
      return totalHours - 0.5;
    } else if (totalHours > 6) {
      return totalHours - 1;
    } else {
      return totalHours;
    }
  }, []);

  const checkForUnsavedChanges = useCallback(() => {
    const hasChanges = staff.some(person => 
      person.shifts.some((shift, index) => shift !== person.publishedShifts[index])
    );
    setHasUnsavedChanges(hasChanges);
    
    // Update unsavedWeeks if there are changes
    if (hasChanges) {
      const weekKey = getCurrentSundayDate();
      console.log(`Updating unsaved changes for week: ${weekKey}`);
      setUnsavedWeeks(prev => {
        const newMap = new Map(prev);
        newMap.set(weekKey, staff);
        console.log(`All unsaved weeks:`, Array.from(newMap.keys()));
        return newMap;
      });
    }
  }, [staff, getCurrentSundayDate]);

  const loadWeekData = useCallback(async (skipLocalCheck = false, currentUnsavedWeeks?: Map<string, Staff[]>) => {
    try {
      setIsLoadingData(true);
      const weekStartDate = getCurrentSundayDate();
      
      // Check if we have locally stored changes for this week first (unless skipped)
      if (!skipLocalCheck && currentUnsavedWeeks) {
        const localChanges = currentUnsavedWeeks.get(weekStartDate);
        if (localChanges) {
          console.log(`Loading locally stored changes for week: ${weekStartDate}`);
          console.log(`Available unsaved weeks:`, Array.from(currentUnsavedWeeks.keys()));
          setStaff(localChanges);
          setIsLoadingData(false);
          return;
        }
      }
      
      console.log(`Loading fresh data from database for week: ${weekStartDate}`);
      
      // Get all staff for this terminal, try to order by display_order, fallback to id
      const { data: staffData } = await supabase
        .from("staff")
        .select("*")
        .eq("terminal", String(terminal));

      if (!staffData) return;

      // Sort staff by display_order if available, otherwise by id
      const sortedStaffData = staffData.sort((a, b) => {
        if (a.display_order !== null && b.display_order !== null) {
          return a.display_order - b.display_order;
        }
        // Fallback to sorting by id if display_order is not available
        return parseInt(a.id) - parseInt(b.id);
      });

      if (isCurrentWeek()) {
        // Current week: data is in staff table
        const staffWithShifts = sortedStaffData.map(person => {
          const shifts = days.map(day => {
            const dayLower = day.toLowerCase();
            const draftColumn = `draft_${dayLower}`;
            const publishedColumn = dayLower;
            return person[draftColumn] || person[publishedColumn] || '';
          });

          const publishedShifts = days.map(day => {
            const dayLower = day.toLowerCase();
            return person[dayLower] || '';
          });
          
          const totalHours = shifts.reduce((sum: number, shift) => sum + calculateHours(shift), 0);
          return {
            ...person,
            shifts,
            publishedShifts,
            hours: totalHours
          };
        });

        setStaff(staffWithShifts);
      } else {
        // Past or future week: data is in weekly_schedules table
        const { data: weeklySchedules } = await supabase
          .from("weekly_schedules")
          .select("*")
          .eq("week_starting_date", weekStartDate)
          .in("staff_id", staffData.map(s => parseInt(s.id)));

        const staffWithShifts = sortedStaffData.map(person => {
          const weeklySchedule = weeklySchedules?.find(ws => ws.staff_id === parseInt(person.id));
          
          const shifts = days.map(day => {
            const dayLower = day.toLowerCase();
            if (weeklySchedule) {
              // Use draft data if available, otherwise use published data
              return weeklySchedule[`draft_${dayLower}`] || weeklySchedule[dayLower] || '';
            }
            return '';
          });

          const publishedShifts = days.map(day => {
            const dayLower = day.toLowerCase();
            if (weeklySchedule) {
              return weeklySchedule[dayLower] || '';
            }
            return '';
          });
          
          const totalHours = shifts.reduce((sum: number, shift) => sum + calculateHours(shift), 0);
          return {
            ...person,
            shifts,
            publishedShifts,
            hours: totalHours
          };
        });

        setStaff(staffWithShifts);
      }
    } catch (error) {
      console.error('Error loading week data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, [terminal, getCurrentSundayDate, isCurrentWeek, calculateHours]);

  // Separate function to load data when week changes (checks for local changes)
  const loadWeekDataWithLocalCheck = useCallback(async () => {
    // Use ref to get current unsavedWeeks to avoid dependency
    await loadWeekData(false, unsavedWeeksRef.current);
  }, [loadWeekData]); // Removed unsavedWeeks from dependencies to break circular loop

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

          // Load staff data for the selected week
          await loadWeekData(true); // Skip local check on initial load
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router, terminal, loadWeekData]);

  // Load data when selected week changes
  useEffect(() => {
    if (isAuthorized) {
      loadWeekDataWithLocalCheck();
    }
  }, [selectedWeek, isAuthorized, loadWeekDataWithLocalCheck]);

  // Check for unsaved changes after loading data - but only when not actively editing
  useEffect(() => {
    if (!isLoadingData) {
      checkForUnsavedChanges();
    }
  }, [staff, checkForUnsavedChanges, isLoadingData]);

  // Handle window dimensions for confetti
  useEffect(() => {
    const updateWindowDimensions = () => {
      setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
    };

    updateWindowDimensions();
    window.addEventListener('resize', updateWindowDimensions);

    return () => window.removeEventListener('resize', updateWindowDimensions);
  }, []);

  // Keep ref in sync with state
  useEffect(() => {
    unsavedWeeksRef.current = unsavedWeeks;
  }, [unsavedWeeks]);

  const triggerConfetti = () => {
    setShowConfetti(true);
    // Stop confetti after 3 seconds
    setTimeout(() => {
      setShowConfetti(false);
    }, 3000);
  };

  const scanForUnsavedWeeks = async (weeksToPublish: Map<string, Staff[]>) => {
    try {
      // Get all staff for this terminal
      const { data: allStaff } = await supabase
        .from("staff")
        .select("*")
        .eq("terminal", String(terminal));

      if (!allStaff) return;

      // Check current week for draft vs published differences
      const today = new Date();
      const currentSunday = getSunday(today);
      const currentWeekKey = currentSunday.toISOString().split('T')[0];

      const currentWeekHasChanges = allStaff.some(person => {
        return days.some(day => {
          const dayLower = day.toLowerCase();
          const draftColumn = `draft_${dayLower}`;
          const publishedColumn = dayLower;
          return (person[draftColumn] || '') !== (person[publishedColumn] || '');
        });
      });

      if (currentWeekHasChanges && !weeksToPublish.has(currentWeekKey)) {
        // Load current week data with draft changes
        const staffWithDraftChanges = allStaff.map(person => {
          const shifts = days.map(day => {
            const dayLower = day.toLowerCase();
            const draftColumn = `draft_${dayLower}`;
            return person[draftColumn] || person[dayLower] || '';
          });
          
          const publishedShifts = days.map(day => {
            const dayLower = day.toLowerCase();
            return person[dayLower] || '';
          });
          
          const totalHours = shifts.reduce((sum, shift) => sum + calculateHours(shift), 0);
          return {
            ...person,
            shifts,
            publishedShifts,
            hours: totalHours
          };
        });
        
        weeksToPublish.set(currentWeekKey, staffWithDraftChanges);
      }

      // Check weekly_schedules for other weeks with draft vs published differences
      const { data: weeklySchedules } = await supabase
        .from("weekly_schedules")
        .select("*")
        .in("staff_id", allStaff.map(s => parseInt(s.id)));

      if (weeklySchedules) {
        // Group by week
        const weekGroups = new Map<string, Record<string, string | number>[]>();
        weeklySchedules.forEach(schedule => {
          const weekKey = schedule.week_starting_date;
          if (!weekGroups.has(weekKey)) {
            weekGroups.set(weekKey, []);
          }
          weekGroups.get(weekKey)!.push(schedule);
        });

        // Check each week for draft vs published differences
        for (const [weekKey, schedules] of weekGroups.entries()) {
          if (weeksToPublish.has(weekKey)) continue; // Already included

          const weekHasChanges = schedules.some(schedule => {
            return days.some(day => {
              const dayLower = day.toLowerCase();
              const draftColumn = `draft_${dayLower}`;
              const publishedColumn = dayLower;
              return (schedule[draftColumn] || '') !== (schedule[publishedColumn] || '');
            });
          });

          if (weekHasChanges) {
            // Build staff array for this week
            const weekStaff = allStaff.map(person => {
              const schedule = schedules.find(s => s.staff_id === parseInt(person.id));
              
              const shifts = days.map(day => {
                const dayLower = day.toLowerCase();
                const draftColumn = `draft_${dayLower}`;
                if (schedule) {
                  return schedule[draftColumn] || schedule[dayLower] || '';
                }
                return '';
              });

              const publishedShifts = days.map(day => {
                const dayLower = day.toLowerCase();
                if (schedule) {
                  return schedule[dayLower] || '';
                }
                return '';
              });
              
              const totalHours = shifts.reduce((sum: number, shift) => sum + calculateHours(String(shift)), 0);
              return {
                ...person,
                shifts,
                publishedShifts,
                hours: totalHours
              };
            });
            
            weeksToPublish.set(weekKey, weekStaff);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning for unsaved weeks:', error);
    }
  };

  const handleShiftChange = useCallback((person: Staff, dayIndex: number, value: string) => {
    // Update local state only (don't save to database automatically)
    setStaff(prevStaff => {
      return prevStaff.map(p => {
        if (p.id === person.id) {
          const newShifts = [...p.shifts];
          newShifts[dayIndex] = value;
          const totalHours = newShifts.reduce((sum: number, shift) => sum + calculateHours(shift), 0);
          return { ...p, shifts: newShifts, hours: totalHours };
        }
        return p;
      });
    });
    
    setHasUnsavedChanges(true);
  }, [calculateHours]);

  const handleAddStaff = async () => {
    if (newStaff.trim()) {
      // Get the highest display_order for this terminal
      const maxOrder = staff.length > 0 ? Math.max(...staff.map((_, index) => index)) + 1 : 0;
      
      // Try to insert with display_order, fallback without it if column doesn't exist
      const insertData: Record<string, string | number> = { 
        name: newStaff.trim(), 
        role: newStaffRole.trim() || 'Staff', // Default to 'Staff' if no role provided
        terminal: String(terminal)
      };
      
      // Try to add display_order if possible
      try {
        insertData.display_order = maxOrder;
        const { data, error } = await supabase.from("staff").insert([insertData]).select();
        
        if (error && error.message?.includes('column "display_order" does not exist')) {
          // Retry without display_order
          delete insertData.display_order;
          const { data: retryData, error: retryError } = await supabase.from("staff").insert([insertData]).select();
          console.log('Add staff result (without display_order):', retryData, 'Error:', retryError);
          if (!retryError && retryData && retryData.length > 0) {
            setStaff([...staff, { ...retryData[0], hours: 0, shifts: Array(7).fill(""), publishedShifts: Array(7).fill("") }]);
            setNewStaff("");
            setNewStaffRole("");
          }
        } else {
          console.log('Add staff result:', data, 'Error:', error);
          if (!error && data && data.length > 0) {
            setStaff([...staff, { ...data[0], hours: 0, shifts: Array(7).fill(""), publishedShifts: Array(7).fill("") }]);
            setNewStaff("");
            setNewStaffRole("");
          }
        }
      } catch (error) {
        console.error('Error adding staff:', error);
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
      
      // Trigger confetti animation
      triggerConfetti();
    } catch (error) {
      console.error('Error removing staff:', error);
    }
  };

  const cancelRemoveStaff = () => {
    setShowModal(false);
    setStaffToRemove(null);
  };

  const handlePublishClick = () => {
    setShowPublishModal(true);
  };

  const confirmPublish = async () => {
    setShowPublishModal(false);
    await handlePublishChanges();
  };

  const cancelPublish = () => {
    setShowPublishModal(false);
  };

  const handleClearAllClick = () => {
    setShowClearModal(true);
  };

  const confirmClearAll = async () => {
    setIsClearing(true);
    try {
      const weekStartDate = getCurrentSundayDate();
      console.log('Clearing shifts for week:', weekStartDate);
      console.log('Is current week:', isCurrentWeek());
      console.log('Staff count:', staff.length);
      
      for (const person of staff) {
        console.log(`Clearing shifts for: ${person.name} (ID: ${person.id})`);
        
        if (isCurrentWeek()) {
          // Current week: clear from staff table
          const clearUpdates: Record<string, null> = {};
          days.forEach((day) => {
            const dayColumn = day.toLowerCase();
            const draftColumn = `draft_${day.toLowerCase()}`;
            clearUpdates[dayColumn] = null; // Clear published
            clearUpdates[draftColumn] = null; // Clear draft
          });
          
          const { error } = await supabase
            .from('staff')
            .update(clearUpdates)
            .eq('id', person.id);
          
          if (error) {
            console.error(`Error clearing staff table for ${person.name}:`, error);
            throw error;
          } else {
            console.log(`Successfully cleared staff table for ${person.name}`);
          }
        } else {
          // Future/past week: clear from weekly_schedules table
          console.log(`Deleting from weekly_schedules for staff_id: ${person.id}, week: ${weekStartDate}`);
          
          const { data: existingData, error: checkError } = await supabase
            .from('weekly_schedules')
            .select('*')
            .eq('staff_id', parseInt(person.id))
            .eq('week_starting_date', weekStartDate);
          
          if (checkError) {
            console.error(`Error checking existing data for ${person.name}:`, checkError);
          } else {
            console.log(`Found ${existingData?.length || 0} existing records for ${person.name}`);
          }
          
          const { error: deleteError, count } = await supabase
            .from('weekly_schedules')
            .delete({ count: 'exact' })
            .eq('staff_id', parseInt(person.id))
            .eq('week_starting_date', weekStartDate);
          
          if (deleteError) {
            console.error(`Error deleting weekly schedule for ${person.name}:`, deleteError);
          } else {
            console.log(`Successfully deleted ${count || 0} records for ${person.name}`);
          }
        }
      }
      
      // Update local state to reflect cleared shifts
      const clearedStaff = staff.map(person => ({
        ...person,
        shifts: Array(7).fill(''),
        publishedShifts: Array(7).fill(''),
        hours: 0
      }));
      setStaff(clearedStaff);
      
      setHasUnsavedChanges(false);
      setShowClearModal(false);
      console.log('All shifts cleared successfully');
    } catch (error) {
      console.error('Error clearing shifts:', error);
      alert('Error clearing shifts. Please check the console for details.');
    } finally {
      setIsClearing(false);
    }
  };

  const cancelClearAll = () => {
    setShowClearModal(false);
  };

  const handleSaveLocally = async () => {
    setIsSaving(true);
    try {
      console.log('Saving all changes locally...');
      
      // Get all weeks to save (current week + any unsaved weeks)
      const weeksToSave = new Map<string, Staff[]>();
      
      // Always include current week if it has changes
      const currentWeekKey = getCurrentSundayDate();
      if (hasUnsavedChanges) {
        weeksToSave.set(currentWeekKey, staff);
      }
      
      // Add any weeks from unsavedWeeks state
      for (const [weekKey, weekStaff] of unsavedWeeks.entries()) {
        weeksToSave.set(weekKey, weekStaff);
      }
      
      console.log('Total weeks to save locally:', weeksToSave.size);
      
      // Save each week
      for (const [weekStartDate, weekStaff] of weeksToSave.entries()) {
        console.log(`Saving week locally: ${weekStartDate}`);
        
        // Determine if this week is the current week
        const today = new Date();
        const currentSunday = getSunday(today);
        const weekDate = new Date(weekStartDate);
        const isThisCurrentWeek = currentSunday.toDateString() === weekDate.toDateString();
        
        for (const person of weekStaff) {
          const updates: Record<string, string | null> = {};
          days.forEach((day, index) => {
            const dayColumn = `draft_${day.toLowerCase()}`;
            updates[dayColumn] = person.shifts[index] || null;
          });
          
          if (isThisCurrentWeek) {
            // Current week: save to staff table
            const { error } = await supabase
              .from('staff')
              .update(updates)
              .eq('id', person.id);
            if (error) {
              console.error(`Error saving to staff table for ${person.name}:`, error);
              throw error;
            }
          } else {
            // Future/past week: save to weekly_schedules table
            const { error } = await supabase
              .from('weekly_schedules')
              .upsert({
                staff_id: parseInt(person.id),
                week_starting_date: weekStartDate,
                ...updates
              }, {
                onConflict: 'staff_id,week_starting_date'
              });
            if (error) {
              console.error(`Error saving to weekly_schedules for ${person.name}:`, error);
              throw error;
            }
          }
        }
        console.log(`Successfully saved week locally: ${weekStartDate}`);
      }
      
      // Don't clear unsaved changes state - keep them for publishing later
      console.log(`Successfully saved ${weeksToSave.size} week(s) locally`);
      alert(`Successfully saved ${weeksToSave.size} week(s) locally! Changes are saved as drafts and can be published later.`);
    } catch (error) {
      console.error('Error saving data locally:', error);
      alert('Error saving data locally. Please check the console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishChanges = async () => {
    setIsPublishing(true);
    try {
      console.log('Publishing changes for all weeks with unsaved data...');
      
      // Scan for all weeks with unsaved changes by checking all terminals
      const weeksToPublish = new Map<string, Staff[]>();
      
      // Always include current week if it has changes
      const currentWeekKey = getCurrentSundayDate();
      if (hasUnsavedChanges) {
        weeksToPublish.set(currentWeekKey, staff);
      }
      
      // Add any weeks from unsavedWeeks state (for when user navigated between weeks)
      for (const [weekKey, weekStaff] of unsavedWeeks.entries()) {
        weeksToPublish.set(weekKey, weekStaff);
      }
      
      // Additionally, scan for weeks with draft data that differs from published data
      await scanForUnsavedWeeks(weeksToPublish);
      
      console.log('Total weeks to publish:', weeksToPublish.size);
      
      // Publish each week
      for (const [weekStartDate, weekStaff] of weeksToPublish.entries()) {
        console.log(`Publishing week: ${weekStartDate}`);
        
        // Determine if this week is the current week
        const today = new Date();
        const currentSunday = getSunday(today);
        const weekDate = new Date(weekStartDate);
        const isThisCurrentWeek = currentSunday.toDateString() === weekDate.toDateString();
        
        for (const person of weekStaff) {
          const updates: Record<string, string | null> = {};
          days.forEach((day, index) => {
            const dayColumn = day.toLowerCase();
            const draftColumn = `draft_${day.toLowerCase()}`;
            updates[dayColumn] = person.shifts[index] || null;
            updates[draftColumn] = person.shifts[index] || null; // Keep draft in sync
          });
          
          if (isThisCurrentWeek) {
            // Current week: publish to staff table
            const { error } = await supabase
              .from('staff')
              .update(updates)
              .eq('id', person.id);
            if (error) {
              console.error(`Error publishing to staff table for ${person.name}:`, error);
              throw error;
            }
          } else {
            // Future/past week: publish to weekly_schedules table
            const { error } = await supabase
              .from('weekly_schedules')
              .upsert({
                staff_id: parseInt(person.id),
                week_starting_date: weekStartDate,
                ...updates
              }, {
                onConflict: 'staff_id,week_starting_date'
              });
            if (error) {
              console.error(`Error publishing to weekly_schedules for ${person.name}:`, error);
              throw error;
            }
          }
        }
        console.log(`Successfully published week: ${weekStartDate}`);
      }
      
      // Update local publishedShifts state for currently viewed week
      const updatedStaff = staff.map(person => ({
        ...person,
        publishedShifts: [...person.shifts]
      }));
      setStaff(updatedStaff);
      
      // Clear all unsaved changes
      setUnsavedWeeks(new Map());
      setHasUnsavedChanges(false);
      
      console.log(`Successfully published changes for ${weeksToPublish.size} week(s)`);
      alert(`Successfully published changes for ${weeksToPublish.size} week(s)!`);
      
      // Trigger confetti animation
      triggerConfetti();
    } catch (error) {
      console.error('Error publishing changes:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      alert('Error publishing changes. Please check the console for details.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePreviousWeek = () => {
    // Save current week's changes before switching
    if (hasUnsavedChanges) {
      const weekKey = getCurrentSundayDate();
      console.log(`Saving changes for current week before switching: ${weekKey}`);
      setUnsavedWeeks(prev => {
        const newMap = new Map(prev);
        newMap.set(weekKey, staff);
        console.log(`Unsaved weeks after saving:`, Array.from(newMap.keys()));
        return newMap;
      });
    }
    
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(selectedWeek.getDate() - 7);
    console.log(`Switching from ${selectedWeek.toISOString().split('T')[0]} to ${newWeek.toISOString().split('T')[0]}`);
    
    // Clear current staff data to prevent stale data from showing
    setStaff([]);
    setSelectedWeek(newWeek);
    setHasUnsavedChanges(false); // Reset for new week
  };

  const handleNextWeek = () => {
    // Save current week's changes before switching
    if (hasUnsavedChanges) {
      const weekKey = getCurrentSundayDate();
      console.log(`Saving changes for current week before switching: ${weekKey}`);
      setUnsavedWeeks(prev => {
        const newMap = new Map(prev);
        newMap.set(weekKey, staff);
        console.log(`Unsaved weeks after saving:`, Array.from(newMap.keys()));
        return newMap;
      });
    }
    
    const newWeek = new Date(selectedWeek);
    newWeek.setDate(selectedWeek.getDate() + 7);
    console.log(`Switching from ${selectedWeek.toISOString().split('T')[0]} to ${newWeek.toISOString().split('T')[0]}`);
    
    // Clear current staff data to prevent stale data from showing
    setStaff([]);
    setSelectedWeek(newWeek);
    setHasUnsavedChanges(false); // Reset for new week
  };

  const handleCurrentWeek = () => {
    // Save current week's changes before switching
    if (hasUnsavedChanges) {
      const weekKey = getCurrentSundayDate();
      setUnsavedWeeks(prev => {
        const newMap = new Map(prev);
        newMap.set(weekKey, staff);
        return newMap;
      });
    }
    
    // Clear current staff data to prevent stale data from showing
    setStaff([]);
    setSelectedWeek(new Date());
    setHasUnsavedChanges(false); // Reset for new week
  };

  const getDateForDay = (dayIndex: number): string => {
    const sunday = getSunday(selectedWeek);
    const date = new Date(sunday);
    date.setDate(sunday.getDate() + dayIndex);
    
    const day = date.getDate();
    const month = date.toLocaleString('en-GB', { month: 'short' });
    return `${day}-${month}`;
  };



  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      return;
    }

    const newStaff = [...staff];
    const draggedItem = newStaff[draggedIndex];
    
    // Remove the dragged item
    newStaff.splice(draggedIndex, 1);
    
    // Insert at the new position
    newStaff.splice(dropIndex, 0, draggedItem);
    
    setStaff(newStaff);
    setDraggedIndex(null);
    
    // Save the new order to the database
    saveStaffOrder(newStaff);
  };

  const saveStaffOrder = async (orderedStaff: Staff[]) => {
    try {
      // Update the display_order for each staff member
      const updates = orderedStaff.map((person, index) => ({
        id: person.id,
        display_order: index
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('staff')
          .update({ display_order: update.display_order })
          .eq('id', update.id);
        
        if (error) {
          console.error('Error updating staff order:', error);
          // If the column doesn't exist, we'll just skip reordering for now
          if (error.message?.includes('column "display_order" does not exist')) {
            console.log('Display order column does not exist. Please add it manually in Supabase dashboard.');
            console.log('SQL to run: ALTER TABLE staff ADD COLUMN display_order INTEGER;');
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error saving staff order:', error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  useEffect(() => {
    loadWeekData();
    
    // Check for migration changes every 30 seconds when on current week
    const interval = setInterval(() => {
      if (isCurrentWeek()) {
        loadWeekData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [selectedWeek, loadWeekData, isCurrentWeek]);

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

      <div className="max-w-6xl mx-auto bg-white/90 sm:rounded-3xl shadow-xl sm:shadow-2xl p-4 sm:p-8 md:p-12">
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

          {/* Terminal */}
          <div className="flex justify-center lg:justify-end">
            <span className="font-semibold text-pink-700 text-xl">Terminal {terminal}</span>
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
                  {days.map((day, index) => (
                    <th key={day} className="border-b border-pink-100 px-1 sm:px-2 py-2 sm:py-3 font-bold">
                      <div className="text-center">
                        <div>{day}</div>
                        <div className="text-xs font-normal text-pink-600">{getDateForDay(index)}</div>
                      </div>
                    </th>
                  ))}
                  <th className="border-b border-pink-100 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((person, index) => (
                  <tr 
                    key={person.id} 
                    className={`cursor-move ${draggedIndex === index ? 'opacity-50' : ''} ${
                      index % 2 === 0 
                        ? 'bg-white' 
                        : 'bg-pink-50'
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    <td className="border-b border-pink-100 px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex items-center gap-2">
                        <div className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                          </svg>
                        </div>
                        <div>
                          <div>{person.name}</div>
                          <div className="text-xs text-gray-500">{person.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-pink-100 px-1 py-2 sm:py-3 w-14 text-center">{Number.isInteger(person.hours) ? person.hours : person.hours.toFixed(1)}</td>
                    {days.map((day, d) => {
                      const hasChanges = person.shifts[d] !== person.publishedShifts[d];
                      return (
                        <td key={day} className="border-b border-pink-100 px-1 sm:px-2 py-2 sm:py-3">
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="text"
                              value={person.shifts[d] || ''}
                              onChange={(e) => handleShiftChange(person, d, e.target.value)}
                              placeholder=""
                              className={`px-1 py-1 rounded-lg border placeholder-red-400 text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent transition-colors text-xs text-center ${
                                hasChanges 
                                  ? 'border-orange-400 bg-orange-50 focus:ring-orange-500' 
                                  : 'border-pink-200 bg-white focus:ring-pink-500'
                              }`}
                              style={{
                                width: Math.max((person.shifts[d] || '').length * 8 + 16, 50) + 'px',
                                minWidth: '50px'
                              }}
                            />
                            {person.shifts[d] && person.shifts[d].includes('-') && (
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                ({(() => {
                                  const hours = calculateHours(person.shifts[d]);
                                  return hours % 1 === 0 ? `${hours}h` : `${Math.round(hours * 2) / 2}h`;
                                })()})
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
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
            className="flex-1 sm:flex-none sm:w-48 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-pink-200 placeholder-pink-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors"
          />
          <input
            type="text"
            value={newStaffRole}
            onChange={(e) => setNewStaffRole(e.target.value)}
            placeholder="Enter role"
            className="flex-1 sm:flex-none sm:w-40 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-pink-200 placeholder-pink-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors"
          />
          <button
            onClick={handleAddStaff}
            className="px-6 py-2 sm:py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm sm:text-base font-medium"
          >
            Add Staff
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <button
            onClick={handleSaveLocally}
            disabled={isSaving}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 text-base shadow-lg"
          >
            {isSaving ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
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
            onClick={handlePublishClick}
            disabled={isPublishing}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 text-base shadow-lg"
          >
            {isPublishing ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                Publishing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                {unsavedWeeks.size > 0 || hasUnsavedChanges ? 
                  `Publish Changes (${unsavedWeeks.size + (hasUnsavedChanges && !unsavedWeeks.has(getCurrentSundayDate()) ? 1 : 0)} week${unsavedWeeks.size + (hasUnsavedChanges && !unsavedWeeks.has(getCurrentSundayDate()) ? 1 : 0) === 1 ? '' : 's'})` 
                  : 'Publish Changes'}
              </>
            )}
          </button>
          
          <button
            onClick={handleClearAllClick}
            disabled={isClearing}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200 flex items-center gap-2 text-base shadow-lg"
          >
            {isClearing ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                Clearing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Clear All Shifts
              </>
            )}
          </button>
        </div>


      </div>



      {showModal && staffToRemove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
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

      {/* Publish Confirmation Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full">
            <h3 className="text-xl sm:text-2xl font-bold text-green-600 mb-4">Publish Changes</h3>
            <div className="mb-6">
              <p className="text-gray-600 mb-3">Are you sure you want to publish these changes?</p>
              <p className="text-sm text-gray-500">
                This will publish changes for {unsavedWeeks.size + (hasUnsavedChanges && !unsavedWeeks.has(getCurrentSundayDate()) ? 1 : 0)} week{unsavedWeeks.size + (hasUnsavedChanges && !unsavedWeeks.has(getCurrentSundayDate()) ? 1 : 0) === 1 ? '' : 's'} and make them visible to staff members.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={confirmPublish}
                disabled={isPublishing}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm sm:text-base flex items-center justify-center gap-2"
              >
                {isPublishing ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Publishing...
                  </>
                ) : (
                  'Publish'
                )}
              </button>
              <button
                onClick={cancelPublish}
                disabled={isPublishing}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full">
            <h3 className="text-xl sm:text-2xl font-bold text-red-600 mb-4">Clear All Shifts</h3>
            <div className="mb-6">
              <p className="text-gray-600 mb-3">⚠️ Are you sure you want to clear ALL shifts for this week?</p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 font-medium mb-1">This action will:</p>
                <ul className="text-sm text-red-600 list-disc list-inside space-y-1">
                  <li>Clear all draft (unsaved) shifts</li>
                  <li>Clear all published shifts</li>
                  <li>Remove all shift data from the database</li>
                </ul>
                <p className="text-sm text-red-700 font-medium mt-2">This cannot be undone!</p>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={confirmClearAll}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm sm:text-base flex items-center justify-center gap-2"
              >
                {isClearing ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    Clearing...
                  </>
                ) : (
                  'Clear All'
                )}
              </button>
              <button
                onClick={cancelClearAll}
                disabled={isClearing}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confetti Animation */}
      {showConfetti && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          recycle={false}
          numberOfPieces={200}
          colors={['#ec4899', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6']}
        />
      )}
    </div>
  );
} 