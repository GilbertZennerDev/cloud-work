
CREATE TABLE public.recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_date DATE NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading',
  source_url TEXT,
  title TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recordings_session_date_idx ON public.recordings (session_date DESC, chunk_index ASC);
CREATE INDEX recordings_created_at_idx ON public.recordings (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordings TO anon, authenticated;
GRANT ALL ON public.recordings TO service_role;

ALTER TABLE public.recordings ENABLE ROW LEVEL SECURITY;

-- Single-user open tool: no auth surface, permissive policies.
CREATE POLICY "Public read recordings" ON public.recordings FOR SELECT USING (true);
CREATE POLICY "Public insert recordings" ON public.recordings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update recordings" ON public.recordings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete recordings" ON public.recordings FOR DELETE USING (true);
