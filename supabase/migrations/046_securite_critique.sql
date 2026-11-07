-- Migration 046 - Correctifs de sécurité critiques (audit)
--  1. courriers_generes : fin de la lecture publique de tous les courriers partagés
--     (lecture par jeton uniquement, via RPC)
--  2. consultations_juridiques : dépôt réservé aux adhérents actifs, et un membre ne
--     peut plus modifier que la demande d'escalade SPI sur ses dossiers
--  3. storage 'consultations' : dépôt réservé aux adhérents actifs

-- 1. Courriers partagés ------------------------------------------------------
DROP POLICY IF EXISTS "cg: lecture" ON courriers_generes;
CREATE POLICY "cg: lecture"
    ON courriers_generes FOR SELECT
    USING (membre_id = mon_membre_id() OR is_admin());

CREATE OR REPLACE FUNCTION get_courrier_partage(p_token text)
RETURNS TABLE (titre text, expediteur jsonb, destinataire jsonb, objet text, contenu text,
               signataire_nom text, signe_le timestamptz, signe_par text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT titre, expediteur, destinataire, objet, contenu, signataire_nom, signe_le, signe_par
    FROM courriers_generes
    WHERE partage_token = p_token AND partage_public = TRUE
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION get_courrier_partage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_courrier_partage(text) TO anon, authenticated;

-- 2. Consultations juridiques -------------------------------------------------
DROP POLICY IF EXISTS "cj: creation" ON consultations_juridiques;
CREATE POLICY "cj: creation"
    ON consultations_juridiques FOR INSERT
    WITH CHECK (membre_id = mon_membre_id() AND is_membre_actif());

CREATE OR REPLACE FUNCTION cj_restreindre_membre()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- service_role (fonctions Netlify) : auth.uid() est NULL ; admins : libres
    IF auth.uid() IS NULL OR is_admin() THEN
        RETURN NEW;
    END IF;
    -- Membre : seules escalade_spi / escalade_spi_le peuvent changer, et uniquement vers "demandée"
    IF NEW.membre_id IS DISTINCT FROM OLD.membre_id
       OR NEW.question IS DISTINCT FROM OLD.question
       OR NEW.question_reformulee IS DISTINCT FROM OLD.question_reformulee
       OR NEW.documents IS DISTINCT FROM OLD.documents
       OR NEW.reponse_doctrine IS DISTINCT FROM OLD.reponse_doctrine
       OR NEW.synthese IS DISTINCT FROM OLD.synthese
       OR NEW.pdf_url IS DISTINCT FROM OLD.pdf_url
       OR NEW.statut IS DISTINCT FROM OLD.statut
       OR NEW.note_operateur IS DISTINCT FROM OLD.note_operateur
       OR (OLD.escalade_spi = TRUE AND NEW.escalade_spi IS DISTINCT FROM OLD.escalade_spi) THEN
        RAISE EXCEPTION 'Modification non autorisée sur ce dossier';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cj_restreindre ON consultations_juridiques;
CREATE TRIGGER trg_cj_restreindre BEFORE UPDATE ON consultations_juridiques
    FOR EACH ROW EXECUTE FUNCTION cj_restreindre_membre();

-- 3. Storage consultations ------------------------------------------------------
DROP POLICY IF EXISTS "consult: depot" ON storage.objects;
CREATE POLICY "consult: depot"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'consultations'
        AND (
            ((storage.foldername(name))[1] = public.mon_membre_id()::text AND public.is_membre_actif())
            OR public.is_admin()
        )
    );
