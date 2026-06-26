-- Fix : la migration 031 ciblait 'delai_rdv' mais l'id réel en base est
-- 'delai_rdv_mg' (cf seed migration 028). Le KPI n'a donc pas été blanké.

UPDATE observatoire_kpis SET
  valeur       = '— j',
  tendance     = 'source à brancher (Doctolib / DREES)',
  tendance_dir = 'neutral',
  source       = 'À vérifier',
  updated_at   = now()
WHERE id = 'delai_rdv_mg';
