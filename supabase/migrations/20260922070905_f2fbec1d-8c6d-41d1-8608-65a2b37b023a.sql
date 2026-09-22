DROP POLICY IF EXISTS uploads_insert_own ON public.uploads;

CREATE POLICY uploads_insert_own
ON public.uploads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND processed_at IS NULL
  AND error_message IS NULL
  AND attempt_number = 1
);