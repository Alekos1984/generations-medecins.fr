-- 060 : correctifs issus de l'audit de securite complet.
-- Gardes sur les colonnes que les membres/admins delegues ne doivent pas modifier,
-- politiques de la table admins reservees au super_admin, invitations d'organisation,
-- stockage des consultations, inscription (RPPS en double).

-- 1. Table admins : seul le super_admin gere les admins ----------------------------
DROP POLICY IF EXISTS "admins: admin peut supprimer" ON admins;
DROP POLICY IF EXISTS "admins: admin peut insérer"   ON admins;
DROP POLICY IF EXISTS "admins: admin peut modifier"  ON admins;
CREATE POLICY "admins: super admin insere" ON admins FOR INSERT TO authenticated
  WITH CHECK (is_gm_super_admin());
CREATE POLICY "admins: super admin modifie" ON admins FOR UPDATE TO authenticated
  USING (is_gm_super_admin()) WITH CHECK (is_gm_super_admin());
CREATE POLICY "admins: super admin supprime" ON admins FOR DELETE TO authenticated
  USING (is_gm_super_admin());

CREATE OR REPLACE FUNCTION admins_garder_dernier_super()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'super_admin')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND NEW.role IS DISTINCT FROM 'super_admin') THEN
    IF NOT EXISTS (SELECT 1 FROM admins a WHERE a.role = 'super_admin' AND a.user_id <> OLD.user_id) THEN
      RAISE EXCEPTION 'Impossible de retirer le dernier super administrateur';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_admins_dernier_super ON admins;
CREATE TRIGGER trg_admins_dernier_super BEFORE UPDATE OR DELETE ON admins
  FOR EACH ROW EXECUTE FUNCTION admins_garder_dernier_super();

-- 2. Invitations d'organisation : seuls user_id et accepted_at peuvent changer ------
CREATE OR REPLACE FUNCTION org_membres_garder_colonnes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_gm_super_admin() OR is_org_admin(OLD.org_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.invite_token IS DISTINCT FROM OLD.invite_token THEN
    RAISE EXCEPTION 'Modification non autorisee sur cette invitation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_org_membres_garde ON org_membres;
CREATE TRIGGER trg_org_membres_garde BEFORE UPDATE ON org_membres
  FOR EACH ROW EXECUTE FUNCTION org_membres_garder_colonnes();

-- 3. membres : colonnes proteges en plus, verification invalidee si l'identite change -
CREATE OR REPLACE FUNCTION membres_proteger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  IF current_setting('app.profil_completion', true) = 'on' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.statut := 'en_attente';
    NEW.rpps_verifie := false;
    NEW.rpps_match_status := NULL;
    NEW.rpps_match_identifiant := NULL;
    NEW.rpps_match_score := NULL;
    NEW.rpps_match_details := NULL;
    NEW.rpps_match_at := NULL;
    NEW.numero_adherent := NULL;
    NEW.conservation_rappel_le := NULL;
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.statut IS DISTINCT FROM OLD.statut
     OR NEW.rpps_verifie IS DISTINCT FROM OLD.rpps_verifie
     OR NEW.rpps_match_status IS DISTINCT FROM OLD.rpps_match_status
     OR NEW.rpps_match_identifiant IS DISTINCT FROM OLD.rpps_match_identifiant
     OR NEW.rpps_match_score IS DISTINCT FROM OLD.rpps_match_score
     OR NEW.rpps_match_details IS DISTINCT FROM OLD.rpps_match_details
     OR NEW.rpps_match_at IS DISTINCT FROM OLD.rpps_match_at
     OR NEW.numero_adherent IS DISTINCT FROM OLD.numero_adherent
     OR NEW.est_interne IS DISTINCT FROM OLD.est_interne
     OR NEW.conservation_rappel_le IS DISTINCT FROM OLD.conservation_rappel_le
     OR NEW.cgu_version IS DISTINCT FROM OLD.cgu_version
     OR NEW.cgu_acceptees_le IS DISTINCT FROM OLD.cgu_acceptees_le
     OR NEW.profil_complet IS DISTINCT FROM OLD.profil_complet THEN
    RAISE EXCEPTION 'Modification non autorisée sur ce profil';
  END IF;

  -- Changer son identite invalide la verification RPPS deja faite
  IF NEW.rpps IS DISTINCT FROM OLD.rpps
     OR NEW.nom IS DISTINCT FROM OLD.nom
     OR NEW.prenom IS DISTINCT FROM OLD.prenom THEN
    NEW.rpps_verifie := false;
    NEW.rpps_match_status := NULL;
    NEW.rpps_match_identifiant := NULL;
    NEW.rpps_match_score := NULL;
    NEW.rpps_match_details := NULL;
    NEW.rpps_match_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Courriers : la signature n'est posee que par le serveur -----------------------
CREATE OR REPLACE FUNCTION cg_garder_signature()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.signe_le := NULL; NEW.signe_par := NULL; NEW.signature_token := NULL;
    IF NEW.statut = 'signe' THEN NEW.statut := 'brouillon'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.signe_le IS DISTINCT FROM OLD.signe_le
     OR NEW.signe_par IS DISTINCT FROM OLD.signe_par
     OR NEW.signature_token IS DISTINCT FROM OLD.signature_token
     OR (NEW.statut = 'signe' AND OLD.statut IS DISTINCT FROM 'signe') THEN
    RAISE EXCEPTION 'La signature ne peut etre posee que par la confirmation par e-mail';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cg_signature ON courriers_generes;
CREATE TRIGGER trg_cg_signature BEFORE INSERT OR UPDATE ON courriers_generes
  FOR EACH ROW EXECUTE FUNCTION cg_garder_signature();

-- 5. Compteurs de campagne derives -----------------------------------------------
CREATE OR REPLACE FUNCTION greve_increment_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE greve_campagnes SET declaration_count = declaration_count + 1 WHERE id = NEW.campagne_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION gc_garder_compteurs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_gm_super_admin() THEN RETURN NEW; END IF;
  NEW.declaration_count := OLD.declaration_count;
  IF to_jsonb(OLD) ? 'optin_count' THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('optin_count', to_jsonb(OLD)->'optin_count'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gc_compteurs ON greve_campagnes;
CREATE TRIGGER trg_gc_compteurs BEFORE UPDATE ON greve_campagnes
  FOR EACH ROW EXECUTE FUNCTION gc_garder_compteurs();

-- 6. Dossiers juridiques : champs reserves a l'equipe a l'insertion ---------------
CREATE OR REPLACE FUNCTION cj_garder_insertion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  NEW.statut := 'recue';
  NEW.reponse_doctrine := NULL; NEW.synthese := NULL; NEW.pdf_url := NULL;
  NEW.note_operateur := NULL; NEW.escalade_spi := false;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cj_insertion ON consultations_juridiques;
CREATE TRIGGER trg_cj_insertion BEFORE INSERT ON consultations_juridiques
  FOR EACH ROW EXECUTE FUNCTION cj_garder_insertion();

CREATE OR REPLACE FUNCTION sos_garder_insertion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  NEW.statut := 'nouveau';
  NEW.analyse_llm := NULL; NEW.assignee := NULL; NEW.reponse := NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sos_insertion ON sos_juridique;
CREATE TRIGGER trg_sos_insertion BEFORE INSERT ON sos_juridique
  FOR EACH ROW EXECUTE FUNCTION sos_garder_insertion();

-- 7. Stockage des consultations : maj/suppression reservees aux membres actifs,
--    sauf livrables deposes par l'equipe (doctrine-*) ------------------------------
DROP POLICY IF EXISTS "consult: maj" ON storage.objects;
DROP POLICY IF EXISTS "consult: suppression" ON storage.objects;
CREATE POLICY "consult: maj" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'consultations' AND (
    is_admin() OR ((storage.foldername(name))[1] = mon_membre_id()::text
                   AND is_membre_actif() AND storage.filename(name) NOT LIKE 'doctrine-%')))
  WITH CHECK (bucket_id = 'consultations' AND (
    is_admin() OR ((storage.foldername(name))[1] = mon_membre_id()::text
                   AND is_membre_actif() AND storage.filename(name) NOT LIKE 'doctrine-%')));
CREATE POLICY "consult: suppression" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'consultations' AND (
    is_admin() OR ((storage.foldername(name))[1] = mon_membre_id()::text
                   AND is_membre_actif() AND storage.filename(name) NOT LIKE 'doctrine-%')));

-- 8. Petites annonces : modification reservee aux membres actifs, moderation intacte --
DROP POLICY IF EXISTS "annonces: modifier la sienne" ON petites_annonces;
CREATE POLICY "annonces: modifier la sienne" ON petites_annonces FOR UPDATE TO authenticated
  USING (is_admin() OR (membre_id = mon_membre_id() AND is_membre_actif()))
  WITH CHECK (is_admin() OR (membre_id = mon_membre_id() AND is_membre_actif()));
CREATE OR REPLACE FUNCTION annonces_garder_moderation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  IF NEW.actif IS DISTINCT FROM OLD.actif AND NEW.actif = true AND OLD.actif = false THEN
    RAISE EXCEPTION 'Annonce desactivee par la moderation';
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at AND NEW.expires_at > OLD.expires_at + interval '60 days' THEN
    RAISE EXCEPTION 'Date d''expiration non autorisee';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_annonces_moderation ON petites_annonces;
CREATE TRIGGER trg_annonces_moderation BEFORE UPDATE ON petites_annonces
  FOR EACH ROW EXECUTE FUNCTION annonces_garder_moderation();

-- 9. Inscription : un RPPS deja pris ne fait plus echouer ni ne revele l'appartenance --
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_rpps text := NULLIF(m->>'rpps', '');
  v_cp   text := NULLIF(m->>'code_postal', '');
  v_secteur text := NULLIF(m->>'secteur', '');
BEGIN
  IF COALESCE(m->>'prenom','') = '' OR COALESCE(m->>'nom','') = '' THEN
    RETURN NEW;
  END IF;
  IF v_rpps IS NOT NULL AND v_rpps !~ '^\d{11}$' THEN v_rpps := NULL; END IF;
  IF v_cp IS NOT NULL AND v_cp !~ '^\d{5}$' THEN v_cp := NULL; END IF;
  IF v_secteur IS NOT NULL AND v_secteur NOT IN (SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'secteur_conv') THEN
    v_secteur := NULL;
  END IF;

  BEGIN
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
  EXCEPTION WHEN unique_violation THEN
    -- RPPS deja rattache a une fiche : on cree la fiche sans RPPS (revue par le bureau)
    INSERT INTO membres (user_id, email, prenom, nom, rpps, est_interne, telephone, code_postal, specialite,
                         mode_exercice, secteur, statut, rpps_verifie,
                         cgu_version, cgu_acceptees_le, newsletter_consent, newsletter_consent_le)
    VALUES (NEW.id, lower(NEW.email), left(m->>'prenom', 100), left(m->>'nom', 100), NULL,
            COALESCE((m->>'est_interne')::boolean, false), left(NULLIF(m->>'telephone',''), 30), v_cp,
            left(NULLIF(m->>'specialite',''), 120), left(NULLIF(m->>'mode_exercice',''), 200),
            v_secteur::secteur_conv, 'en_attente', false,
            left(NULLIF(m->>'cgu_version',''), 20), now(),
            COALESCE((m->>'newsletter_consent')::boolean, false),
            CASE WHEN COALESCE((m->>'newsletter_consent')::boolean, false) THEN now() END);
  END;
  RETURN NEW;
END $$;
