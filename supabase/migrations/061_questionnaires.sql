-- Migration 061 - Questionnaires : une consultation devient un questionnaire de 1 a 30 questions.
-- Types de question : choix_unique, choix_multiple, classement, oui_non, echelle, texte.
-- Les principes de 054 sont conserves : adherents actifs uniquement, une participation par adherent,
-- vote secret (aucun lien emargement/bulletin, aucun horodatage) ou nominatif pour tout le questionnaire,
-- aucun resultat avant la cloture. Les reponses en texte libre ne sont lisibles que par les admins, apres la cloture.
-- (Au moment de cette migration, aucune consultation n'existait : pas de reprise de donnees necessaire.)

CREATE TABLE IF NOT EXISTS consultation_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  ordre           int  NOT NULL DEFAULT 0,
  intitule        text NOT NULL CHECK (length(intitule) BETWEEN 3 AND 500),
  aide            text CHECK (aide IS NULL OR length(aide) <= 1000),
  type_question   text NOT NULL CHECK (type_question IN ('choix_unique','choix_multiple','classement','oui_non','echelle','texte')),
  max_choix       int  CHECK (max_choix IS NULL OR max_choix >= 1),
  obligatoire     boolean NOT NULL DEFAULT true,
  echelle_min     int  NOT NULL DEFAULT 1,
  echelle_max     int  NOT NULL DEFAULT 5,
  echelle_label_min text CHECK (echelle_label_min IS NULL OR length(echelle_label_min) <= 60),
  echelle_label_max text CHECK (echelle_label_max IS NULL OR length(echelle_label_max) <= 60),
  CHECK (echelle_min >= 0 AND echelle_max > echelle_min AND echelle_max <= 10)
);
CREATE INDEX IF NOT EXISTS idx_consult_questions ON consultation_questions (consultation_id, ordre);

ALTER TABLE consultation_options ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES consultation_questions(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_consult_options_q ON consultation_options (question_id, ordre);
ALTER TABLE consultations ALTER COLUMN type_vote DROP NOT NULL;

ALTER TABLE consultation_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consult_q: lecture" ON consultation_questions FOR SELECT
  USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_id AND (c.statut IN ('ouverte','cloturee') OR is_admin())));
CREATE POLICY "consult_q: admin" ON consultation_questions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON consultation_questions FROM anon;

-- Garde : questions modifiables seulement en brouillon ; l'option doit appartenir a une question de la meme consultation
CREATE OR REPLACE FUNCTION consultation_questions_garde() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cid uuid := COALESCE(NEW.consultation_id, OLD.consultation_id); st text;
BEGIN
  SELECT statut INTO st FROM consultations WHERE id = cid;
  IF st IS NOT NULL AND st <> 'brouillon' THEN RAISE EXCEPTION 'Les questions ne peuvent plus etre modifiees une fois la consultation ouverte'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_consultation_questions_garde ON consultation_questions;
CREATE TRIGGER trg_consultation_questions_garde BEFORE INSERT OR UPDATE OR DELETE ON consultation_questions
  FOR EACH ROW EXECUTE FUNCTION consultation_questions_garde();

CREATE OR REPLACE FUNCTION consultation_options_coherence() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.question_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM consultation_questions q WHERE q.id = NEW.question_id AND q.consultation_id = NEW.consultation_id
         AND q.type_question IN ('choix_unique','choix_multiple','classement')) THEN
    RAISE EXCEPTION 'Option rattachee a une question invalide';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_consultation_options_coherence ON consultation_options;
CREATE TRIGGER trg_consultation_options_coherence BEFORE INSERT OR UPDATE ON consultation_options
  FOR EACH ROW EXECUTE FUNCTION consultation_options_coherence();

-- Ouverture : verifie la structure du questionnaire --------------------------------------
CREATE OR REPLACE FUNCTION ouvrir_consultation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; n_q int; n_elec int; bad text;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF c.statut <> 'brouillon' THEN RAISE EXCEPTION 'Cette consultation est deja ouverte ou close'; END IF;
  SELECT count(*) INTO n_q FROM consultation_questions WHERE consultation_id = p_id;
  IF n_q < 1 THEN RAISE EXCEPTION 'Ajoutez au moins une question'; END IF;
  IF n_q > 30 THEN RAISE EXCEPTION '30 questions au maximum'; END IF;
  SELECT q.intitule INTO bad FROM consultation_questions q
   WHERE q.consultation_id = p_id AND q.type_question IN ('choix_unique','choix_multiple','classement')
     AND (SELECT count(*) FROM consultation_options o WHERE o.question_id = q.id) < 2 LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'La question « % » doit avoir au moins deux options', left(bad, 60); END IF;
  SELECT q.intitule INTO bad FROM consultation_questions q
   WHERE q.consultation_id = p_id AND q.type_question = 'choix_multiple' AND q.max_choix IS NOT NULL
     AND q.max_choix > (SELECT count(*) FROM consultation_options o WHERE o.question_id = q.id) LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Le nombre maximal de choix de « % » depasse le nombre d''options', left(bad, 60); END IF;
  IF c.date_cloture IS NULL OR c.date_cloture <= now() THEN RAISE EXCEPTION 'Indiquez une date de cloture dans le futur'; END IF;
  SELECT count(*) INTO n_elec FROM membres WHERE statut = 'actif';
  UPDATE consultations SET statut = 'ouverte', date_ouverture = COALESCE(date_ouverture, now()), electeurs_inscrits = n_elec WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'electeurs_inscrits', n_elec);
END $$;

-- Vote : bulletin = {"answers": {"<id question>": valeur}} ---------------------------------
--   choix_unique : "<id option>"      choix_multiple : ["<id option>", ...]     classement : ["<id option>", ...] (toutes, dans l'ordre)
--   oui_non : "oui" | "non" | "abstention"      echelle : entier      texte : chaine (2000 car. max)
CREATE OR REPLACE FUNCTION voter(p_consultation uuid, p_ballot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c consultations; m membres; q consultation_questions; ans jsonb; v jsonb; clean jsonb := '{}'::jsonb;
  opt_ids uuid[]; chosen uuid[]; n_opt int; txt text; n_rep int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;
  SELECT * INTO m FROM membres WHERE user_id = auth.uid() AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'La participation est reservee aux adherents actifs'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_consultation;
  IF NOT FOUND OR NOT consultation_en_cours(c) THEN RAISE EXCEPTION 'Cette consultation n''est pas ouverte'; END IF;

  ans := COALESCE(p_ballot->'answers', '{}'::jsonb);
  IF jsonb_typeof(ans) <> 'object' THEN RAISE EXCEPTION 'Bulletin invalide'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(ans) k WHERE NOT EXISTS
       (SELECT 1 FROM consultation_questions x WHERE x.consultation_id = c.id AND x.id::text = k)) THEN
    RAISE EXCEPTION 'Bulletin invalide : question inconnue';
  END IF;

  FOR q IN SELECT * FROM consultation_questions WHERE consultation_id = c.id ORDER BY ordre LOOP
    v := ans -> q.id::text;
    IF v IS NULL OR v = 'null'::jsonb OR (jsonb_typeof(v) = 'string' AND btrim(v #>> '{}') = '')
       OR (jsonb_typeof(v) = 'array' AND jsonb_array_length(v) = 0) THEN
      IF q.obligatoire THEN RAISE EXCEPTION 'Question obligatoire sans reponse : %', left(q.intitule, 80); END IF;
      CONTINUE;
    END IF;

    IF q.type_question IN ('choix_unique','choix_multiple','classement') THEN
      SELECT array_agg(id) INTO opt_ids FROM consultation_options WHERE question_id = q.id;
      n_opt := COALESCE(array_length(opt_ids, 1), 0);
      IF q.type_question = 'choix_unique' THEN
        IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'Reponse invalide : %', left(q.intitule, 80); END IF;
        chosen := ARRAY[(v #>> '{}')::uuid];
      ELSE
        IF jsonb_typeof(v) <> 'array' THEN RAISE EXCEPTION 'Reponse invalide : %', left(q.intitule, 80); END IF;
        SELECT array_agg(x::uuid) INTO chosen FROM jsonb_array_elements_text(v) x;
      END IF;
      IF chosen IS NULL OR NOT (chosen <@ opt_ids) OR (SELECT count(DISTINCT e) FROM unnest(chosen) e) <> array_length(chosen, 1) THEN
        RAISE EXCEPTION 'Reponse invalide : %', left(q.intitule, 80);
      END IF;
      IF q.type_question = 'classement' AND array_length(chosen, 1) <> n_opt THEN
        RAISE EXCEPTION 'Classez toutes les options, une seule fois chacune : %', left(q.intitule, 80);
      END IF;
      IF q.type_question = 'choix_multiple' AND q.max_choix IS NOT NULL AND array_length(chosen, 1) > q.max_choix THEN
        RAISE EXCEPTION 'Au maximum % option(s) pour : %', q.max_choix, left(q.intitule, 80);
      END IF;
      clean := clean || jsonb_build_object(q.id::text, CASE WHEN q.type_question = 'choix_unique' THEN to_jsonb(chosen[1]) ELSE to_jsonb(chosen) END);

    ELSIF q.type_question = 'oui_non' THEN
      IF jsonb_typeof(v) <> 'string' OR (v #>> '{}') NOT IN ('oui','non','abstention') THEN RAISE EXCEPTION 'Reponse invalide : %', left(q.intitule, 80); END IF;
      clean := clean || jsonb_build_object(q.id::text, v);

    ELSIF q.type_question = 'echelle' THEN
      IF jsonb_typeof(v) <> 'number' OR (v #>> '{}') !~ '^\d{1,2}$' OR (v #>> '{}')::int < q.echelle_min OR (v #>> '{}')::int > q.echelle_max THEN
        RAISE EXCEPTION 'Reponse invalide (echelle) : %', left(q.intitule, 80);
      END IF;
      clean := clean || jsonb_build_object(q.id::text, (v #>> '{}')::int);

    ELSE -- texte
      IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'Reponse invalide : %', left(q.intitule, 80); END IF;
      txt := btrim(regexp_replace(v #>> '{}', '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
      IF length(txt) > 2000 THEN RAISE EXCEPTION 'Reponse trop longue (2000 caracteres maximum)'; END IF;
      clean := clean || jsonb_build_object(q.id::text, txt);
    END IF;
    n_rep := n_rep + 1;
  END LOOP;

  IF n_rep = 0 THEN RAISE EXCEPTION 'Repondez a au moins une question'; END IF;

  BEGIN
    INSERT INTO consultation_emargements (consultation_id, membre_id) VALUES (c.id, m.id);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Vous avez deja participe a cette consultation';
  END;

  INSERT INTO consultation_votes (consultation_id, membre_id, ballot)
  VALUES (c.id, CASE WHEN c.mode = 'nominatif' THEN m.id END, jsonb_build_object('answers', clean));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Resultats agreges par question : UNIQUEMENT apres la cloture (jamais le texte libre) -------
CREATE OR REPLACE FUNCTION consultation_resultats(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations; q consultation_questions; n_vot int; n_ins int; quorum_ok boolean;
        qres jsonb := '[]'::jsonb; item jsonb; opts jsonb; n_rep int;
BEGIN
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF NOT FOUND OR c.statut = 'brouillon' THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF NOT consultation_close(c) THEN RAISE EXCEPTION 'Les resultats ne sont disponibles qu''apres la cloture'; END IF;
  IF c.resultats_visibilite = 'adherents' AND NOT (is_admin() OR is_membre_actif()) THEN RAISE EXCEPTION 'Resultats reserves aux adherents'; END IF;

  SELECT count(*) INTO n_vot FROM consultation_emargements WHERE consultation_id = p_id;
  n_ins := COALESCE(c.electeurs_inscrits, (SELECT count(*) FROM membres WHERE statut = 'actif'));
  quorum_ok := c.quorum_pct IS NULL OR (n_ins > 0 AND 100.0 * n_vot / n_ins >= c.quorum_pct);

  FOR q IN SELECT * FROM consultation_questions WHERE consultation_id = p_id ORDER BY ordre LOOP
    SELECT count(*) INTO n_rep FROM consultation_votes v WHERE v.consultation_id = p_id AND v.ballot->'answers' ? q.id::text;
    item := jsonb_build_object('id', q.id, 'ordre', q.ordre, 'intitule', q.intitule, 'aide', q.aide, 'type', q.type_question,
                               'obligatoire', q.obligatoire, 'repondants', n_rep);

    IF q.type_question = 'classement' THEN
      SELECT jsonb_agg(r ORDER BY (r->>'points')::int DESC, r->>'libelle') INTO opts FROM (
        SELECT jsonb_build_object('id', o.id, 'libelle', o.libelle,
          'points', COALESCE(sum(nb.n_opt - nb.pos + 1), 0), 'premier_choix', count(*) FILTER (WHERE nb.pos = 1)) AS r
        FROM consultation_options o
        LEFT JOIN (
          SELECT e.val::uuid AS opt_id, e.pos::int AS pos, jsonb_array_length(v.ballot->'answers'->(q.id::text)) AS n_opt
          FROM consultation_votes v, jsonb_array_elements_text(v.ballot->'answers'->(q.id::text)) WITH ORDINALITY e(val, pos)
          WHERE v.consultation_id = p_id AND jsonb_typeof(v.ballot->'answers'->(q.id::text)) = 'array'
        ) nb ON nb.opt_id = o.id
        WHERE o.question_id = q.id GROUP BY o.id, o.libelle) t;
      item := item || jsonb_build_object('options', COALESCE(opts, '[]'::jsonb));

    ELSIF q.type_question = 'choix_unique' THEN
      SELECT jsonb_agg(r ORDER BY (r->>'voix')::int DESC, r->>'libelle') INTO opts FROM (
        SELECT jsonb_build_object('id', o.id, 'libelle', o.libelle, 'voix', count(v.id)) AS r
        FROM consultation_options o
        LEFT JOIN consultation_votes v ON v.consultation_id = p_id AND (v.ballot->'answers'->>(q.id::text)) = o.id::text
        WHERE o.question_id = q.id GROUP BY o.id, o.libelle) t;
      item := item || jsonb_build_object('options', COALESCE(opts, '[]'::jsonb));

    ELSIF q.type_question = 'choix_multiple' THEN
      SELECT jsonb_agg(r ORDER BY (r->>'voix')::int DESC, r->>'libelle') INTO opts FROM (
        SELECT jsonb_build_object('id', o.id, 'libelle', o.libelle, 'voix', count(v.id)) AS r
        FROM consultation_options o
        LEFT JOIN consultation_votes v ON v.consultation_id = p_id
             AND jsonb_typeof(v.ballot->'answers'->(q.id::text)) = 'array'
             AND (v.ballot->'answers'->(q.id::text)) ? (o.id::text)
        WHERE o.question_id = q.id GROUP BY o.id, o.libelle) t;
      item := item || jsonb_build_object('options', COALESCE(opts, '[]'::jsonb));

    ELSIF q.type_question = 'oui_non' THEN
      item := item || jsonb_build_object('reponses', jsonb_build_object(
        'oui',        (SELECT count(*) FROM consultation_votes v WHERE v.consultation_id = p_id AND v.ballot->'answers'->>(q.id::text) = 'oui'),
        'non',        (SELECT count(*) FROM consultation_votes v WHERE v.consultation_id = p_id AND v.ballot->'answers'->>(q.id::text) = 'non'),
        'abstention', (SELECT count(*) FROM consultation_votes v WHERE v.consultation_id = p_id AND v.ballot->'answers'->>(q.id::text) = 'abstention')));

    ELSIF q.type_question = 'echelle' THEN
      item := item || jsonb_build_object('echelle_min', q.echelle_min, 'echelle_max', q.echelle_max,
        'label_min', q.echelle_label_min, 'label_max', q.echelle_label_max,
        'moyenne', (SELECT round(avg((v.ballot->'answers'->>(q.id::text))::numeric), 2) FROM consultation_votes v
                    WHERE v.consultation_id = p_id AND v.ballot->'answers' ? q.id::text),
        'repartition', COALESCE((SELECT jsonb_object_agg(k, n) FROM (
            SELECT g::text AS k, (SELECT count(*) FROM consultation_votes v
                                  WHERE v.consultation_id = p_id AND v.ballot->'answers'->>(q.id::text) = g::text) AS n
            FROM generate_series(q.echelle_min, q.echelle_max) g) s), '{}'::jsonb));
    END IF;
    -- texte : seulement le nombre de repondants (le contenu est reserve aux administrateurs)
    qres := qres || jsonb_build_array(item);
  END LOOP;

  RETURN jsonb_build_object('titre', c.titre, 'mode', c.mode, 'votants', n_vot, 'inscrits', n_ins,
    'taux', CASE WHEN n_ins > 0 THEN round(100.0 * n_vot / n_ins, 1) ELSE 0 END,
    'quorum_pct', c.quorum_pct, 'quorum_atteint', quorum_ok, 'date_cloture', c.date_cloture, 'questions', qres);
END $$;

-- Reponses en texte libre (admin, apres cloture) : ordre melange, sans lien avec les autres reponses en vote secret
CREATE OR REPLACE FUNCTION consultation_reponses_texte(p_question uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q consultation_questions; c consultations;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  SELECT * INTO q FROM consultation_questions WHERE id = p_question;
  IF NOT FOUND OR q.type_question <> 'texte' THEN RAISE EXCEPTION 'Question introuvable'; END IF;
  SELECT * INTO c FROM consultations WHERE id = q.consultation_id;
  IF NOT consultation_close(c) THEN RAISE EXCEPTION 'Disponible apres la cloture'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(t ORDER BY md5(t)) FROM (
    SELECT v.ballot->'answers'->>(q.id::text) AS t FROM consultation_votes v
    WHERE v.consultation_id = c.id AND v.ballot->'answers' ? q.id::text) s), '[]'::jsonb);
END $$;

-- Detail nominatif (admin, nominatif + clos) : meme signature qu'avant, bulletin au nouveau format
CREATE OR REPLACE FUNCTION consultation_votes_nominatifs(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c consultations;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  SELECT * INTO c FROM consultations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Consultation introuvable'; END IF;
  IF c.mode <> 'nominatif' THEN RAISE EXCEPTION 'Consultation a vote secret : detail nominatif indisponible'; END IF;
  IF NOT consultation_close(c) THEN RAISE EXCEPTION 'Disponible apres la cloture'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('numero', m.numero_adherent, 'prenom', m.prenom, 'nom', m.nom, 'ballot', v.ballot)
                     ORDER BY m.nom, m.prenom)
    FROM consultation_votes v LEFT JOIN membres m ON m.id = v.membre_id WHERE v.consultation_id = p_id), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION consultation_reponses_texte(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consultation_reponses_texte(uuid) TO authenticated;
REVOKE ALL ON FUNCTION ouvrir_consultation(uuid), voter(uuid, jsonb), consultation_resultats(uuid), consultation_votes_nominatifs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ouvrir_consultation(uuid), voter(uuid, jsonb), consultation_votes_nominatifs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION consultation_resultats(uuid) TO anon, authenticated;
