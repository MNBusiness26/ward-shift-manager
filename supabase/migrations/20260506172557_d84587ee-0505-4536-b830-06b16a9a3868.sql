
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  dir_record RECORD;
BEGIN
  -- Try claim an unclaimed directory entry by email (case-insensitive)
  SELECT * INTO dir_record
  FROM public.staff_directory
  WHERE lower(email) = lower(NEW.email) AND is_claimed = false
  LIMIT 1;

  IF dir_record IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role, target_fte_percent, is_active, department)
    VALUES (NEW.id, dir_record.full_name, NEW.email, dir_record.app_role::text, dir_record.target_fte_percent, true, dir_record.department)
    ON CONFLICT (id) DO UPDATE SET is_active=true, full_name=EXCLUDED.full_name, role=EXCLUDED.role, department=EXCLUDED.department;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, dir_record.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.staff_directory
    SET is_claimed = true, claimed_by = NEW.id
    WHERE id = dir_record.id;

    RETURN NEW;
  END IF;

  -- Second try: claimed-but-orphaned directory entry (claimed_by points nowhere)
  SELECT * INTO dir_record
  FROM public.staff_directory
  WHERE lower(email) = lower(NEW.email)
    AND is_claimed = true
    AND (claimed_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = staff_directory.claimed_by))
  LIMIT 1;

  IF dir_record IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role, target_fte_percent, is_active, department)
    VALUES (NEW.id, dir_record.full_name, NEW.email, dir_record.app_role::text, dir_record.target_fte_percent, true, dir_record.department)
    ON CONFLICT (id) DO UPDATE SET is_active=true;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, dir_record.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    UPDATE public.staff_directory
    SET claimed_by = NEW.id
    WHERE id = dir_record.id;

    RETURN NEW;
  END IF;

  -- Fallback: no directory match — create a pending (inactive) profile so admin can see them in Staff
  INSERT INTO public.profiles (id, full_name, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    'nurse',
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;
