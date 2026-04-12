
-- Create app_settings table for global configuration
CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view settings"
ON public.app_settings FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can update settings"
ON public.app_settings FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can insert settings"
ON public.app_settings FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

-- Seed default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('enforce_full_week', '"true"'::jsonb),
  ('headcount_limits', '{"morning": 4, "evening": 3, "night": 2}'::jsonb);
