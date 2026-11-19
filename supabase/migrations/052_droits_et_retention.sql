-- Migration 052 - Droit à l'effacement et durées de conservation (RGPD)
-- 1. Les FK qui bloquaient la suppression d'un compte
ALTER TABLE courriers_generes DROP CONSTRAINT IF EXISTS courriers_generes_membre_id_fkey;
ALTER TABLE courriers_generes ADD CONSTRAINT courriers_generes_membre_id_fkey
  FOREIGN KEY (membre_id) REFERENCES membres(id) ON DELETE CASCADE;
ALTER TABLE decrypteurs DROP CONSTRAINT IF EXISTS decrypteurs_auteur_id_fkey;
ALTER TABLE decrypteurs ADD CONSTRAINT decrypteurs_auteur_id_fkey
  FOREIGN KEY (auteur_id) REFERENCES membres(id) ON DELETE SET NULL;

-- 2. Purge selon les durées annoncées dans la politique de confidentialité
CREATE OR REPLACE FUNCTION purge_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a int; b int; c int; d int;
BEGIN
  DELETE FROM greve_declarations g USING greve_campagnes k
   WHERE g.campagne_id = k.id AND k.date_fin IS NOT NULL AND k.date_fin < (now() - interval '12 months')::date;
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM greve_contacts g USING greve_campagnes k
   WHERE g.campagne_id = k.id AND k.date_fin IS NOT NULL AND k.date_fin < (now() - interval '3 years')::date;
  GET DIAGNOSTICS b = ROW_COUNT;
  DELETE FROM consultations_juridiques WHERE statut IN ('terminee','archivee') AND updated_at < now() - interval '5 years';
  GET DIAGNOSTICS c = ROW_COUNT;
  DELETE FROM rate_limits WHERE window_start < now() - interval '2 days';
  GET DIAGNOSTICS d = ROW_COUNT;
  RETURN jsonb_build_object('greve_declarations', a, 'greve_contacts', b, 'consultations', c, 'rate_limits', d);
END $$;
REVOKE ALL ON FUNCTION purge_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_retention() TO service_role;
