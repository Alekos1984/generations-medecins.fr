-- Migration 055 - Rappel de conservation tous les 3 ans (RGPD)
ALTER TABLE membres ADD COLUMN IF NOT EXISTS conservation_rappel_le timestamptz;

CREATE OR REPLACE FUNCTION membres_conservation_a_rappeler(p_limit int DEFAULT 200)
RETURNS TABLE (id uuid, email text, prenom text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.email, m.prenom FROM membres m
  WHERE m.email IS NOT NULL
    AND COALESCE(m.conservation_rappel_le, m.created_at) < now() - interval '3 years'
  ORDER BY COALESCE(m.conservation_rappel_le, m.created_at)
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION membres_conservation_a_rappeler(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION membres_conservation_a_rappeler(int) TO service_role;
