-- Migration 049 - Preuve de consentement (RGPD)
ALTER TABLE membres
  ADD COLUMN IF NOT EXISTS cgu_version          text,
  ADD COLUMN IF NOT EXISTS cgu_acceptees_le     timestamptz,
  ADD COLUMN IF NOT EXISTS newsletter_consent   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_consent_le timestamptz;
