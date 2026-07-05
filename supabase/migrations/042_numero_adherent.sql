-- Numéro d'adhérent unique par membre, format GM<RÉGION>NNNNNN
-- (ex : GMIDF000042, GMAURA000007). La région est déduite du code postal
-- via le même découpage département → région que l'Observatoire
-- (scripts/import_observatoire.py DEPT_TO_REGION) et que l'admin
-- (mockup/admin.html DEPT_REGION), pour rester cohérent dans tout le
-- projet. Un compteur séquentiel par région garantit des numéros
-- consécutifs et sans collision, y compris avec des inscriptions
-- concurrentes (UPSERT atomique).

ALTER TABLE membres ADD COLUMN IF NOT EXISTS numero_adherent text UNIQUE;

CREATE TABLE IF NOT EXISTS numero_adherent_compteurs (
  region_abbrev text PRIMARY KEY,
  compteur       integer NOT NULL DEFAULT 0
);

-- Département (2 chiffres, ou 3 pour les DOM commençant par 97/98) → sigle région
CREATE OR REPLACE FUNCTION region_abbrev_from_code_postal(cp text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  dept text;
BEGIN
  IF cp IS NULL OR length(trim(cp)) < 2 THEN
    RETURN 'FR';
  END IF;
  cp := trim(cp);

  IF left(cp, 2) IN ('97', '98') THEN
    RETURN CASE left(cp, 3)
      WHEN '971' THEN 'GUA'
      WHEN '972' THEN 'MTQ'
      WHEN '973' THEN 'GUY'
      WHEN '974' THEN 'REU'
      WHEN '976' THEN 'MAY'
      ELSE 'FR'
    END;
  END IF;

  dept := left(cp, 2);
  RETURN CASE dept
    WHEN '01' THEN 'AURA' WHEN '03' THEN 'AURA' WHEN '07' THEN 'AURA' WHEN '15' THEN 'AURA'
    WHEN '26' THEN 'AURA' WHEN '38' THEN 'AURA' WHEN '42' THEN 'AURA' WHEN '43' THEN 'AURA'
    WHEN '63' THEN 'AURA' WHEN '69' THEN 'AURA' WHEN '73' THEN 'AURA' WHEN '74' THEN 'AURA'
    WHEN '21' THEN 'BFC'  WHEN '25' THEN 'BFC'  WHEN '39' THEN 'BFC'  WHEN '58' THEN 'BFC'
    WHEN '70' THEN 'BFC'  WHEN '71' THEN 'BFC'  WHEN '89' THEN 'BFC'  WHEN '90' THEN 'BFC'
    WHEN '22' THEN 'BRE'  WHEN '29' THEN 'BRE'  WHEN '35' THEN 'BRE'  WHEN '56' THEN 'BRE'
    WHEN '18' THEN 'CVL'  WHEN '28' THEN 'CVL'  WHEN '36' THEN 'CVL'  WHEN '37' THEN 'CVL'
    WHEN '41' THEN 'CVL'  WHEN '45' THEN 'CVL'
    WHEN '2A' THEN 'COR'  WHEN '2B' THEN 'COR'  WHEN '20' THEN 'COR'
    WHEN '08' THEN 'GES'  WHEN '10' THEN 'GES'  WHEN '51' THEN 'GES'  WHEN '52' THEN 'GES'
    WHEN '54' THEN 'GES'  WHEN '55' THEN 'GES'  WHEN '57' THEN 'GES'  WHEN '67' THEN 'GES'
    WHEN '68' THEN 'GES'  WHEN '88' THEN 'GES'
    WHEN '02' THEN 'HDF'  WHEN '59' THEN 'HDF'  WHEN '60' THEN 'HDF'  WHEN '62' THEN 'HDF'
    WHEN '80' THEN 'HDF'
    WHEN '75' THEN 'IDF'  WHEN '77' THEN 'IDF'  WHEN '78' THEN 'IDF'  WHEN '91' THEN 'IDF'
    WHEN '92' THEN 'IDF'  WHEN '93' THEN 'IDF'  WHEN '94' THEN 'IDF'  WHEN '95' THEN 'IDF'
    WHEN '14' THEN 'NOR'  WHEN '27' THEN 'NOR'  WHEN '50' THEN 'NOR'  WHEN '61' THEN 'NOR'
    WHEN '76' THEN 'NOR'
    WHEN '16' THEN 'NAQ'  WHEN '17' THEN 'NAQ'  WHEN '19' THEN 'NAQ'  WHEN '23' THEN 'NAQ'
    WHEN '24' THEN 'NAQ'  WHEN '33' THEN 'NAQ'  WHEN '40' THEN 'NAQ'  WHEN '47' THEN 'NAQ'
    WHEN '64' THEN 'NAQ'  WHEN '79' THEN 'NAQ'  WHEN '86' THEN 'NAQ'  WHEN '87' THEN 'NAQ'
    WHEN '09' THEN 'OCC'  WHEN '11' THEN 'OCC'  WHEN '12' THEN 'OCC'  WHEN '30' THEN 'OCC'
    WHEN '31' THEN 'OCC'  WHEN '32' THEN 'OCC'  WHEN '34' THEN 'OCC'  WHEN '46' THEN 'OCC'
    WHEN '48' THEN 'OCC'  WHEN '65' THEN 'OCC'  WHEN '66' THEN 'OCC'  WHEN '81' THEN 'OCC'
    WHEN '82' THEN 'OCC'
    WHEN '44' THEN 'PDL'  WHEN '49' THEN 'PDL'  WHEN '53' THEN 'PDL'  WHEN '72' THEN 'PDL'
    WHEN '85' THEN 'PDL'
    WHEN '04' THEN 'PACA' WHEN '05' THEN 'PACA' WHEN '06' THEN 'PACA' WHEN '13' THEN 'PACA'
    WHEN '83' THEN 'PACA' WHEN '84' THEN 'PACA'
    ELSE 'FR'
  END;
END;
$$;

-- Incrémente atomiquement le compteur d'une région et renvoie le numéro formaté
CREATE OR REPLACE FUNCTION next_numero_adherent(region text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n integer;
BEGIN
  INSERT INTO numero_adherent_compteurs (region_abbrev, compteur)
  VALUES (region, 1)
  ON CONFLICT (region_abbrev) DO UPDATE
    SET compteur = numero_adherent_compteurs.compteur + 1
  RETURNING compteur INTO n;
  RETURN 'GM' || region || lpad(n::text, 6, '0');
END;
$$;

-- Attribution automatique à chaque nouvel adhérent
CREATE OR REPLACE FUNCTION assign_numero_adherent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero_adherent IS NULL THEN
    NEW.numero_adherent := next_numero_adherent(region_abbrev_from_code_postal(NEW.code_postal));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_numero_adherent ON membres;
CREATE TRIGGER trg_assign_numero_adherent
  BEFORE INSERT ON membres
  FOR EACH ROW
  EXECUTE FUNCTION assign_numero_adherent();

-- Backfill des adhérents déjà inscrits, par ordre chronologique d'inscription
-- (le n°1 de chaque région va au premier adhérent inscrit dans cette région)
DO $$
DECLARE
  r membres%ROWTYPE;
BEGIN
  FOR r IN SELECT * FROM membres WHERE numero_adherent IS NULL ORDER BY created_at ASC LOOP
    UPDATE membres
    SET numero_adherent = next_numero_adherent(region_abbrev_from_code_postal(r.code_postal))
    WHERE id = r.id;
  END LOOP;
END $$;

-- Toutes les lignes ont désormais un numéro (trigger + backfill) : on peut contraindre
ALTER TABLE membres ALTER COLUMN numero_adherent SET NOT NULL;

SELECT pg_notify('pgrst', 'reload schema');
