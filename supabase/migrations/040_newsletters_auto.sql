-- Newsletter automatique bimensuelle.
-- Workflow : cron Netlify (1er et 15 du mois) ou bouton admin →
-- generer-newsletter-background.js sélectionne les 5 articles les plus
-- importants des 15 derniers jours (gpt-4o-mini) puis rédige la newsletter
-- au vitriol (gpt-4o). Le résultat atterrit ici en statut='pending'.
-- L'admin la relit dans la section Communication, la charge dans le
-- composeur (statut='validated'), l'ajuste et l'envoie via Brevo comme
-- une newsletter normale.

CREATE TABLE IF NOT EXISTS newsletters_auto (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objet          text NOT NULL,
  accroche       text,
  blocs          jsonb NOT NULL DEFAULT '[]',   -- [{type:'text', text:'…'}] — format du composeur admin
  cta_text       text,
  cta_url        text,
  articles       jsonb NOT NULL DEFAULT '[]',   -- [{id, titre, url, source, raison}] les 5 retenus
  periode_debut  date,
  periode_fin    date,
  modele         text,                          -- ex: 'gpt-4o'
  statut         text NOT NULL DEFAULT 'pending'
                 CHECK (statut IN ('pending','validated','rejected','sent')),
  erreur         text,
  log            text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  validated_at   timestamptz,
  validated_by   uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_newsletters_auto_statut
  ON newsletters_auto (statut, created_at DESC);

ALTER TABLE newsletters_auto ENABLE ROW LEVEL SECURITY;

-- Contenu interne jusqu'à l'envoi : admins uniquement
CREATE POLICY "nl_auto_admin_read"
  ON newsletters_auto FOR SELECT USING (is_admin());
CREATE POLICY "nl_auto_admin_write"
  ON newsletters_auto FOR ALL USING (is_admin()) WITH CHECK (is_admin());
