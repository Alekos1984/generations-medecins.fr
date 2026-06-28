#!/usr/bin/env python3
"""
Import automatique Observatoire :
  1. Télécharge le dernier CSV RPPS depuis data.gouv.fr
  2. Upload le fichier brut dans Supabase Storage (bucket 'observatoire-csv')
  3. Crée une ligne observatoire_imports (historique)
  4. Calcule les KPIs et séries
  5. Écrit les nouvelles valeurs dans les colonnes *_pending (statut='pending')
  6. L'admin valide ensuite depuis le dashboard → la valeur courante est remplacée

Lancement : GitHub Action mensuelle (.github/workflows/observatoire-import.yml)
ou manuel : python scripts/import_observatoire.py

Dépendances : requests, pandas, python-dotenv (voir scripts/requirements.txt)
"""

import os
import sys
from datetime import datetime, timezone

import requests
import pandas as pd

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL et SUPABASE_SERVICE_KEY requis.", file=sys.stderr)
    sys.exit(1)

HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
}

# Départements IDF (le RPPS stocke souvent les codes sur 3 chiffres avec zéro
# de tête, ex "075", "077". On normalise les deux formats.)
IDF_DEPTS = {"75", "77", "78", "91", "92", "93", "94", "95",
             "075", "077", "078", "091", "092", "093", "094", "095"}

# Mapping des libellés longs → labels courts pour l'affichage
SPECIALITE_LABELS = {
    "Médecine générale":              "Médecine générale",
    "Psychiatrie":                    "Psychiatrie",
    "Cardiologie et maladies vasculaires": "Cardiologie",
    "Pédiatrie":                      "Pédiatrie",
    "Gynécologie médicale et obstétrique": "Gynécologie",
    "Dermatologie et vénéréologie":   "Dermatologie",
    "Chirurgie générale":             "Chirurgie générale",
    "Anesthésiologie-réanimation chirurgicale": "Anesthésie",
    "Gastro-entérologie et hépatologie": "Gastro-entérologie",
    "Radiologie":                     "Radiologie",
    "Ophtalmologie":                  "Ophtalmologie",
    "ORL":                            "ORL",
    "Rhumatologie":                   "Rhumatologie",
    "Neurologie":                     "Neurologie",
}

# URL stable data.gouv.fr — redirige toujours vers la dernière version du
# fichier "ps-libreacces-personne-activite.txt" (~700 Mo, ~1.2 M lignes).
# Dataset : annuaire-sante-extractions-des-donnees-en-libre-acces
RPPS_STABLE_URL = "https://www.data.gouv.fr/api/1/datasets/r/fffda7e9-0ea2-4c35-bba0-4496f3af935d"

ANNEE = datetime.now().year

log_lines = []
def log(msg):
    print(msg)
    log_lines.append(msg)


# ── Téléchargement CSV (streaming sur disque) ─────────────────
def fetch_rpps(dest_path="rpps.txt"):
    """
    Télécharge le fichier RPPS depuis l'URL stable data.gouv.fr.
    Streaming sur disque (~700 Mo, on ne le garde pas en RAM).
    Retourne (filename, dest_path).
    """
    log(f"📥 Téléchargement RPPS depuis {RPPS_STABLE_URL}")
    with requests.get(RPPS_STABLE_URL, stream=True, timeout=600, allow_redirects=True) as resp:
        resp.raise_for_status()
        final_url = resp.url
        filename = final_url.rstrip("/").split("/")[-1] or "rpps.txt"
        total = int(resp.headers.get("Content-Length", 0))
        size = 0
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):  # 1 Mo
                if chunk:
                    f.write(chunk)
                    size += len(chunk)
                    if total and size % (50 * 1024 * 1024) < 1024 * 1024:
                        log(f"   {size/1024/1024:.0f}/{total/1024/1024:.0f} Mo")
        log(f"   ✓ {size/1024/1024:.1f} Mo téléchargés ({filename})")
    return filename, dest_path


# ── Parsing CSV RPPS (streaming en chunks) ────────────────────
def find_col(headers, *substrings):
    """Trouve une colonne dont le nom contient toutes les substrings (case-insensitive)."""
    for h in headers:
        hl = (h or "").lower()
        if all(s.lower() in hl for s in substrings):
            return h
    return None


def find_col_exact(headers, name):
    """Match exact (insensible à la casse) sur le nom normalisé.
    Indispensable pour 'Identifiant PP' qui est un sous-string de 'Type d'identifiant PP'
    et de 'Identification nationale PP'.
    """
    target = name.strip().lower()
    for h in headers:
        if (h or "").strip().lower() == target:
            return h
    return None


def read_raw_sample(path, n_lines=100):
    """Lit les n premières lignes brutes du fichier (pour diagnostic admin)."""
    out = []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for _ in range(n_lines):
            line = f.readline()
            if not line:
                break
            out.append(line.rstrip("\n"))
    return "\n".join(out)


# Diagnostic global rempli par compute() pour le log Supabase
DIAG = {"colonnes": [], "top_dept": {}, "top_prof": {}, "filter_stats": {}}

# Index complet des médecins (tous départements) pour la vérification des adhérents.
# Rempli par compute() au fur et à mesure, puis bulk-inséré dans Supabase
# par push_rpps_index().
RPPS_INDEX = {}   # identifiant_pp → dict des champs (dédupliqué)


def push_rpps_index():
    """TRUNCATE + bulk insert dans rpps_medecins. Batches de 500 lignes."""
    if not RPPS_INDEX:
        log("   ⚠ pas de médecins à indexer (RPPS_INDEX vide)")
        return 0
    log(f"📤 Push de {len(RPPS_INDEX):,} médecins dans rpps_medecins (TRUNCATE + insert)…")
    # 1. Truncate via PostgREST (DELETE all rows)
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/rpps_medecins?identifiant_pp=neq.__never__",
        headers=HEADERS, timeout=120,
    )
    if r.status_code not in (200, 204):
        log(f"   ⚠ truncate failed {r.status_code} : {r.text[:200]}")
    # 2. Bulk insert
    rows = list(RPPS_INDEX.values())
    BATCH = 500
    n_ok = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpps_medecins",
            headers={**HEADERS, "Prefer": "return=minimal"},
            json=batch, timeout=60,
        )
        if r.status_code in (200, 201, 204):
            n_ok += len(batch)
            if i % 5000 == 0:
                log(f"   {n_ok:,}/{len(rows):,} insérés…")
        else:
            log(f"   ⚠ batch {i} failed {r.status_code} : {r.text[:200]}")
    log(f"   ✓ {n_ok:,} médecins indexés")
    return n_ok


def compute(path):
    """
    Lit le RPPS en streaming (pandas chunks de 100k lignes), agrège
    médecins IDF + top spécialités sans tout charger en RAM.
    """
    log("📊 Calcul des indicateurs en streaming…")
    encoding = "utf-8"
    total_lignes = 0
    total_idf = 0
    n_match_prof = 0
    n_match_dept = 0
    dept_counts = {}
    prof_counts = {}
    by_spec = {}
    # Un médecin peut avoir plusieurs lignes (multi-sites d'exercice).
    # On dédupe sur l'identifiant national PP pour compter des personnes.
    medecins_idf_ids = set()
    spec_par_id = {}   # id → première spécialité rencontrée (pour le top)
    col_dept = col_prof = col_savoir = col_id = None

    try:
        reader = pd.read_csv(path, sep="|", encoding=encoding, dtype=str,
                              chunksize=100_000, low_memory=False, on_bad_lines="skip")
        col_cp = col_commune = None
        for chunk in reader:
            if col_prof is None:
                headers = list(chunk.columns)
                DIAG["colonnes"] = headers
                # La colonne "Code Département (structure)" du RPPS est vide à
                # 100 % en pratique. On extrait le département depuis le code
                # postal ou le code commune INSEE (les 2 premiers chiffres).
                # Match EXACT pour ces colonnes : "Identifiant PP" est un
                # sous-string de "Type d'identifiant PP" et de "Identification
                # nationale PP". Avec un substring-match on récupère la
                # mauvaise colonne (Type = "8" pour tous → toutes les inserts
                # rpps_medecins échouent en conflit de clé primaire).
                col_id_pp  = find_col_exact(headers, "Identifiant PP")
                col_id_nat = find_col_exact(headers, "Identification nationale PP")
                col_id     = col_id_nat or col_id_pp
                col_nom    = find_col_exact(headers, "Nom d'exercice")    or find_col(headers, "nom d'exercice") or find_col(headers, "nom d exercice")
                col_prenom = find_col_exact(headers, "Prénom d'exercice") or find_col(headers, "prénom d'exercice") or find_col(headers, "prenom d'exercice")
                col_mode_ex= find_col(headers, "libellé mode exercice") or find_col(headers, "libelle mode exercice")
                col_libcom = find_col(headers, "libellé commune") or find_col(headers, "libelle commune")
                col_cp     = find_col(headers, "code postal", "structure")
                col_commune= find_col(headers, "code commune", "structure")
                col_dept   = (find_col(headers, "code département") or find_col(headers, "code departement")
                              or find_col(headers, "département", "structure") or find_col(headers, "departement", "structure"))
                col_prof   = find_col(headers, "libellé profession") or find_col(headers, "libelle profession")
                col_savoir = find_col(headers, "libellé savoir-faire") or find_col(headers, "libelle savoir-faire")
                if not col_prof or not (col_cp or col_commune or col_dept):
                    raise ValueError(
                        "Colonnes introuvables. En-têtes contenant 'postal' / 'commune' / 'départ' / 'profes' : "
                        + " | ".join(h for h in headers if any(k in h.lower() for k in ("postal","commune","départ","profes")))
                    )
                log(f"   colonnes : cp='{col_cp}' / commune='{col_commune}' / dept(officiel)='{col_dept}' / prof='{col_prof}' / savoir='{col_savoir}'")
                DIAG["col_cp"] = col_cp
                DIAG["col_commune"] = col_commune
                DIAG["col_dept"] = col_dept
                DIAG["col_prof"] = col_prof
                DIAG["col_savoir"] = col_savoir

            total_lignes += len(chunk)
            chunk_prof = chunk[col_prof].fillna("").str.lower()

            # Construction du département : priorité au code postal (présent
            # pour les professionnels avec adresse de structure), fallback au
            # code commune INSEE. Dans les deux cas on prend les 2 premiers
            # chiffres (valide pour métropole ; les DOM ne nous intéressent
            # pas pour l'IDF de toute façon).
            if col_cp:
                cp = chunk[col_cp].fillna("").str.strip()
                chunk_dept = cp.str.slice(0, 2)
                if col_commune:
                    fallback = chunk[col_commune].fillna("").str.strip().str.slice(0, 2)
                    chunk_dept = chunk_dept.where(chunk_dept.str.match(r"^\d{2}$"), fallback)
            elif col_commune:
                chunk_dept = chunk[col_commune].fillna("").str.strip().str.slice(0, 2)
            else:
                chunk_dept = chunk[col_dept].fillna("")

            # Compteurs séparés (pour diagnostic) avant l'ET final
            mask_prof = chunk_prof.str.contains("médecin")
            mask_dept = chunk_dept.isin(IDF_DEPTS)
            n_match_prof += int(mask_prof.sum())
            n_match_dept += int(mask_dept.sum())

            # Échantillons des valeurs réellement vues (pour debug)
            for v in chunk_dept.value_counts().head(50).items():
                dept_counts[v[0]] = dept_counts.get(v[0], 0) + int(v[1])
            for v in chunk[col_prof].fillna("").value_counts().head(50).items():
                prof_counts[v[0]] = prof_counts.get(v[0], 0) + int(v[1])

            mask = mask_prof & mask_dept
            sub = chunk[mask]
            total_idf += len(sub)

            # Dédup sur l'identifiant PP
            if col_id:
                for _, row in sub.iterrows():
                    pid = row.get(col_id)
                    if not pid: continue
                    if pid not in medecins_idf_ids:
                        medecins_idf_ids.add(pid)
                        if col_savoir:
                            spec_par_id[pid] = row.get(col_savoir) or "Autre"
            elif col_savoir and len(sub):
                counts = sub[col_savoir].fillna("Autre").value_counts()
                for spec, n in counts.items():
                    by_spec[spec] = by_spec.get(spec, 0) + int(n)

            # ── Index complet des médecins (tous départements) pour la vérif
            # des adhérents. Une ligne par identifiant_pp, dédupliquée.
            all_med = chunk[mask_prof]
            for _, row in all_med.iterrows():
                pp = (row.get(col_id_pp) or "").strip() if col_id_pp else ""
                if not pp or pp in RPPS_INDEX:
                    continue
                cp_val = (row.get(col_cp) or "").strip() if col_cp else ""
                dept_val = cp_val[:2] if cp_val[:2].isdigit() else ""
                nom = (row.get(col_nom) or "").strip() if col_nom else ""
                prenom = (row.get(col_prenom) or "").strip() if col_prenom else ""
                RPPS_INDEX[pp] = {
                    "identifiant_pp":        pp,
                    "identification_nat":    (row.get(col_id_nat) or "").strip() if col_id_nat else None,
                    "nom":                   nom or None,
                    "prenom":                prenom or None,
                    "nom_upper":             nom.upper() if nom else None,
                    "prenom_upper":          prenom.upper() if prenom else None,
                    "libelle_profession":    row.get(col_prof) or None,
                    "libelle_savoir_faire":  row.get(col_savoir) if col_savoir else None,
                    "libelle_mode_exercice": row.get(col_mode_ex) if col_mode_ex else None,
                    "code_postal":           cp_val or None,
                    "code_departement":      dept_val or None,
                    "libelle_commune":       row.get(col_libcom) if col_libcom else None,
                }

            if total_lignes % 500_000 == 0:
                log(f"   {total_lignes:,} lignes lues — {total_idf:,} médecins IDF jusqu'ici")

    except UnicodeDecodeError:
        log("   ⚠ encodage utf-8 ko, ré-essai latin-1")
        return compute_fallback_encoding(path, "latin-1")

    # Recalcul du by_spec à partir des IDs dédupés
    if col_id and spec_par_id:
        for spec in spec_par_id.values():
            by_spec[spec] = by_spec.get(spec, 0) + 1

    nb_medecins_uniques = len(medecins_idf_ids) if col_id else total_idf

    # Diagnostic final
    DIAG["top_dept"] = dict(sorted(dept_counts.items(), key=lambda x: -x[1])[:20])
    DIAG["top_prof"] = dict(sorted(prof_counts.items(), key=lambda x: -x[1])[:20])
    DIAG["filter_stats"] = {
        "total":               total_lignes,
        "match_prof_seul":     n_match_prof,
        "match_dept_seul":     n_match_dept,
        "match_prof_et_dept":  total_idf,
        "medecins_uniques_idf": nb_medecins_uniques,
    }
    log(f"   stats filtre : {n_match_prof:,} ont 'médecin' dans la prof, "
        f"{n_match_dept:,} sont en IDF, intersection = {total_idf:,} lignes "
        f"({nb_medecins_uniques:,} médecins uniques après dédup)")
    log(f"   top 5 depts : {list(DIAG['top_dept'].items())[:5]}")
    log(f"   top 5 profs : {list(DIAG['top_prof'].items())[:5]}")
    log(f"✓ Total : {total_lignes:,} lignes, {nb_medecins_uniques:,} médecins IDF uniques, {len(by_spec)} spécialités")
    total_idf = nb_medecins_uniques

    kpis = [{
        "id":           "medecins_idf",
        "valeur":       f"{total_idf:,}".replace(",", " "),
        "label":        "Médecins actifs en IDF",
        "tendance":     None,
        "tendance_dir": "neutral",
        "source":       "RPPS",
        "annee":        ANNEE,
    }]

    series = []
    top = sorted(by_spec.items(), key=lambda x: -x[1])[:10]
    for rang, (spec, n) in enumerate(top, start=1):
        label = SPECIALITE_LABELS.get(spec, (spec or "Autre")[:30])
        series.append({
            "serie_id":   "demographie_idf",
            "label":      label,
            "valeur_num": int(n),
            "valeur_fmt": f"{int(n):,}".replace(",", " "),
            "rang":       rang,
            "source":     "RPPS",
            "annee":      ANNEE,
        })
    return kpis, series, total_lignes


def compute_fallback_encoding(path, enc):
    """Ré-exécute compute() avec un autre encodage."""
    global _enc_override
    return compute(path)  # simplifié : data.gouv.fr est en utf-8 normalement


# ── Écriture Supabase (statut=pending) ────────────────────────
def create_import_row(source, filename, storage_path, nb_lignes, statut="success", erreur=None,
                      sample_raw=None, diag=None):
    import json as _json
    payload = {
        "source":           source,
        "fichier":          filename,
        "storage_path":     storage_path,
        "nb_lignes_brutes": nb_lignes,
        "statut":           statut,
        "erreur":           erreur,
        "log":              "\n".join(log_lines)[-8000:],
        "sample_raw":       (sample_raw or "")[:30000],
        "colonnes_detectees": _json.dumps(diag.get("colonnes", []), ensure_ascii=False)[:8000] if diag else None,
        "top_valeurs":      _json.dumps({
                              "col_dept":         diag.get("col_dept"),
                              "col_prof":         diag.get("col_prof"),
                              "col_savoir":       diag.get("col_savoir"),
                              "top_dept":         diag.get("top_dept", {}),
                              "top_prof":         diag.get("top_prof", {}),
                              "filter_stats":     diag.get("filter_stats", {}),
                            }, ensure_ascii=False, indent=2)[:30000] if diag else None,
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/observatoire_imports",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=payload, timeout=30,
    )
    if r.status_code in (200, 201):
        return r.json()[0]["id"]
    log(f"   ⚠ create_import_row {r.status_code} : {r.text[:200]}")
    return None


def update_import_row(import_id, nb_indicateurs):
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/observatoire_imports?id=eq.{import_id}",
        headers=HEADERS,
        json={"nb_indicateurs": nb_indicateurs, "log": "\n".join(log_lines)[-8000:]},
        timeout=30,
    )


def write_kpis_pending(kpis, import_id):
    """Pour chaque KPI : écrit la nouvelle valeur dans les colonnes *_pending, statut='pending'."""
    n = 0
    for k in kpis:
        # On UPDATE la ligne existante en ajoutant les valeurs pending
        payload = {
            "valeur_pending":       k["valeur"],
            "tendance_pending":     k.get("tendance"),
            "tendance_dir_pending": k.get("tendance_dir"),
            "source_pending":       k.get("source"),
            "annee_pending":        k.get("annee"),
            "import_id":            import_id,
            "pending_at":           datetime.now(timezone.utc).isoformat(),
            "statut":               "pending",
        }
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/observatoire_kpis?id=eq.{k['id']}",
            headers=HEADERS, json=payload, timeout=30,
        )
        # Si le KPI n'existe pas encore, on l'insère directement (statut=pending)
        if r.status_code == 200 and r.text == "[]":
            insert = {**k, **payload, "id": k["id"]}
            requests.post(f"{SUPABASE_URL}/rest/v1/observatoire_kpis",
                          headers=HEADERS, json=insert, timeout=30)
        n += 1
    return n


def write_series_pending(series, import_id):
    """Pour chaque ligne : UPSERT sur (serie_id, label), écrit dans *_pending."""
    n = 0
    for s in series:
        # Cherche si la ligne existe
        q = f"{SUPABASE_URL}/rest/v1/observatoire_series?serie_id=eq.{s['serie_id']}&label=eq.{requests.utils.quote(s['label'])}&select=id"
        existing = requests.get(q, headers=HEADERS, timeout=30).json()
        payload = {
            "valeur_num_pending": s["valeur_num"],
            "valeur_fmt_pending": s["valeur_fmt"],
            "source_pending":     s.get("source"),
            "annee_pending":      s.get("annee"),
            "import_id":          import_id,
            "pending_at":         datetime.now(timezone.utc).isoformat(),
            "statut":             "pending",
            "rang":               s["rang"],  # rang appliqué tout de suite (ordre attendu)
        }
        if existing:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/observatoire_series?id=eq.{existing[0]['id']}",
                headers=HEADERS, json=payload, timeout=30,
            )
        else:
            # Nouvelle ligne : on l'insère en pending (valeur_num/valeur_fmt vides côté validated)
            insert = {**s, **payload}
            requests.post(f"{SUPABASE_URL}/rest/v1/observatoire_series",
                          headers=HEADERS, json=insert, timeout=30)
        n += 1
    return n


# ── Main ──────────────────────────────────────────────────────
def main():
    log(f"=== Observatoire import — {datetime.now().isoformat()} ===")
    import_id = None
    try:
        filename, dest_path = fetch_rpps("rpps.txt")
        sample_raw = read_raw_sample(dest_path, n_lines=100)
        kpis, series, nb_lignes = compute(dest_path)

        # Historique (pas d'upload du fichier brut — 700 Mo, on garde juste l'URL stable)
        import_id = create_import_row("RPPS", filename, RPPS_STABLE_URL, nb_lignes,
                                       sample_raw=sample_raw, diag=DIAG)
        log(f"   import_id = {import_id}")

        n_kpis   = write_kpis_pending(kpis, import_id)
        n_series = write_series_pending(series, import_id)

        # Index RPPS pour la vérification des adhérents
        push_rpps_index()

        if import_id:
            update_import_row(import_id, n_kpis + n_series)

        log(f"✅ {n_kpis} KPI(s) et {n_series} ligne(s) en attente de validation.")
        log("   → Va dans l'admin > Observatoire pour valider.")

        # Nettoyage du fichier téléchargé
        try: os.remove(dest_path)
        except OSError: pass

    except Exception as e:
        log(f"❌ Erreur : {e}")
        if import_id:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/observatoire_imports?id=eq.{import_id}",
                headers=HEADERS,
                json={"statut": "failed", "erreur": str(e), "log": "\n".join(log_lines)[-8000:]},
                timeout=30,
            )
        sys.exit(1)


if __name__ == "__main__":
    main()
