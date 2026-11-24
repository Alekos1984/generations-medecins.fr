-- Migration 064 (appliquee) - Droits des fonctions de la migration 063.
REVOKE ALL ON FUNCTION voter_interne(uuid, jsonb), consultation_resultats_interne(uuid), ouvrir_consultation_interne(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION voter(uuid, jsonb), consultation_resultats(uuid), ouvrir_consultation(uuid), consultation_autorise(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION voter(uuid, jsonb), ouvrir_consultation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION consultation_resultats(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION consultation_destinataires(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consultation_destinataires(uuid, boolean) TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON consultation_participants FROM anon;
