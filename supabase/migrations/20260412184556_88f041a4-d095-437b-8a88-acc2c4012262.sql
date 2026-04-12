
-- Add target_shift_id for direct swap: the shift from colleague B that nurse A wants
ALTER TABLE public.swap_requests
ADD COLUMN target_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL;

-- Add is_take_only for pool swap: covering nurse takes without offering a replacement
ALTER TABLE public.swap_requests
ADD COLUMN is_take_only boolean NOT NULL DEFAULT false;
