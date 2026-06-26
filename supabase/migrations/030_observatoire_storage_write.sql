-- Permettre aux admins d'uploader des CSV dans le bucket observatoire-csv
-- (la migration 029 ne donnait que la lecture, mais l'admin doit pouvoir
--  uploader depuis le navigateur).

DROP POLICY IF EXISTS "obs_csv_admin_write"  ON storage.objects;
DROP POLICY IF EXISTS "obs_csv_admin_update" ON storage.objects;

CREATE POLICY "obs_csv_admin_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'observatoire-csv' AND is_admin());

CREATE POLICY "obs_csv_admin_update" ON storage.objects FOR UPDATE
  USING      (bucket_id = 'observatoire-csv' AND is_admin())
  WITH CHECK (bucket_id = 'observatoire-csv' AND is_admin());
