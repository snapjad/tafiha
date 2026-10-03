// طفّيها — public connection settings. The anon key is meant to be public: tables are closed
// (RLS, no grants) and every data call goes through functions that check the signed-in session.
export const SUPABASE_URL = 'https://wgwbgutzwqkrugfkcchc.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indnd2JndXR6d3FrcnVnZmtjY2hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3Nzk3MTcsImV4cCI6MjEwNjM1NTcxN30.TslETkJedgZckPhxfG_F99-NpYs6C0k2KYX7qndhMXg';
