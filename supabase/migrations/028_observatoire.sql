-- Observatoire : KPIs et séries pour graphiques
-- Alimenté par scripts/import_observatoire.py (sources RPPS, DREES, CNAM)

CREATE TABLE IF NOT EXISTS observatoire_kpis (
  id            text PRIMARY KEY,
  valeur        text NOT NULL,
  label         text NOT NULL,
  tendance      text,
  tendance_dir  text CHECK (tendance_dir IN ('up','down','neutral')) DEFAULT 'neutral',
  source        text,
  annee         int,
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observatoire_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serie_id    text NOT NULL,
  label       text NOT NULL,
  valeur_num  numeric,
  valeur_fmt  text NOT NULL,
  rang        int NOT NULL DEFAULT 0,
  source      text,
  annee       int,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (serie_id, label)
);

ALTER TABLE observatoire_kpis   ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatoire_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obs_kpi_public_read"    ON observatoire_kpis   FOR SELECT USING (true);
CREATE POLICY "obs_kpi_admin_write"    ON observatoire_kpis   FOR ALL    USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "obs_series_public_read" ON observatoire_series FOR SELECT USING (true);
CREATE POLICY "obs_series_admin_write" ON observatoire_series FOR ALL    USING (is_admin()) WITH CHECK (is_admin());

-- Données initiales (reprennent les valeurs hardcodées du mockup, à écraser par le script)
INSERT INTO observatoire_kpis VALUES
  ('medecins_idf',      '4 820',  'Médecins actifs en IDF',         '↓ −3.2% vs 2023',     'down',    'RPPS / DREES',      2024, now()),
  ('zones_sous_dotees', '38%',    'Zones sous-dotées en IDF',       '↑ +4 pts vs 2022',     'down',    'DREES',             2024, now()),
  ('delai_rdv_mg',      '31 j',   'Délai moyen rdv généraliste',    '↑ +8 j vs 2023',       'down',    'Doctolib / DREES',  2024, now()),
  ('tarif_c',           '26,5 €', 'Tarif C moyen conventionnel',   '↑ +1 € avenant n°9',   'up',      'CNAM',              2024, now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO observatoire_series (serie_id, label, valeur_num, valeur_fmt, rang, source, annee) VALUES
  ('demographie_idf', 'Médecine générale', 1842, '1 842', 1, 'RPPS', 2024),
  ('demographie_idf', 'Psychiatrie',        698,   '698', 2, 'RPPS', 2024),
  ('demographie_idf', 'Cardiologie',        534,   '534', 3, 'RPPS', 2024),
  ('demographie_idf', 'Pédiatrie',          441,   '441', 4, 'RPPS', 2024),
  ('demographie_idf', 'Gynécologie',        412,   '412', 5, 'RPPS', 2024),
  ('demographie_idf', 'Dermatologie',       338,   '338', 6, 'RPPS', 2024),
  ('honoraires_exercice', 'Libéral S2',  96000, '96 k€', 1, 'DREES', 2024),
  ('honoraires_exercice', 'Libéral S1',  82000, '82 k€', 2, 'DREES', 2024),
  ('honoraires_exercice', 'Mixte',       69000, '69 k€', 3, 'DREES', 2024),
  ('honoraires_exercice', 'Salarié PH',  58000, '58 k€', 4, 'DREES', 2024),
  ('honoraires_exercice', 'Remplaçant',  46000, '46 k€', 5, 'DREES', 2024)
ON CONFLICT (serie_id, label) DO NOTHING;
