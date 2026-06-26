-- Observatoire : correction des KPIs hardcodés et marquage des chiffres non sourcés.
--
-- Contexte : les valeurs initiales du seed (migration 028) étaient
-- des estimations non vérifiées. Tant que les sources DREES/CNAM/Doctolib
-- ne sont pas branchées en automatique, on doit :
--   1. corriger les chiffres dont la source officielle est connue (Tarif C)
--   2. blanker les chiffres inventés et les marquer "source à brancher"
--
-- Référence Tarif C : avenant n°9 à la convention médicale, JO 25/12/2024.
-- Tarif C (consultation spécialiste 2e recours) passé à 30 € au 22/12/2024.
-- https://www.ameli.fr/medecin/actualites/

UPDATE observatoire_kpis SET
  valeur       = '30 €',
  tendance     = '↑ +3,50 € avenant n°9',
  tendance_dir = 'up',
  source       = 'CNAM — Avenant n°9 (déc. 2024)',
  annee        = 2024,
  updated_at   = now()
WHERE id = 'tarif_c';

-- Délai moyen rdv généraliste : chiffre inventé, source Doctolib/DREES à brancher.
UPDATE observatoire_kpis SET
  valeur       = '— j',
  tendance     = 'source à brancher (Doctolib / DREES)',
  tendance_dir = 'neutral',
  source       = 'À vérifier',
  updated_at   = now()
WHERE id = 'delai_rdv';

-- Zones sous-dotées : chiffre inventé, source zonage ARS / DREES à brancher.
UPDATE observatoire_kpis SET
  valeur       = '— %',
  tendance     = 'source à brancher (zonage ARS)',
  tendance_dir = 'neutral',
  source       = 'À vérifier',
  updated_at   = now()
WHERE id = 'zones_sous_dotees';

-- Effectif médecins IDF : laissé tel quel, le script RPPS le remplit
-- automatiquement (la valeur 0 vient du bug zéro de tête corrigé dans
-- scripts/import_observatoire.py).
