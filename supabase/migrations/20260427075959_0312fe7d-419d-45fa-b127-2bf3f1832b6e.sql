ALTER TABLE public.staff_directory
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'Children''s Ward';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'Children''s Ward';