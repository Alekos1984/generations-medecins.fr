-- Migration 054 - Consultations des adhérents (votes, sondages, classements)
-- Principes :
--   * seuls les adhérents "actifs" votent, une voix par adhérent (clé primaire sur l'émargement)
--   * vote SECRET (aucun lien entre l'émargement et le bulletin) ou NOMINATIF, au choix par consultation
--   * AUCUN résultat avant la clôture : les bulletins ne sont lisibles par personne (RLS sans policy),
--     seule la fonction consultation_resultats() les agrège, et uniquement une fois la consultation close
--   * tout passe par des fonctions SECURITY DEFINER qui contrôlent statut, période, unicité et forme du bulletin

CREATE TABLE IF NOT EXISTS consultations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre                text NOT NULL CHECK (length(titre) BETWEEN 3 AND 200),
  description          text CHECK (description IS NULL OR length(description) <= 4000),
  categorie            text,
  type_vote            text NOT NULL CHECK (type_vote IN ('choix_unique','choix_multiple','classement')),
  mode                 text NOT NULL DEFAULT 'secret' CHECK (mode IN ('secret','nominatif')),
  max_choix            int  CHECK (max_choix IS NULL OR max_choix >= 1),
  statut               text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','ouverte','cloturee')),
  date_ouverture       timestamptz,
  date_cloture         timestamptz,
  quorum_pct           int  CHECK (quorum_pct IS NULL OR quorum_pct BETWEEN 1 AND 100),
  resultats_visibilite text NOT NULL DEFAULT 'public' CHECK (resultats_visibilite IN ('public','adherents')),
  electeurs_inscrits   int,
  annonce_envoyee      boolean NOT NULL DEFAULT false,
  rappel_envoye        boolean NOT NULL DEFAULT false,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consultation_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  libelle         text NOT NULL CHECK (length(libelle) BETWEEN 1 AND 300),
  description     text CHECK (description IS NULL OR length(description) <= 1000),
  ordre           int  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_consult_options ON consultation_options (consultation_id, ordre);

-- Qui a voté (liste d'émargement). Date seule : pas d'horodatage précis, pour ne pas pouvoir recouper un bulletin.
CREATE TABLE IF NOT EXISTS consultation_emargements (
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  membre_id       uuid NOT NULL REFERENCES membres(id) ON DELETE CASCADE,
  vote_le         date NOT NULL DEFAULT current_date,
  PRIMARY KEY (consultation_id, membre_id)
);

-- Les bulletins. membre_id n'est renseigné qu'en mode nominatif. Aucun horodatage.
CREATE TABLE IF NOT EXISTS consultation_votes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  membre_id       uuid REFERENCES membres(id) ON DELETE SET NULL,
  ballot          jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_votes ON consultation_votes (consultation_id);

CREATE TABLE IF NOT EXISTS consultation_audit (
  id              bigserial PRIMARY KEY,
  consultation_id uuid,
  action          text NOT NULL,
  acteur          uuid,
  details         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consultations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_options      ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_emargements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_votes        ENABLE ROW LEVEL SECURITY;   -- volontairement SANS policy
ALTER TABLE consultation_audit        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consult: lecture" ON consultations FOR SELECT USING (statut IN ('ouverte','cloturee') OR is_admin());
CREATE POLICY "consult: admin" ON consultations FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "consult_opt: lecture" ON consultation_options FOR SELECT
  USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_id AND (c.statut IN ('ouverte','cloturee') OR is_admin())));
CREATE POLICY "consult_opt: admin" ON consultation_options FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "consult_emarg: les siens ou admin" ON consultation_emargements FOR SELECT
  USING (membre_id = mon_membre_id() OR is_admin());
CREATE POLICY "consult_audit: admin" ON consultation_audit FOR SELECT USING (is_admin());

REVOKE ALL ON consultation_votes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON consultation_emargements, consultation_audit FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON consultations, consultation_options FROM anon;

-- Statut effectif : une consultation "ouverte" dont la date de clôture est passée est close
CREATE OR REPLACE FUNCTION consultation_close(c consultations) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT c.statut = 'cloturee' OR (c.statut = 'ouverte' AND c.date_cloture IS NOT NULL AND now() > c.date_cloture) $$;
CREATE OR REPLACE FUNCTION consultation_en_cours(c consultations) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT c.statut = 'ouverte' AND now() >= COALESCE(c.date_ouverture, now()) AND (c.date_cloture IS NULL OR now() <= c.date_cloture) $$;

-- Garde-fous sur les modifications ------------------------------------------------
CREATE OR REPLACE FUNCTION consultations_garde() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.statut = 'cloturee' AND NEW.statut <> 'cloturee' THEN RAISE EXCEPTION 'Une consultation close ne peut pas être rouverte'; END IF;
    IF OLD.statut = 'ouverte' AND NEW.statut = 'brouillon' THEN RAISE EXCEPTION 'Une consultation ouverte ne peut pas repasser en brouillon'; END IF;
    IF OLD.statut <> 'brouillon' AND (
         NEW.titre IS DISTINCT FROM OLD.titre OR NEW.description IS DISTINCT FROM OLD.description
         OR NEW.type_vote IS DISTINCT FROM OLD.type_vote OR NEW.mode IS DISTINCT FROM OLD.mode
         OR NEW.max_choix IS DISTINCT FROM OLD.max_choix OR NEW.quorum_pct IS DISTINCT FROM OLD.quorum_pct
         OR NEW.resultats_visibilite IS DISTINCT FROM OLD.resultats_visibilite
         OR NEW.date_ouverture IS DISTINCT FROM OLD.date_ouverture) THEN
      RAISE EXCEPTION 'Consultation ouverte : les règles du scrutin ne peuvent plus être modifiées';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_consultations_garde ON consultations;
CREATE TRIGGER trg_consultations_garde BEFORE UPDATE ON consultations FOR EACH ROW EXECUTE FUNCTION consultations_garde();

CREATE OR REPLACE FUNCTION consultation_options_garde() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cid uuid := COALESCE(NEW.consultation_id, OLD.consultation_id); st text;
BEGIN
  SELECT statut INTO st FROM consultations WHERE id = cid;
  IF st IS NOT NULL AND st <> 'brouillon' THEN RAISE EXCEPTION 'Les options ne peuvent plus être modifiées une fois la consultation ouverte'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_consultation_options_garde ON consultation_options;
CREATE TRIGGER trg_consultation_options_garde BEFORE INSERT OR UPDATE OR DELETE ON consultation_options
  FOR EACH ROW EXECUTE FUNCTION consultation_options_garde();

-- Journal d'audit ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION consultations_audit_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO consultation_audit (consultation_id, action, acteur, details) VALUES (NEW.id, 'creation', auth.uid(), jsonb_build_object('titre', NEW.titre, 'mode', NEW.mode, 'type', NEW.type_vote));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.statut IS DISTINCT FROM OLD.statut THEN
      INSERT INTO consultation_audit (consultation_id, action, acteur, details) VALUES (NEW.id, 'statut:' || NEW.statut, auth.uid(), jsonb_build_object('de', OLD.statut, 'inscrits', NEW.electeurs_inscrits));
    ELSIF NEW.date_cloture IS DISTINCT FROM OLD.date_cloture THEN
      INSERT INTO consultation_audit (consultation_id, action, acteur, details) VALUES (NEW.id, 'date_cloture', auth.uid(), jsonb_build_object('de', OLD.date_cloture, 'a', NEW.date_cloture));
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO consultation_audit (consultation_id, action, acteur, details) VALUES (OLD.id, 'suppression', auth.uid(), jsonb_build_object('titre', OLD.titre));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_consultations_audit ON consultations;
CREATE TRIGGER trg_consultations_audit AFTER INSERT OR UPDATE OR DELETE ON consultations FOR EACH ROW EXECUTE FUNCTION consultations_audit_trg();

-- Ouverture / clôture (admin) ------------------------------------------------------
CREATE OR REPLACE FUNCTION ouvrir_consultation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; n_opt int; n_elec int;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF c.statut <> 'brouillon' THEN RAISE EXCEPTION 'Cette consultation est déjà ouverte ou close'; END IF;
  SELECT count(*) INTO n_opt FROM consultation_options WHERE consultation_id = p_id;
  IF n_opt < 2 THEN RAISE EXCEPTION 'Au moins deux options sont nécessaires'; END IF;
  IF c.date_cloture IS NULL OR c.date_cloture <= now() THEN RAISE EXCEPTION 'Indiquez une date de clôture dans le futur'; END IF;
  IF c.type_vote = 'choix_multiple' AND c.max_choix IS NOT NULL AND c.max_choix > n_opt THEN RAISE EXCEPTION 'Le nombre maximal de choix dépasse le nombre d''options'; END IF;
  SELECT count(*) INTO n_elec FROM membres WHERE statut = 'actif';
  UPDATE consultations SET statut = 'ouverte', date_ouverture = COALESCE(date_ouverture, now()), electeurs_inscrits = n_elec WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'electeurs_inscrits', n_elec);
END $$;

CREATE OR REPLACE FUNCTION cloturer_consultation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  UPDATE consultations SET statut = 'cloturee', date_cloture = LEAST(COALESCE(date_cloture, now()), now()) WHERE id = p_id AND statut = 'ouverte';
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucune consultation ouverte avec cet identifiant'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Clôture automatique à l'échéance (appelée par la tâche planifiée, service_role)
CREATE OR REPLACE FUNCTION consultations_cloture_auto() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE consultations SET statut = 'cloturee' WHERE statut = 'ouverte' AND date_cloture IS NOT NULL AND date_cloture < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Vote ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION voter(p_consultation uuid, p_ballot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c consultations; m membres; opt_ids uuid[]; chosen uuid[]; n_opt int; blanc boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  SELECT * INTO m FROM membres WHERE user_id = auth.uid() AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Le vote est réservé aux adhérents actifs'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_consultation;
  IF NOT FOUND OR NOT consultation_en_cours(c) THEN RAISE EXCEPTION 'Cette consultation n''est pas ouverte au vote'; END IF;

  SELECT array_agg(id) INTO opt_ids FROM consultation_options WHERE consultation_id = c.id;
  n_opt := COALESCE(array_length(opt_ids, 1), 0);
  blanc := COALESCE((p_ballot->>'blanc')::boolean, false);

  IF NOT blanc THEN
    IF c.type_vote = 'classement' THEN
      SELECT array_agg(x::uuid) INTO chosen FROM jsonb_array_elements_text(COALESCE(p_ballot->'ordre', '[]'::jsonb)) x;
      IF chosen IS NULL OR array_length(chosen, 1) <> n_opt OR (SELECT count(DISTINCT e) FROM unnest(chosen) e) <> n_opt OR NOT (chosen <@ opt_ids) THEN
        RAISE EXCEPTION 'Classement invalide : classez toutes les options, une seule fois chacune';
      END IF;
    ELSE
      SELECT array_agg(x::uuid) INTO chosen FROM jsonb_array_elements_text(COALESCE(p_ballot->'options', '[]'::jsonb)) x;
      IF chosen IS NULL OR array_length(chosen, 1) < 1 OR (SELECT count(DISTINCT e) FROM unnest(chosen) e) <> array_length(chosen, 1) OR NOT (chosen <@ opt_ids) THEN
        RAISE EXCEPTION 'Bulletin invalide';
      END IF;
      IF c.type_vote = 'choix_unique' AND array_length(chosen, 1) <> 1 THEN RAISE EXCEPTION 'Un seul choix possible'; END IF;
      IF c.type_vote = 'choix_multiple' AND c.max_choix IS NOT NULL AND array_length(chosen, 1) > c.max_choix THEN
        RAISE EXCEPTION 'Vous pouvez choisir au maximum % option(s)', c.max_choix;
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO consultation_emargements (consultation_id, membre_id) VALUES (c.id, m.id);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Vous avez déjà voté pour cette consultation';
  END;

  INSERT INTO consultation_votes (consultation_id, membre_id, ballot)
  VALUES (c.id, CASE WHEN c.mode = 'nominatif' THEN m.id END,
          CASE WHEN blanc THEN '{"blanc":true}'::jsonb
               WHEN c.type_vote = 'classement' THEN jsonb_build_object('ordre', to_jsonb(chosen))
               ELSE jsonb_build_object('options', to_jsonb(chosen)) END);
  RETURN jsonb_build_object('ok', true);
END $$;

-- Participation (sans aucun résultat) : admin ou adhérent actif -----------------------
CREATE OR REPLACE FUNCTION consultation_participation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; n_vot int; n_ins int;
BEGIN
  IF NOT (is_admin() OR is_membre_actif()) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  SELECT count(*) INTO n_vot FROM consultation_emargements WHERE consultation_id = p_id;
  n_ins := COALESCE(c.electeurs_inscrits, (SELECT count(*) FROM membres WHERE statut = 'actif'));
  RETURN jsonb_build_object('votants', n_vot, 'inscrits', n_ins,
    'taux', CASE WHEN n_ins > 0 THEN round(100.0 * n_vot / n_ins, 1) ELSE 0 END);
END $$;

-- Résultats : UNIQUEMENT après clôture ---------------------------------------------
CREATE OR REPLACE FUNCTION consultation_resultats(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; n_vot int; n_ins int; n_blanc int; res jsonb; quorum_ok boolean;
BEGIN
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF NOT FOUND OR c.statut = 'brouillon' THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT consultation_close(c) THEN RAISE EXCEPTION 'Les résultats ne sont disponibles qu''après la clôture'; END IF;
  IF c.resultats_visibilite = 'adherents' AND NOT (is_admin() OR is_membre_actif()) THEN RAISE EXCEPTION 'Résultats réservés aux adhérents'; END IF;

  SELECT count(*) INTO n_vot FROM consultation_emargements WHERE consultation_id = p_id;
  n_ins := COALESCE(c.electeurs_inscrits, (SELECT count(*) FROM membres WHERE statut = 'actif'));
  SELECT count(*) INTO n_blanc FROM consultation_votes WHERE consultation_id = p_id AND (ballot->>'blanc')::boolean IS TRUE;
  quorum_ok := c.quorum_pct IS NULL OR (n_ins > 0 AND 100.0 * n_vot / n_ins >= c.quorum_pct);

  IF c.type_vote = 'classement' THEN
    SELECT jsonb_agg(r ORDER BY (r->>'points')::int DESC, r->>'libelle') INTO res FROM (
      SELECT jsonb_build_object('id', o.id, 'libelle', o.libelle,
        'points', COALESCE(sum(nb.n_opt - nb.pos + 1), 0),
        'premier_choix', count(*) FILTER (WHERE nb.pos = 1)) AS r
      FROM consultation_options o
      LEFT JOIN (
        SELECT (e.val)::uuid AS opt_id, e.pos::int AS pos, jsonb_array_length(v.ballot->'ordre') AS n_opt
        FROM consultation_votes v, jsonb_array_elements_text(v.ballot->'ordre') WITH ORDINALITY e(val, pos)
        WHERE v.consultation_id = p_id AND v.ballot ? 'ordre'
      ) nb ON nb.opt_id = o.id
      WHERE o.consultation_id = p_id GROUP BY o.id, o.libelle
    ) t;
  ELSE
    SELECT jsonb_agg(r ORDER BY (r->>'voix')::int DESC, r->>'libelle') INTO res FROM (
      SELECT jsonb_build_object('id', o.id, 'libelle', o.libelle,
        'voix', count(v.id)) AS r
      FROM consultation_options o
      LEFT JOIN consultation_votes v ON v.consultation_id = p_id AND v.ballot ? 'options' AND (v.ballot->'options') ? (o.id::text)
      WHERE o.consultation_id = p_id GROUP BY o.id, o.libelle
    ) t;
  END IF;

  RETURN jsonb_build_object('titre', c.titre, 'type_vote', c.type_vote, 'mode', c.mode,
    'votants', n_vot, 'inscrits', n_ins,
    'taux', CASE WHEN n_ins > 0 THEN round(100.0 * n_vot / n_ins, 1) ELSE 0 END,
    'blancs', n_blanc, 'quorum_pct', c.quorum_pct, 'quorum_atteint', quorum_ok,
    'date_cloture', c.date_cloture, 'options', COALESCE(res, '[]'::jsonb));
END $$;

-- Détail nominatif (admin, consultation nominative close uniquement) -----------------
CREATE OR REPLACE FUNCTION consultation_votes_nominatifs(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF c.mode <> 'nominatif' THEN RAISE EXCEPTION 'Consultation à vote secret : détail nominatif indisponible'; END IF;
  IF NOT consultation_close(c) THEN RAISE EXCEPTION 'Disponible après la clôture'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('numero', m.numero_adherent, 'prenom', m.prenom, 'nom', m.nom, 'ballot', v.ballot)
                     ORDER BY m.nom, m.prenom)
    FROM consultation_votes v LEFT JOIN membres m ON m.id = v.membre_id WHERE v.consultation_id = p_id), '[]'::jsonb);
END $$;

-- Destinataires des e-mails (service_role : fonctions Netlify) ---------------------------
CREATE OR REPLACE FUNCTION consultation_destinataires(p_id uuid, p_non_votants boolean) RETURNS TABLE (email text, prenom text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.email, m.prenom FROM membres m
  WHERE m.statut = 'actif' AND m.email IS NOT NULL
    AND (NOT p_non_votants OR NOT EXISTS (SELECT 1 FROM consultation_emargements e WHERE e.consultation_id = p_id AND e.membre_id = m.id));
$$;

REVOKE ALL ON FUNCTION ouvrir_consultation(uuid), cloturer_consultation(uuid), consultations_cloture_auto(),
  voter(uuid, jsonb), consultation_participation(uuid), consultation_resultats(uuid),
  consultation_votes_nominatifs(uuid), consultation_destinataires(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ouvrir_consultation(uuid), cloturer_consultation(uuid), voter(uuid, jsonb),
  consultation_participation(uuid), consultation_votes_nominatifs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION consultation_resultats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION consultations_cloture_auto(), consultation_destinataires(uuid, boolean) TO service_role;
ALTER FUNCTION consultation_close(consultations) SET search_path = public;
ALTER FUNCTION consultation_en_cours(consultations) SET search_path = public;
