-- Migration 053 - Inscription avec confirmation d'e-mail
-- Avec la confirmation activée, supabase.auth.signUp ne renvoie pas de session : le navigateur ne peut donc pas
-- créer lui-même la ligne `membres` (RLS). Le profil est créé côté base, à la création du compte, depuis les
-- métadonnées fournies à signUp (validées ici). Le compte reste "en_attente" jusqu'à validation par un admin.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_rpps text := NULLIF(m->>'rpps', '');
  v_cp   text := NULLIF(m->>'code_postal', '');
  v_secteur text := NULLIF(m->>'secteur', '');
BEGIN
  IF COALESCE(m->>'prenom','') = '' OR COALESCE(m->>'nom','') = '' THEN
    RETURN NEW;                       -- compte créé hors formulaire d'adhésion (ex. invitation d'organisation)
  END IF;
  IF v_rpps IS NOT NULL AND v_rpps !~ '^\d{11}$' THEN RAISE EXCEPTION 'RPPS invalide'; END IF;
  IF v_cp IS NOT NULL AND v_cp !~ '^\d{5}$' THEN v_cp := NULL; END IF;
  IF v_secteur IS NOT NULL AND v_secteur NOT IN (SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'secteur_conv') THEN
    v_secteur := NULL;
  END IF;

  INSERT INTO membres (user_id, email, prenom, nom, rpps, est_interne, telephone, code_postal, specialite,
                       mode_exercice, secteur, statut, rpps_verifie,
                       cgu_version, cgu_acceptees_le, newsletter_consent, newsletter_consent_le)
  VALUES (NEW.id, lower(NEW.email), left(m->>'prenom', 100), left(m->>'nom', 100), v_rpps,
          COALESCE((m->>'est_interne')::boolean, false), left(NULLIF(m->>'telephone',''), 30), v_cp,
          left(NULLIF(m->>'specialite',''), 120), left(NULLIF(m->>'mode_exercice',''), 200),
          v_secteur::secteur_conv, 'en_attente', false,
          left(NULLIF(m->>'cgu_version',''), 20), now(),
          COALESCE((m->>'newsletter_consent')::boolean, false),
          CASE WHEN COALESCE((m->>'newsletter_consent')::boolean, false) THEN now() END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
