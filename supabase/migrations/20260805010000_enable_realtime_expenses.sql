-- Enable Supabase Realtime for expenses and group_members tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
