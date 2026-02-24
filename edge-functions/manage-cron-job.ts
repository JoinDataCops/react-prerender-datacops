/**
 * Manage Cron Job — Schedule/Unschedule pg_cron jobs for cache refresh
 * 
 * Supabase Edge Function: supabase/functions/manage-cron-job/index.ts
 * 
 * Actions:
 *   POST { "action": "schedule", "jobName": "prerender-cache-refresh", "targetFunction": "generate-prerender-cache", "schedule": "0 * * * *", "body": {"market_limit": 4000} }
 *   POST { "action": "unschedule", "jobName": "prerender-cache-refresh" }
 *   POST { "action": "status", "jobName": "prerender-cache-refresh" }
 *   POST { "action": "clearStuckRuns", "jobName": "prerender-cache-refresh" }
 * 
 * Requires these DB functions (see database-schema.sql):
 *   - schedule_cron_job(job_name, job_schedule, function_url, auth_token, request_body)
 *   - unschedule_cron_job(job_name)
 *   - get_cron_job_status(job_name)
 * 
 * Also requires a `cron_job_runs` table for tracking run history.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, jobName, targetFunction, schedule, body: jobBody } = body;

    if (!action || !jobName) {
      throw new Error('Missing required parameters: action, jobName');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || 'YOUR_ANON_KEY';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'schedule') {
      if (!targetFunction || !schedule) {
        throw new Error('Missing required: targetFunction, schedule');
      }

      const functionUrl = `${supabaseUrl}/functions/v1/${targetFunction}`;
      const requestBody = JSON.stringify(jobBody || {});

      const { error } = await supabase.rpc('schedule_cron_job', {
        job_name: jobName,
        job_schedule: schedule,
        function_url: functionUrl,
        auth_token: supabaseAnonKey,
        request_body: requestBody,
      });

      if (error) throw new Error(`Failed to schedule: ${error.message}`);

      return new Response(JSON.stringify({
        success: true, action: 'schedule', jobName, schedule, targetFunction,
        message: `Cron job "${jobName}" scheduled to run ${schedule}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'unschedule') {
      const { error } = await supabase.rpc('unschedule_cron_job', { job_name: jobName });
      if (error) throw new Error(`Failed to unschedule: ${error.message}`);

      return new Response(JSON.stringify({
        success: true, action: 'unschedule', jobName,
        message: `Cron job "${jobName}" has been stopped`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'status') {
      const { data, error } = await supabase.rpc('get_cron_job_status', { job_name: jobName });
      if (error) throw new Error(`Failed to get status: ${error.message}`);

      return new Response(JSON.stringify({
        success: true, action: 'status', jobName,
        isRunning: data && data.length > 0 && data[0].active === true,
        details: data?.[0] || null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else if (action === 'clearStuckRuns') {
      const { data: updated, error } = await supabase
        .from('cron_job_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'Manually cleared stuck run' })
        .eq('job_name', jobName)
        .eq('status', 'running')
        .select('id');

      if (error) throw new Error(`Failed to clear stuck runs: ${error.message}`);

      return new Response(JSON.stringify({
        success: true, action: 'clearStuckRuns', jobName,
        clearedCount: updated?.length || 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
