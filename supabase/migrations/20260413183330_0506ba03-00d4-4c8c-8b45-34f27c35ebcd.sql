
-- Add blocked_shifts column (array of shift types for partial-day blocking)
ALTER TABLE public.availability_requests
ADD COLUMN blocked_shifts text[] DEFAULT '{}';

-- Add created_by_manager_id for proxy requests
ALTER TABLE public.availability_requests
ADD COLUMN created_by_manager_id uuid DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.availability_requests.blocked_shifts IS 'Array of shift types blocked (morning/evening/night). Empty = full day block.';
COMMENT ON COLUMN public.availability_requests.created_by_manager_id IS 'If set, the manager who created this request on behalf of the staff member.';
