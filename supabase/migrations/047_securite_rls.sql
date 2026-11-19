-- Migration 047 - Durcissement RLS (audit sécurité)
--  A. membres : un adhérent ne peut plus s'auto-activer ni modifier ses champs protégés
--  B. org_membres : fin de la lecture / prise de contrôle des invitations d'autres personnes
--  C. greve_declarations : plus d'insertion directe anonyme (passe par la fonction Netlify)
--  D. vues SECURITY DEFINER exposant des agrégats internes -> security_invoker
--  E. rls_auto_enable non exécutable par les clients ; search_path figé sur les fonctions

-- A ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION membres_proteger()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- service_role (auth.uid() NULL) et admins : libres
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.statut := 'en_attente';
    NEW.rpps_verifie := false;
    NEW.rpps_match_status := NULL;
    NEW.rpps_match_identifiant := NULL;
    NEW.rpps_match_score := NULL;
    NEW.rpps_match_details := NULL;
    NEW.rpps_match_at := NULL;
    NEW.numero_adherent := NULL;   -- attribué par trg_assign_numero_adherent
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
     OR NEW.numero_adherent IS DISTINCT FROM OLD.numero_adherent THEN
    RAISE EXCEPTION 'Modification non autorisée sur ce profil';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_a_membres_proteger ON membres;
CREATE TRIGGER trg_a_membres_proteger BEFORE INSERT OR UPDATE ON membres
  FOR EACH ROW EXECUTE FUNCTION membres_proteger();

-- B ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_membres_read_pending_invite ON org_membres;
CREATE POLICY org_membres_read_pending_invite ON org_membres FOR SELECT
  USING (invite_token IS NOT NULL AND accepted_at IS NULL AND lower(email) = lower(auth.email()));

DROP POLICY IF EXISTS org_membres_accept_invite ON org_membres;
CREATE POLICY org_membres_accept_invite ON org_membres FOR UPDATE
  USING (invite_token IS NOT NULL AND accepted_at IS NULL AND lower(email) = lower(auth.email()))
  WITH CHECK (user_id = auth.uid());

-- C ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "gd: insertion publique" ON greve_declarations;

-- D ---------------------------------------------------------------------------
ALTER VIEW observatoire_kpis_tendance SET (security_invoker = true);
ALTER VIEW mass_mailing_stats SET (security_invoker = true);

-- E ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION rls_auto_enable() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN (
             'is_admin','update_updated_at','is_membre_actif','mon_membre_id','greve_increment_count','greve_par_jour',
             'is_gm_super_admin','is_org_admin','region_abbrev_from_code_postal','next_numero_adherent',
             'assign_numero_adherent','cj_restreindre_membre')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.f);
  END LOOP;
END $$;
