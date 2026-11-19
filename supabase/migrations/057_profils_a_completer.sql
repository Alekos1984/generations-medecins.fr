-- Migration 057 - Comptes créés sans fiche adhérent : fiche provisoire "à compléter"
ALTER TABLE membres ADD COLUMN IF NOT EXISTS profil_complet boolean NOT NULL DEFAULT true;
INSERT INTO membres (user_id, email, prenom, nom, statut, est_interne, profil_complet)
SELECT u.id, lower(u.email), 'À compléter', 'À compléter', 'en_attente', false, false
FROM auth.users u
WHERE u.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.membres m WHERE m.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.admins a WHERE a.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.org_membres o WHERE o.user_id = u.id);
