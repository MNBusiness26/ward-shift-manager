
-- Add calendar sync fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS last_sync_generated_at timestamp with time zone;

-- Create index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_profiles_calendar_token ON public.profiles(calendar_token) WHERE calendar_token IS NOT NULL;
