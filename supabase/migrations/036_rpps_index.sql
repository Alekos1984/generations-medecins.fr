-- Index RPPS des médecins : permet la vérification automatique des adhérents.
-- Peuplée à chaque import RPPS (truncate + bulk insert) par scripts/import_observatoire.py.
-- Ne contient que les médecins (code profession = '10'), pas les autres
-- professions de santé du RPPS, pour limiter la taille (~50 Mo au lieu de 100).

CREATE TABLE IF NOT EXISTS rpps_medecins (
  identifiant_pp        text PRIMARY KEY,           -- "Identifiant PP" (11 chiffres)
  identification_nat    text,                       -- "Identification nationale PP" (12 chiffres, avec préfixe type)
  nom                   text,
  prenom                text,
  nom_upper             text,                       -- pour search insensible accents/casse
  prenom_upper          text,
  libelle_profession    text,
  libelle_savoir_faire  text,                       -- spécialité
  libelle_mode_exercice text,
  code_postal           text,
  code_departement      text,                       -- déduit du code postal
  libelle_commune       text,
  imported_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rpps_med_nom_prenom
  ON rpps_medecins (nom_upper, prenom_upper);
CREATE INDEX IF NOT EXISTS idx_rpps_med_dept
  ON rpps_medecins (code_departement);
CREATE INDEX IF NOT EXISTS idx_rpps_med_cp
  ON rpps_medecins (code_postal);

ALTER TABLE rpps_medecins ENABLE ROW LEVEL SECURITY;

-- Lecture admin uniquement (données nominatives, pas pour le public)
CREATE POLICY "rpps_medecins_admin_read"
  ON rpps_medecins FOR SELECT USING (is_admin());
CREATE POLICY "rpps_medecins_admin_write"
  ON rpps_medecins FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Ajout d'une colonne sur membres pour stocker le résultat du match
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS rpps_match_status text
    CHECK (rpps_match_status IN ('verifie', 'non_trouve', 'multiple', 'a_verifier') OR rpps_match_status IS NULL),
  ADD COLUMN IF NOT EXISTS rpps_match_identifiant text,
  ADD COLUMN IF NOT EXISTS rpps_match_score numeric,
  ADD COLUMN IF NOT EXISTS rpps_match_details jsonb,
  ADD COLUMN IF NOT EXISTS rpps_match_at timestamptz;
