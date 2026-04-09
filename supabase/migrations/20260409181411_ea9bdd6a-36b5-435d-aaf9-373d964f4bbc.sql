
-- Add request type enum
CREATE TYPE public.availability_type AS ENUM ('block', 'vacation');

-- Add columns
ALTER TABLE public.availability_requests
  ADD COLUMN request_type availability_type NOT NULL DEFAULT 'block',
  ADD COLUMN end_date date;

-- Backfill end_date to match date for existing rows
UPDATE public.availability_requests SET end_date = date WHERE end_date IS NULL;
