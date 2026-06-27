-- Observatoire : ajoute des colonnes de diagnostic sur observatoire_imports.
-- L'objectif est de pouvoir afficher dans l'admin :
--   - les premières lignes brutes du CSV téléchargé (sample_raw)
--   - les noms exacts des colonnes détectées (colonnes_detectees)
--   - le top des valeurs trouvées dans les colonnes de filtre (top_valeurs)
-- pour comprendre pourquoi le filtre rejette tout quand un compte est à 0.

ALTER TABLE observatoire_imports
  ADD COLUMN IF NOT EXISTS sample_raw         text,
  ADD COLUMN IF NOT EXISTS colonnes_detectees text,
  ADD COLUMN IF NOT EXISTS top_valeurs        text;
