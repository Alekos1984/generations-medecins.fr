-- Migration 050 - Contacts de mobilisation avec consentement (opt-in explicite)
-- Stockés séparément des déclarations (aucun lien avec l'empreinte RPPS) pour préserver la pseudonymisation.
CREATE TABLE IF NOT EXISTS greve_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_id     uuid NOT NULL REFERENCES greve_campagnes(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organisations(id),
  email           text NOT NULL,
  consent_at      timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL DEFAULT '2026-11',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS greve_contacts_unique ON greve_contacts (campagne_id, lower(email));
ALTER TABLE greve_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gct: admin" ON greve_contacts;
CREATE POLICY "gct: admin" ON greve_contacts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "gct: org admin lecture" ON greve_contacts;
CREATE POLICY "gct: org admin lecture" ON greve_contacts FOR SELECT USING (org_id IS NOT NULL AND is_org_admin(org_id));
REVOKE ALL ON greve_contacts FROM anon;
