import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { AdminAuthError, requirePortalUser } from "../_shared/adminAuth.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/cors.ts";
import { logOnboarding } from "../_shared/logger.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  try {
    const { user, adminClient } = await requirePortalUser(req);
    const [{ data: connection, error: connectionError }, { data: events, error: eventsError }] =
      await Promise.all([
        adminClient
          .from("portal_google_calendar_connections")
          .select("status,scope,connected_at,last_synced_at,sync_window_end,last_error_code")
          .eq("user_id", user.id)
          .maybeSingle(),
        adminClient
          .from("portal_google_calendar_events")
          .select("id,title,starts_at,ends_at,start_date,end_date,is_all_day,calendar_context,join_url,cached_at")
          .eq("user_id", user.id)
          .limit(10),
      ]);
    if (connectionError) throw new Error(connectionError.message);
    if (eventsError) throw new Error(eventsError.message);

    return jsonResponse({
      connection: connection
        ? {
          status: connection.status,
          scope: connection.scope,
          connectedAt: connection.connected_at,
          lastSyncedAt: connection.last_synced_at,
          syncWindowEnd: connection.sync_window_end,
          lastErrorCode: connection.last_error_code,
        }
        : null,
      events: (events ?? []).map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        startDate: event.start_date,
        endDate: event.end_date,
        allDay: event.is_all_day,
        calendarContext: event.calendar_context,
        joinUrl: event.join_url,
        cachedAt: event.cached_at,
      })),
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return errorResponse(error.message, error.status, error.code);
    }
    const message = error instanceof Error ? error.message : "Unable to load Google Calendar";
    logOnboarding("portal_google_calendar_load_failed", { error: message }, "error");
    return errorResponse("Unable to load Google Calendar", 500, "load_failed");
  }
});
