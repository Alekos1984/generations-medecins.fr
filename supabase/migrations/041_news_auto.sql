-- Génération automatique d'articles (News) par LLM.
-- L'admin colle de la matière (liens, notes, texte brut) dans une modale
-- (bouton "✨ Générer automatiquement" dans Articles) → gpt-4o rédige un
-- article complet (titre, chapô, corps HTML, catégorie, tags) + une image
-- de header (gpt-image-1, uploadée dans le bucket newsletter-images).
-- Le résultat est inséré directement dans `news` avec publie=false
-- (brouillon) : pas de table de contenu séparée, `news.publie` EST déjà
-- le statut brouillon/publié du système existant.
--
-- Cette table ne fait que tracer la demande de génération (matière fournie,
-- statut, erreurs) pour permettre le polling depuis l'admin et le
-- diagnostic en cas d'échec — même rôle que observatoire_imports.

CREATE TABLE IF NOT EXISTS news_auto_briefs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_input        text NOT NULL,
  hero_hint        text,
  statut           text NOT NULL DEFAULT 'generating'
                   CHECK (statut IN ('generating','done','error')),
  created_news_id  uuid REFERENCES news(id) ON DELETE SET NULL,
  erreur           text,
  log              text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_news_auto_briefs_statut
  ON news_auto_briefs (statut, created_at DESC);

ALTER TABLE news_auto_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "news_auto_briefs_admin_read"
  ON news_auto_briefs FOR SELECT USING (is_admin());
CREATE POLICY "news_auto_briefs_admin_write"
  ON news_auto_briefs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
