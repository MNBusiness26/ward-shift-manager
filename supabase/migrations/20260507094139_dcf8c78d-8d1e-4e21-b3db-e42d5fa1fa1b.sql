CREATE POLICY "Assistant managers can view staff directory"
ON public.staff_directory
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'assistant_manager'::app_role));