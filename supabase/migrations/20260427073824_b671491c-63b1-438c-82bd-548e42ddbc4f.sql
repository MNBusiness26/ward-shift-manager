CREATE TABLE public.translation_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  locale TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (key, locale)
);

ALTER TABLE public.translation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view translation overrides"
ON public.translation_overrides FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Managers can insert translation overrides"
ON public.translation_overrides FOR INSERT
TO authenticated WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can update translation overrides"
ON public.translation_overrides FOR UPDATE
TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers can delete translation overrides"
ON public.translation_overrides FOR DELETE
TO authenticated USING (has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_translation_overrides_updated_at
BEFORE UPDATE ON public.translation_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_translation_overrides_locale ON public.translation_overrides(locale);