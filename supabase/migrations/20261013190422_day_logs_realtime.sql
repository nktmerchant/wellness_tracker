-- Send changes to day_logs to signed-in clients over Supabase Realtime, so
-- an edit on one device shows on the user's other open devices. Realtime
-- checks the table's row-level security for each subscriber, so a user only
-- receives their own rows.
alter publication supabase_realtime add table public.day_logs;
