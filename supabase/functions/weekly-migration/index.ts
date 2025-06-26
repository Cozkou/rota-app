import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Starting weekly migration...')

    // Get current Sunday date (week starts on Sunday)
    const today = new Date()
    const currentSunday = getSunday(today)
    const currentWeekStart = currentSunday.toISOString().split('T')[0]

    // Get next Sunday date (the week that should become current)
    const nextSunday = new Date(currentSunday)
    nextSunday.setDate(currentSunday.getDate() + 7)
    const nextWeekStart = nextSunday.toISOString().split('T')[0]

    console.log('Current week start:', currentWeekStart)
    console.log('Next week start (becoming current):', nextWeekStart)

    // Step 1: Archive current week data from staff table to weekly_schedules
    console.log('Step 1: Archiving current week data...')
    
    // Get all staff
    const { data: allStaff, error: staffError } = await supabase
      .from('staff')
      .select('*')

    if (staffError) {
      throw new Error(`Error fetching staff: ${staffError.message}`)
    }

    // Archive current week data
    for (const staff of allStaff) {
      const archiveData = {
        staff_id: parseInt(staff.id),
        week_starting_date: currentWeekStart,
        // Published columns
        sunday: staff.sunday,
        monday: staff.monday,
        tuesday: staff.tuesday,
        wednesday: staff.wednesday,
        thursday: staff.thursday,
        friday: staff.friday,
        saturday: staff.saturday,
        // Draft columns
        draft_sunday: staff.draft_sunday,
        draft_monday: staff.draft_monday,
        draft_tuesday: staff.draft_tuesday,
        draft_wednesday: staff.draft_wednesday,
        draft_thursday: staff.draft_thursday,
        draft_friday: staff.draft_friday,
        draft_saturday: staff.draft_saturday,
      }

      const { error: archiveError } = await supabase
        .from('weekly_schedules')
        .upsert(archiveData, {
          onConflict: 'staff_id,week_starting_date'
        })

      if (archiveError) {
        console.error(`Error archiving data for staff ${staff.id}:`, archiveError)
      }
    }

    // Step 2: Move next week's data from weekly_schedules to staff table
    console.log('Step 2: Moving next week data to current...')

    // Get next week's data from weekly_schedules
    const { data: nextWeekData, error: nextWeekError } = await supabase
      .from('weekly_schedules')
      .select('*')
      .eq('week_starting_date', nextWeekStart)

    if (nextWeekError) {
      throw new Error(`Error fetching next week data: ${nextWeekError.message}`)
    }

    // Update staff table with next week's data (or clear if no data exists)
    for (const staff of allStaff) {
      const nextWeekStaff = nextWeekData?.find(nw => nw.staff_id === parseInt(staff.id))
      
      const updateData = {
        // Published columns - use next week's published data or clear
        sunday: nextWeekStaff?.sunday || null,
        monday: nextWeekStaff?.monday || null,
        tuesday: nextWeekStaff?.tuesday || null,
        wednesday: nextWeekStaff?.wednesday || null,
        thursday: nextWeekStaff?.thursday || null,
        friday: nextWeekStaff?.friday || null,
        saturday: nextWeekStaff?.saturday || null,
        // Draft columns - use next week's draft data or clear
        draft_sunday: nextWeekStaff?.draft_sunday || null,
        draft_monday: nextWeekStaff?.draft_monday || null,
        draft_tuesday: nextWeekStaff?.draft_tuesday || null,
        draft_wednesday: nextWeekStaff?.draft_wednesday || null,
        draft_thursday: nextWeekStaff?.draft_thursday || null,
        draft_friday: nextWeekStaff?.draft_friday || null,
        draft_saturday: nextWeekStaff?.draft_saturday || null,
      }

      const { error: updateError } = await supabase
        .from('staff')
        .update(updateData)
        .eq('id', staff.id)

      if (updateError) {
        console.error(`Error updating staff ${staff.id}:`, updateError)
      }
    }

    // Step 3: Remove next week's data from weekly_schedules (it's now current)
    console.log('Step 3: Cleaning up weekly_schedules...')
    
    const { error: deleteError } = await supabase
      .from('weekly_schedules')
      .delete()
      .eq('week_starting_date', nextWeekStart)

    if (deleteError) {
      console.error('Error deleting next week data from weekly_schedules:', deleteError)
    }

    console.log('Weekly migration completed successfully!')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Weekly migration completed successfully',
        currentWeekStart,
        nextWeekStart,
        staffCount: allStaff.length,
        nextWeekDataCount: nextWeekData?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Migration error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

function getSunday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day // Sunday is day 0, so subtract current day to get to Sunday
  return new Date(d.setDate(diff))
} 