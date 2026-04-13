
-- Create staff_directory table for pre-seeding
CREATE TABLE public.staff_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  app_role app_role NOT NULL DEFAULT 'nurse',
  target_fte_percent numeric NOT NULL DEFAULT 1.0,
  is_claimed boolean NOT NULL DEFAULT false,
  claimed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.staff_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage staff directory"
ON public.staff_directory FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'manager'::app_role));

-- Update handle_new_user to do email matching
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  dir_record RECORD;
BEGIN
  SELECT * INTO dir_record
  FROM public.staff_directory
  WHERE lower(email) = lower(NEW.email) AND is_claimed = false
  LIMIT 1;

  IF dir_record IS NOT NULL THEN
    INSERT INTO public.profiles (id, full_name, email, role, target_fte_percent, is_active)
    VALUES (NEW.id, dir_record.full_name, NEW.email, dir_record.app_role::text, dir_record.target_fte_percent, true);
    
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, dir_record.app_role);
    
    UPDATE public.staff_directory
    SET is_claimed = true, claimed_by = NEW.id
    WHERE id = dir_record.id;
  END IF;

  RETURN NEW;
END;
$$;

-- RLS policies for assistant_manager
CREATE POLICY "Assistant managers can manage shifts"
ON public.shifts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'assistant_manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Assistant managers can view all availability requests"
ON public.availability_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Assistant managers can update availability requests"
ON public.availability_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Assistant managers can create availability requests"
ON public.availability_requests FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Assistant managers can manage swap requests"
ON public.swap_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'assistant_manager'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Assistant managers can view roster versions"
ON public.roster_versions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'assistant_manager'::app_role));

CREATE POLICY "Assistant managers can insert roster versions"
ON public.roster_versions FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'assistant_manager'::app_role));
