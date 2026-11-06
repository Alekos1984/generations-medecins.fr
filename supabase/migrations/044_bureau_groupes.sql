-- Migration — Intitulés des groupes du bureau modifiables depuis l'admin
-- (ex. renommer "Chargées de mission" en "Chargé·e·s de mission").
-- Les 3 groupes restent fixes ; seul leur titre affiché est éditable.

CREATE TABLE bureau_groupes (
    groupe     TEXT PRIMARY KEY CHECK (groupe IN ('presidence', 'secretariat', 'mission')),
    titre      TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bureau_groupes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bureau_groupes: lecture publique"
    ON bureau_groupes FOR SELECT USING (TRUE);

CREATE POLICY "bureau_groupes: admin write"
    ON bureau_groupes FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());

INSERT INTO bureau_groupes (groupe, titre) VALUES
    ('presidence',  'Président et vice-président·e·s'),
    ('secretariat', 'Secrétariat & Trésorerie'),
    ('mission',     'Chargées de mission');
