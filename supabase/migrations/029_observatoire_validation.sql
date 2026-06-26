-- Observatoire : ajout d'un workflow de validation
-- Les imports automatiques arrivent en statut='pending' ; un admin doit
-- valider pour passer en statut='validated' et afficher publiquement.

ALTER TABLE observatoire_kpis
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'validated' CHECK (statut IN ('validated','pending','rejected')),
  ADD COLUMN IF NOT EXISTS valeur_pending       text,
  ADD COLUMN IF NOT EXISTS tendance_pending     text,
  ADD COLUMN IF NOT EXISTS tendance_dir_pending text,
  ADD COLUMN IF NOT EXISTS source_pending       text,
  ADD COLUMN IF NOT EXISTS annee_pending        int,
  ADD COLUMN IF NOT EXISTS import_id            uuid,
  ADD COLUMN IF NOT EXISTS pending_at           timestamptz;

ALTER TABLE observatoire_series
  ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'validated' CHECK (statut IN ('validated','pending','rejected')),
  ADD COLUMN IF NOT EXISTS valeur_num_pending numeric,
  ADD COLUMN IF NOT EXISTS valeur_fmt_pending text,
  ADD COLUMN IF NOT EXISTS source_pending     text,
  ADD COLUMN IF NOT EXISTS annee_pending      int,
  ADD COLUMN IF NOT EXISTS import_id          uuid,
  ADD COLUMN IF NOT EXISTS pending_at         timestamptz;

-- Historique des imports automatiques (un run = une ligne)
CREATE TABLE IF NOT EXISTS observatoire_imports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text NOT NULL,                   -- ex: 'RPPS', 'DREES'
  fichier      text,                            -- nom CSV ou URL
  storage_path text,                            -- chemin dans le bucket Supabase Storage
  nb_lignes_brutes int,                         -- nb lignes du CSV brut
  nb_indicateurs   int,                         -- nb KPIs+séries calculés
  statut       text NOT NULL DEFAULT 'success' CHECK (statut IN ('success','partial','failed')),
  erreur       text,
  log          text,                            -- résumé du run (stdout)
  created_at   timestamptz DEFAULT now(),
  validated_at timestamptz,                     -- quand l'admin a validé
  validated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE observatoire_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obs_imports_admin_read"  ON observatoire_imports FOR SELECT USING (is_admin());
CREATE POLICY "obs_imports_admin_write" ON observatoire_imports FOR ALL    USING (is_admin()) WITH CHECK (is_admin());

-- Bucket Storage pour les CSV bruts (création manuelle si pas déjà fait)
INSERT INTO storage.buckets (id, name, public)
VALUES ('observatoire-csv', 'observatoire-csv', false)
ON CONFLICT (id) DO NOTHING;

-- RLS sur le bucket : seuls les admins lisent, le service_role écrit
CREATE POLICY "obs_csv_admin_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'observatoire-csv' AND is_admin());
