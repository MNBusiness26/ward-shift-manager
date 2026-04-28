CREATE POLICY "Managers can delete availability requests"
ON public.availability_requests
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Assistant managers can delete availability requests"
ON public.availability_requests
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'assistant_manager'::app_role));