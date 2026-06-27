-- Observatoire : historique des KPIs et séries.
-- Un snapshot est ajouté à chaque VALIDATION (transition pending → validated).
-- Permet d'afficher des sparklines 12 mois sur la page publique et de
-- calculer une vraie tendance N vs N-12 mois (au lieu de la valeur
-- inventée "↓ −3,2% vs 2023" hardcodée à l'origine).

CREATE TABLE IF NOT EXISTS observatoire_kpis_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id        text NOT NULL,
  valeur        text NOT NULL,
  valeur_num    numeric,         -- extrait num pour calculs de tendance
  source        text,
  annee         int,
  snapshot_at   timestamptz NOT NULL DEFAULT now(),
  import_id     uuid REFERENCES observatoire_imports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_kpis_hist_kpi_date
  ON observatoire_kpis_history (kpi_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS observatoire_series_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id      text NOT NULL,
  label         text NOT NULL,
  valeur_num    numeric,
  valeur_fmt    text,
  rang          int,
  source        text,
  annee         int,
  snapshot_at   timestamptz NOT NULL DEFAULT now(),
  import_id     uuid REFERENCES observatoire_imports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_obs_series_hist_id_date
  ON observatoire_series_history (serie_id, label, snapshot_at DESC);

ALTER TABLE observatoire_kpis_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatoire_series_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obs_kpis_hist_public_read"
  ON observatoire_kpis_history FOR SELECT USING (true);
CREATE POLICY "obs_kpis_hist_admin_write"
  ON observatoire_kpis_history FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "obs_series_hist_public_read"
  ON observatoire_series_history FOR SELECT USING (true);
CREATE POLICY "obs_series_hist_admin_write"
  ON observatoire_series_history FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Vue : tendance N vs N-12 mois pour chaque KPI numérique
CREATE OR REPLACE VIEW observatoire_kpis_tendance AS
WITH last_per_kpi AS (
  SELECT DISTINCT ON (kpi_id) kpi_id, valeur_num, snapshot_at
  FROM observatoire_kpis_history
  WHERE valeur_num IS NOT NULL
  ORDER BY kpi_id, snapshot_at DESC
),
year_ago AS (
  SELECT DISTINCT ON (kpi_id) kpi_id, valeur_num AS val_an_dernier, snapshot_at AS date_an_dernier
  FROM observatoire_kpis_history
  WHERE valeur_num IS NOT NULL
    AND snapshot_at < (now() - interval '11 months')
  ORDER BY kpi_id, snapshot_at DESC
)
SELECT
  l.kpi_id,
  l.valeur_num         AS valeur_actuelle,
  y.val_an_dernier     AS valeur_an_dernier,
  CASE
    WHEN y.val_an_dernier IS NULL OR y.val_an_dernier = 0 THEN NULL
    ELSE round(100.0 * (l.valeur_num - y.val_an_dernier) / y.val_an_dernier, 1)
  END                  AS pct_variation,
  l.snapshot_at        AS date_actuelle,
  y.date_an_dernier
FROM last_per_kpi l
LEFT JOIN year_ago y ON y.kpi_id = l.kpi_id;
