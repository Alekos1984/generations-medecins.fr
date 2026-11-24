-- Migration 065 (appliquee) - Blindage du module consultations apres audit.
-- 1. consultation_participation ne fuit plus les compteurs d'une consultation qui ne concerne pas l'adherent.
-- 2. Garde sur consultations : suppression interdite hors brouillon ; ouverture uniquement via ouvrir_consultation()
--    (drapeau local app.consultation_ouverture) ; electeurs_inscrits verrouille apres ouverture.
-- 3. Bulletins et emargements immuables, meme pour le proprietaire de la base (sauf anonymisation a l'effacement d'un compte).
-- 4. Scellement a la cloture : empreinte SHA-256 des bulletins dans consultation_audit, verifiable par consultation_integrite().
-- 5. Vote secret : resultats refuses aux non-admins tant qu'il y a moins de 5 participants.

CREATE OR REPLACE FUNCTION consultation_participation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; n_vot int; n_ins int;
BEGIN
  IF NOT (is_admin() OR is_membre_actif()) THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT is_admin() AND (c.statut = 'brouillon' OR NOT consultation_autorise(p_id, mon_membre_id())) THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  SELECT count(*) INTO n_vot FROM consultation_emargements WHERE consultation_id = p_id;
  n_ins := COALESCE(c.electeurs_inscrits, (SELECT count(*) FROM membres WHERE statut = 'actif'));
  RETURN jsonb_build_object('votants', n_vot, 'inscrits', n_ins,
    'taux', CASE WHEN n_ins > 0 THEN round(100.0 * n_vot / n_ins, 1) ELSE 0 END);
END $$;

CREATE OR REPLACE FUNCTION consultations_garde() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE via_fonction boolean := COALESCE(current_setting('app.consultation_ouverture', true), '') = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.statut <> 'brouillon' THEN RAISE EXCEPTION 'Une consultation ouverte ou close ne peut pas etre supprimee'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.statut = 'cloturee' AND NEW.statut <> 'cloturee' THEN RAISE EXCEPTION 'Une consultation close ne peut pas etre rouverte'; END IF;
  IF OLD.statut = 'ouverte' AND NEW.statut = 'brouillon' THEN RAISE EXCEPTION 'Une consultation ouverte ne peut pas repasser en brouillon'; END IF;
  IF OLD.statut = 'brouillon' AND NEW.statut <> 'brouillon' AND NOT via_fonction THEN
    RAISE EXCEPTION 'Utilisez le bouton Ouvrir : la structure du questionnaire est verifiee a l''ouverture';
  END IF;
  IF OLD.statut <> 'brouillon' AND NOT via_fonction AND (
       NEW.titre IS DISTINCT FROM OLD.titre OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.type_vote IS DISTINCT FROM OLD.type_vote OR NEW.mode IS DISTINCT FROM OLD.mode
       OR NEW.max_choix IS DISTINCT FROM OLD.max_choix OR NEW.quorum_pct IS DISTINCT FROM OLD.quorum_pct
       OR NEW.resultats_visibilite IS DISTINCT FROM OLD.resultats_visibilite
       OR NEW.audience IS DISTINCT FROM OLD.audience
       OR NEW.electeurs_inscrits IS DISTINCT FROM OLD.electeurs_inscrits
       OR NEW.date_ouverture IS DISTINCT FROM OLD.date_ouverture) THEN
    RAISE EXCEPTION 'Consultation ouverte : les regles du scrutin ne peuvent plus etre modifiees';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_consultations_garde ON consultations;
CREATE TRIGGER trg_consultations_garde BEFORE UPDATE OR DELETE ON consultations FOR EACH ROW EXECUTE FUNCTION consultations_garde();

CREATE OR REPLACE FUNCTION ouvrir_consultation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aud text; n int; r jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  PERFORM set_config('app.consultation_ouverture', 'on', true);
  SELECT audience INTO aud FROM consultations WHERE id = p_id;
  IF aud = 'selection' THEN
    SELECT count(*) INTO n FROM consultation_participants p JOIN membres m ON m.id = p.membre_id
     WHERE p.consultation_id = p_id AND m.statut = 'actif';
    IF n < 1 THEN RAISE EXCEPTION 'Selectionnez au moins un adherent actif comme destinataire'; END IF;
  END IF;
  r := ouvrir_consultation_interne(p_id);
  IF aud = 'selection' THEN
    UPDATE consultations SET electeurs_inscrits = n WHERE id = p_id;
    r := jsonb_set(r, '{electeurs_inscrits}', to_jsonb(n));
  END IF;
  PERFORM set_config('app.consultation_ouverture', 'off', true);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION consultation_votes_immuable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM consultations WHERE id = OLD.consultation_id) THEN RAISE EXCEPTION 'Un bulletin ne peut pas etre supprime'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.ballot IS DISTINCT FROM OLD.ballot OR NEW.consultation_id IS DISTINCT FROM OLD.consultation_id OR NEW.id IS DISTINCT FROM OLD.id
     OR (NEW.membre_id IS DISTINCT FROM OLD.membre_id AND NEW.membre_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Un bulletin ne peut pas etre modifie';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_consultation_votes_immuable ON consultation_votes;
CREATE TRIGGER trg_consultation_votes_immuable BEFORE UPDATE OR DELETE ON consultation_votes FOR EACH ROW EXECUTE FUNCTION consultation_votes_immuable();

CREATE OR REPLACE FUNCTION consultation_emargements_immuable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Un emargement ne peut pas etre modifie'; END IF;
  IF EXISTS (SELECT 1 FROM consultations WHERE id = OLD.consultation_id) AND EXISTS (SELECT 1 FROM membres WHERE id = OLD.membre_id) THEN
    RAISE EXCEPTION 'Un emargement ne peut pas etre supprime';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_consultation_emargements_immuable ON consultation_emargements;
CREATE TRIGGER trg_consultation_emargements_immuable BEFORE UPDATE OR DELETE ON consultation_emargements FOR EACH ROW EXECUTE FUNCTION consultation_emargements_immuable();

CREATE OR REPLACE FUNCTION consultation_empreinte(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'bulletins', (SELECT count(*) FROM consultation_votes WHERE consultation_id = p_id),
    'emargements', (SELECT count(*) FROM consultation_emargements WHERE consultation_id = p_id),
    'sha256', encode(sha256(convert_to(COALESCE((SELECT string_agg(v.ballot::text, '|' ORDER BY v.ballot::text) FROM consultation_votes v WHERE v.consultation_id = p_id), ''), 'UTF8')), 'hex'))
$$;

CREATE OR REPLACE FUNCTION consultations_sceller_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.statut = 'cloturee' AND OLD.statut IS DISTINCT FROM 'cloturee' THEN
    INSERT INTO consultation_audit (consultation_id, action, acteur, details) VALUES (NEW.id, 'scelle', auth.uid(), consultation_empreinte(NEW.id));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_consultations_sceller ON consultations;
CREATE TRIGGER trg_consultations_sceller AFTER UPDATE ON consultations FOR EACH ROW EXECUTE FUNCTION consultations_sceller_trg();

CREATE OR REPLACE FUNCTION consultation_integrite(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE scelle jsonb; actuel jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  SELECT details INTO scelle FROM consultation_audit WHERE consultation_id = p_id AND action = 'scelle' ORDER BY id DESC LIMIT 1;
  IF scelle IS NULL THEN RETURN jsonb_build_object('scelle', false); END IF;
  actuel := consultation_empreinte(p_id);
  RETURN jsonb_build_object('scelle', true, 'conforme', scelle = actuel, 'a_la_cloture', scelle, 'maintenant', actuel);
END $$;

CREATE OR REPLACE FUNCTION consultation_resultats(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; n int;
BEGIN
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF c.audience = 'selection' AND NOT (is_admin() OR consultation_autorise(p_id, mon_membre_id())) THEN
    RAISE EXCEPTION 'Consultation introuvable';
  END IF;
  IF c.mode = 'secret' AND NOT is_admin() THEN
    SELECT count(*) INTO n FROM consultation_emargements WHERE consultation_id = p_id;
    IF n < 5 THEN RAISE EXCEPTION 'Vote secret : les resultats sont publies a partir de 5 participants, pour ne pas reveler les reponses individuelles'; END IF;
  END IF;
  RETURN consultation_resultats_interne(p_id);
END $$;

REVOKE ALL ON FUNCTION consultation_empreinte(uuid), consultation_integrite(uuid), consultations_sceller_trg() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consultation_integrite(uuid) TO authenticated;
REVOKE ALL ON FUNCTION consultation_participation(uuid), ouvrir_consultation(uuid), consultation_resultats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consultation_participation(uuid), ouvrir_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION consultation_resultats(uuid) TO anon, authenticated;
