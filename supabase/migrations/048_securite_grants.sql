-- Migration 048 - Privilèges, numérotation adhérent, buckets (audit sécurité)
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

ALTER FUNCTION next_numero_adherent(text) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION assign_numero_adherent() SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION next_numero_adherent(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION assign_numero_adherent() FROM PUBLIC, anon, authenticated;

UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE id = 'newsletter-images';
UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf','image/png','image/jpeg','image/webp']
WHERE id = 'consultations';
