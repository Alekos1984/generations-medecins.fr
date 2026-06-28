-- Nettoyage des séries héritées (pré-canonicalisation et pré-régions).
-- Avant 037 : serie_id = 'demographie_idf' (label = libellé RPPS brut, ex
-- "Spécialiste en Médecine Générale" et "Qualifié en Médecine Générale"
-- qui sont en réalité la même chose).
-- Après 037 : serie_id = 'demographie' (labels canonicalisés par
-- scripts/import_observatoire.py).
--
-- On supprime toutes les lignes de l'ancien schéma — le prochain import
-- repeuplera proprement avec des labels canoniques par région.

DELETE FROM observatoire_series_history WHERE serie_id = 'demographie_idf';
DELETE FROM observatoire_series         WHERE serie_id = 'demographie_idf';

-- Idem pour les KPIs : 'medecins_idf' est remplacé par 'medecins_actifs'
-- (avec une ligne par région). On garde 'medecins_idf' au cas où mais on
-- supprime ses copies historiques pour éviter le double affichage.
DELETE FROM observatoire_kpis_history WHERE kpi_id = 'medecins_idf';
DELETE FROM observatoire_kpis         WHERE id     = 'medecins_idf';
