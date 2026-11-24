-- Migration 062 - Droits d'execution des fonctions et de la table des questionnaires (suite de 061).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON consultation_questions FROM anon;
REVOKE ALL ON FUNCTION consultation_reponses_texte(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consultation_reponses_texte(uuid) TO authenticated;
REVOKE ALL ON FUNCTION ouvrir_consultation(uuid), voter(uuid, jsonb), consultation_resultats(uuid), consultation_votes_nominatifs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ouvrir_consultation(uuid), voter(uuid, jsonb), consultation_votes_nominatifs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION consultation_resultats(uuid) TO anon, authenticated;
