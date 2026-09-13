ALTER TYPE public.upload_status ADD VALUE IF NOT EXISTS 'cancel_requested';
ALTER TYPE public.upload_status ADD VALUE IF NOT EXISTS 'cancelled';