-- Validation automatique de l'import Observatoire
-- Reproduit validateAllObsImport() (admin.html) côté base : copie les valeurs
-- *_pending vers les colonnes courantes, passe en 'validated', écrit l'historique.
-- Appelée par le workflow GitHub à la fin de chaque import (service_role uniquement).

CREATE OR REPLACE FUNCTION observatoire_auto_validate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_kpis   int := 0;
  n_series int := 0;
BEGIN
  -- Historique d'abord (valeurs qui vont devenir courantes)
  INSERT INTO observatoire_kpis_history (kpi_id, region, valeur, valeur_num, source, annee, import_id)
  SELECT id, region, COALESCE(valeur_pending, valeur),
         NULLIF(regexp_replace(replace(COALESCE(valeur_pending, valeur), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric,
         COALESCE(source_pending, source), COALESCE(annee_pending, annee), import_id
  FROM observatoire_kpis WHERE statut = 'pending'
    AND COALESCE(valeur_pending, valeur) NOT IN ('—', '-', '');

  UPDATE observatoire_kpis SET
    valeur = COALESCE(valeur_pending, valeur),
    source = COALESCE(source_pending, source),
    annee = COALESCE(annee_pending, annee),
    tendance = COALESCE(tendance_pending, tendance),
    tendance_dir = COALESCE(tendance_dir_pending, tendance_dir),
    statut = 'validated',
    valeur_pending = NULL, tendance_pending = NULL, tendance_dir_pending = NULL,
    source_pending = NULL, annee_pending = NULL, pending_at = NULL,
    updated_at = now()
  WHERE statut = 'pending';
  GET DIAGNOSTICS n_kpis = ROW_COUNT;

  INSERT INTO observatoire_series_history (serie_id, label, region, valeur_num, valeur_fmt, rang, source, annee, import_id)
  SELECT serie_id, label, region, COALESCE(valeur_num_pending, valeur_num),
         COALESCE(valeur_fmt_pending, valeur_fmt), rang,
         COALESCE(source_pending, source), COALESCE(annee_pending, annee), import_id
  FROM observatoire_series WHERE statut = 'pending';

  UPDATE observatoire_series SET
    valeur_num = COALESCE(valeur_num_pending, valeur_num),
    valeur_fmt = COALESCE(valeur_fmt_pending, valeur_fmt),
    source = COALESCE(source_pending, source),
    annee = COALESCE(annee_pending, annee),
    statut = 'validated',
    valeur_num_pending = NULL, valeur_fmt_pending = NULL,
    source_pending = NULL, annee_pending = NULL, pending_at = NULL,
    updated_at = now()
  WHERE statut = 'pending';
  GET DIAGNOSTICS n_series = ROW_COUNT;

  UPDATE observatoire_imports SET validated_at = now() WHERE validated_at IS NULL AND statut IN ('success','partial');

  RETURN jsonb_build_object('kpis', n_kpis, 'series', n_series);
END;
$$;

REVOKE ALL ON FUNCTION observatoire_auto_validate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION observatoire_auto_validate() TO service_role;
