-- Migration 051 - Limitation de débit des fonctions serveur (anti-abus)
CREATE TABLE IF NOT EXISTS rate_limits (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;   -- aucune policy : service_role uniquement
REVOKE ALL ON rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION check_rate_limit(p_key text, p_max int, p_window_seconds int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  h int;
BEGIN
  INSERT INTO rate_limits (key, window_start, hits) VALUES (p_key, w, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
  RETURNING hits INTO h;
  -- purge opportuniste des fenêtres de plus de 2 jours
  IF random() < 0.01 THEN DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'; END IF;
  RETURN h <= p_max;
END;
$$;
REVOKE ALL ON FUNCTION check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, int, int) TO service_role;
