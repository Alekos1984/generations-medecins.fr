-- Observatoire : stockage des analyses générées par IA (mensuelles).
-- Une analyse = synthèse en langage naturel des évolutions des KPIs,
-- générée à partir des données actuelles + 12 derniers mois d'historique.

CREATE TABLE IF NOT EXISTS observatoire_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contenu         text NOT NULL,                 -- Markdown généré par l'IA
  date_periode    date NOT NULL DEFAULT current_date,
  modele          text,                          -- ex: 'gpt-4o-mini'
  kpis_snapshot   jsonb,                         -- snapshot des KPIs au moment de l'analyse
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_obs_analyses_date
  ON observatoire_analyses (date_periode DESC);

ALTER TABLE observatoire_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obs_analyses_public_read"
  ON observatoire_analyses FOR SELECT USING (true);
CREATE POLICY "obs_analyses_admin_write"
  ON observatoire_analyses FOR ALL USING (is_admin()) WITH CHECK (is_admin());
