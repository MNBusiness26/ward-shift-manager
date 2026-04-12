
CREATE OR REPLACE FUNCTION public.enforce_blocked_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Check hard-blocked dates
  IF EXISTS (SELECT 1 FROM public.blocked_dates WHERE date = NEW.date) THEN
    RAISE EXCEPTION 'Date % is blocked. No shift modifications allowed.', NEW.date;
  END IF;

  -- Check per-user approved availability requests (block/vacation)
  IF NEW.assigned_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.availability_requests
    WHERE user_id = NEW.assigned_user_id
      AND status = 'approved'
      AND NEW.date >= date
      AND NEW.date <= COALESCE(end_date, date)
  ) THEN
    RAISE EXCEPTION 'User has an approved block/vacation on %. Shift cannot be assigned.', NEW.date;
  END IF;

  RETURN NEW;
END;
$$;
