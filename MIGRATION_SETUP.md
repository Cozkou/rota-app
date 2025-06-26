# Weekly Migration System Setup

This document explains how to set up the automatic weekly migration system for the ACCESSORIZE rota application.

## Overview

The migration system automatically moves rota data between tables to maintain a clear separation:
- **Current Week**: Always stored in `staff` table
- **Future/Past Weeks**: Always stored in `weekly_schedules` table

## Setup Steps

### 1. Deploy the Edge Function

First, you need to deploy the migration function to Supabase:

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy weekly-migration
```

### 2. Set up Environment Variables

The function needs access to your Supabase service role key. In your Supabase dashboard:

1. Go to Settings > API
2. Copy your `service_role` key (not the `anon` key)
3. The function will automatically have access to `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

### 3. Test the Migration

Visit `/admin/migration` in your application to manually test the migration:

1. Navigate to `https://your-app.com/admin/migration`
2. Click "Run Weekly Migration"
3. Verify the results

### 4. Set up Automatic Scheduling (Optional)

For automatic weekly migrations, you can use:

#### Option A: Supabase Cron (Recommended)
```sql
-- Run every Sunday at 00:01 (1 minute past midnight)
SELECT cron.schedule(
  'weekly-migration',
  '1 0 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/weekly-migration',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

#### Option B: External Cron Service
Use services like:
- GitHub Actions (with scheduled workflows)
- Vercel Cron Jobs
- External cron services

Make a POST request to:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/weekly-migration
```

With headers:
```
Authorization: Bearer YOUR_SERVICE_ROLE_KEY
Content-Type: application/json
```

## How It Works

### Before Migration
```
Week 43 (Current): Data in staff table
Week 44 (Future):  Data in weekly_schedules table
Week 45 (Future):  Data in weekly_schedules table
```

### After Migration
```
Week 43 (Past):    Data archived to weekly_schedules table
Week 44 (Current): Data moved to staff table
Week 45 (Future):  Data remains in weekly_schedules table
```

### Data Flow
1. **Archive**: Current week data moves from `staff` → `weekly_schedules`
2. **Promote**: Next week data moves from `weekly_schedules` → `staff`
3. **Cleanup**: Next week data removed from `weekly_schedules`

## Benefits

1. **Clean Separation**: Current week always in `staff`, others in `weekly_schedules`
2. **Historical Preservation**: All past weeks preserved in `weekly_schedules`
3. **Simplified Logic**: No complex "which table?" logic in application code
4. **Better Performance**: Current week (most accessed) in main table

## Troubleshooting

### Migration Fails
- Check Supabase function logs
- Verify service role key permissions
- Ensure database connectivity

### Data Missing After Migration
- Check `weekly_schedules` table for archived data
- Verify the migration completed successfully
- Use manual migration page to re-run if needed

### Rollback
If you need to rollback a migration:
1. Use the admin interface to check current state
2. Manually move data back if necessary
3. The system preserves all data, so nothing is lost

## Monitoring

- Use the `/admin/migration` page to check migration status
- Monitor Supabase function logs
- Set up alerts for failed migrations if using automatic scheduling

## Security

- The migration function uses service role key (full access)
- Restrict access to `/admin/migration` page to authorized users only
- Consider adding authentication checks to the admin page 