ALTER TABLE public.staff_directory
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS staff_directory_invite_token_key
  ON public.staff_directory(invite_token)
  WHERE invite_token IS NOT NULL;