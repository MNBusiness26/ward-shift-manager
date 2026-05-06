
CREATE OR REPLACE FUNCTION public.ensure_profile_for_assigned_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dir RECORD;
BEGIN
  IF NEW.assigned_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.assigned_user_id) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO dir FROM public.staff_directory WHERE id = NEW.assigned_user_id LIMIT 1;
  IF dir IS NULL THEN
    RAISE EXCEPTION 'Assigned user % does not exist as profile or staff_directory entry', NEW.assigned_user_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, role, target_fte_percent, is_active, department)
  VALUES (dir.id, dir.full_name, dir.email, dir.app_role::text, dir.target_fte_percent, false, dir.department)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_profile_for_assigned_user_trigger ON public.shifts;
CREATE TRIGGER ensure_profile_for_assigned_user_trigger
BEFORE INSERT OR UPDATE OF assigned_user_id ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.ensure_profile_for_assigned_user();
