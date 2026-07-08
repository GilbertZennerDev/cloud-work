ALTER TABLE public.recordings
  ADD COLUMN IF NOT EXISTS audio_status text,
  ADD COLUMN IF NOT EXISTS audio_details jsonb;

COMMENT ON COLUMN public.recordings.audio_status IS 'Audio verification state for a recording chunk, such as verified, muxed, embedded, missing, failed, or unknown.';
COMMENT ON COLUMN public.recordings.audio_details IS 'Worker-provided audio capture and stream probe details.';