-- Migration 056 - Détection des comptes créés sans fiche adhérent (visible dans l'admin)
CREATE OR REPLACE FUNCTION comptes_sans_profil()
RETURNS TABLE (email text, cree_le timestamptz, email_confirme boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  RETURN QUERY
    SELECT u.email::text, u.created_at, (u.email_confirmed_at IS NOT NULL)
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.membres m WHERE m.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.org_membres o WHERE o.user_id = u.id)
    ORDER BY u.created_at;
END $$;
REVOKE ALL ON FUNCTION comptes_sans_profil() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION comptes_sans_profil() TO authenticated;
