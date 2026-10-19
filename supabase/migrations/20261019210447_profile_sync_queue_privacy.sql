-- Request least-privilege queue access. Managed Supabase versions may retain
-- owner-granted PUBLIC privileges; signed wake-ups in the next migration avoid
-- placing the persistent credential in this managed queue.
revoke all on table net.http_request_queue, net._http_response from public, anon, authenticated;
grant select on table net.http_request_queue, net._http_response to service_role;
