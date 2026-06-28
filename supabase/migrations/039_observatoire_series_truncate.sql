-- Reset des séries démographie pour repeuplage propre avec la nouvelle
-- canonicalisation (~44 spécialités au lieu de 60+ avec doublons).
-- Les KPIs (medecins_actifs par région) sont préservés.

TRUNCATE TABLE observatoire_series_history;
TRUNCATE TABLE observatoire_series;
