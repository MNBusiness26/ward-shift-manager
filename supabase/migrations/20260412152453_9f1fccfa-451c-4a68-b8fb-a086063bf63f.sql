
-- blocked_dates table
CREATE TABLE public.blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage blocked dates"
  ON public.blocked_dates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Authenticated users can view blocked dates"
  ON public.blocked_dates FOR SELECT TO authenticated
  USING (true);

-- is_standby column on shifts
ALTER TABLE public.shifts ADD COLUMN is_standby boolean NOT NULL DEFAULT false;

-- Hard-lock trigger: prevent shift INSERT/UPDATE if date is blocked
CREATE OR REPLACE FUNCTION public.enforce_blocked_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.blocked_dates WHERE date = NEW.date) THEN
    RAISE EXCEPTION 'Date % is blocked. No shift modifications allowed.', NEW.date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_blocked_dates
  BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_blocked_dates();
