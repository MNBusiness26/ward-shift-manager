ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS actual_start_time text,
  ADD COLUMN IF NOT EXISTS actual_end_time text,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;