-- Observatoire : ajout du concept de région pour étendre au national.
-- Les KPIs et séries existent maintenant en plusieurs exemplaires (un par région).
-- Codes INSEE des régions métropolitaines : 11 (IDF), 24 (CVL), 27 (BFC),
-- 28 (NOR), 32 (HDF), 44 (GES), 52 (PDL), 53 (BRE), 75 (NAQ), 76 (OCC),
-- 84 (AURA), 93 (PACA), 94 (COR). Code 'FR' = France entière.

ALTER TABLE observatoire_kpis
  ADD COLUMN IF NOT EXISTS region text DEFAULT 'FR' NOT NULL;

-- Le PK devient composite (id, region) : plusieurs rangs "medecins_actifs"
-- coexistent, un par région.
ALTER TABLE observatoire_kpis DROP CONSTRAINT IF EXISTS observatoire_kpis_pkey;
ALTER TABLE observatoire_kpis ADD CONSTRAINT observatoire_kpis_pkey PRIMARY KEY (id, region);

ALTER TABLE observatoire_series
  ADD COLUMN IF NOT EXISTS region text DEFAULT 'FR' NOT NULL;

-- L'historique aussi, pour pouvoir tracer une tendance par région
ALTER TABLE observatoire_kpis_history
  ADD COLUMN IF NOT EXISTS region text DEFAULT 'FR' NOT NULL;

ALTER TABLE observatoire_series_history
  ADD COLUMN IF NOT EXISTS region text DEFAULT 'FR' NOT NULL;

-- Les anciennes données IDF gardent leur statut mais sont étiquetées '11' (IDF)
UPDATE observatoire_kpis        SET region = '11' WHERE id IN ('medecins_idf','zones_sous_dotees') OR label ILIKE '%IDF%';
UPDATE observatoire_series      SET region = '11' WHERE serie_id = 'demographie_idf';
UPDATE observatoire_kpis_history SET region = '11' WHERE kpi_id IN ('medecins_idf','zones_sous_dotees');
UPDATE observatoire_series_history SET region = '11' WHERE serie_id = 'demographie_idf';

-- Les contraintes d'unicité doivent prendre la région en compte
ALTER TABLE observatoire_series DROP CONSTRAINT IF EXISTS observatoire_series_serie_id_label_key;
ALTER TABLE observatoire_series ADD CONSTRAINT observatoire_series_region_serie_label_key UNIQUE (region, serie_id, label);

-- Vue tendance par région
CREATE OR REPLACE VIEW observatoire_kpis_tendance AS
WITH last_per AS (
  SELECT DISTINCT ON (kpi_id, region) kpi_id, region, valeur_num, snapshot_at
  FROM observatoire_kpis_history
  WHERE valeur_num IS NOT NULL
  ORDER BY kpi_id, region, snapshot_at DESC
),
year_ago AS (
  SELECT DISTINCT ON (kpi_id, region) kpi_id, region, valeur_num AS val_an_dernier, snapshot_at AS date_an_dernier
  FROM observatoire_kpis_history
  WHERE valeur_num IS NOT NULL
    AND snapshot_at < (now() - interval '11 months')
  ORDER BY kpi_id, region, snapshot_at DESC
)
SELECT
  l.kpi_id, l.region,
  l.valeur_num     AS valeur_actuelle,
  y.val_an_dernier AS valeur_an_dernier,
  CASE WHEN y.val_an_dernier IS NULL OR y.val_an_dernier = 0 THEN NULL
       ELSE round(100.0 * (l.valeur_num - y.val_an_dernier) / y.val_an_dernier, 1)
  END              AS pct_variation,
  l.snapshot_at    AS date_actuelle,
  y.date_an_dernier
FROM last_per l
LEFT JOIN year_ago y ON y.kpi_id = l.kpi_id AND y.region = l.region;
