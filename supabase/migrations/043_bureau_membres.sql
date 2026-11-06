-- Migration — Membres du bureau (page publique bureau.html)
--
-- Jusqu'ici le contenu de bureau.html était codé en dur dans le HTML :
-- chaque changement (ex. un membre qui quitte le secrétariat) nécessitait
-- une intervention développeur. Cette table rend la liste administrable
-- depuis le dashboard admin.
--
-- Les 3 groupes de la page restent fixes (pas de notion de groupe
-- personnalisable) : 'presidence', 'secretariat', 'mission'.

CREATE TABLE bureau_membres (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nom         TEXT NOT NULL,
    role        TEXT NOT NULL,              -- ex: "Président", "Trésorier", "Chargée de mission"
    groupe      TEXT NOT NULL CHECK (groupe IN ('presidence', 'secretariat', 'mission')),
    photo_url   TEXT,                       -- NULL => initiales affichées en fallback côté front
    ordre       INTEGER NOT NULL DEFAULT 0, -- position dans le groupe (croissant)
    actif       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bureau_membres_groupe_ordre ON bureau_membres (groupe, ordre);

ALTER TABLE bureau_membres ENABLE ROW LEVEL SECURITY;

-- Lecture publique des membres actifs uniquement (la page bureau.html n'a pas d'auth)
CREATE POLICY "bureau_membres: lecture publique des actifs"
    ON bureau_membres FOR SELECT
    USING (actif = TRUE);

-- Les admins voient et gèrent tout, y compris les membres désactivés
CREATE POLICY "bureau_membres: lecture admin"
    ON bureau_membres FOR SELECT
    USING (is_admin());

CREATE POLICY "bureau_membres: admin write"
    ON bureau_membres FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

-- Seed : reprend la composition actuelle de bureau.html telle quelle,
-- pour que la bascule vers le pilotage admin ne change rien à l'affichage.
INSERT INTO bureau_membres (nom, role, groupe, photo_url, ordre) VALUES
    ('Alexis Bourla',      'Président',          'presidence',  '../static/bourla.png', 1),
    ('Pierre Hamann',      'Vice-président',     'presidence',  NULL, 2),
    ('Louise Anne Klein',  'Vice-présidente',    'presidence',  NULL, 3),
    ('Cherifa Cheurfa',    'Vice-présidente',    'presidence',  NULL, 4),
    ('Minh-Hanh Ta',       'Secrétaire générale','secretariat', NULL, 1),
    ('Franck Verdonk',     'Trésorier',          'secretariat', NULL, 2),
    ('Rivka Bendrihem',    'Chargée de mission', 'mission',     NULL, 1),
    ('Soraya Hugain',      'Chargée de mission', 'mission',     NULL, 2);
