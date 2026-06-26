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

import io
import os
import sys
import zipfile
import json
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

# Départements IDF
IDF_DEPTS = {"75", "77", "78", "91", "92", "93", "94", "95"}

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

RPPS_DATASET_ID = "53f1e90f-a50c-4e46-9b43-b09d3d15f476"  # conservé pour référence
RPPS_SEARCH_URL = "https://www.data.gouv.fr/api/1/datasets/?q=RPPS+libre+acc%C3%A8s+professionnels+sant%C3%A9&page_size=5"
ANNEE = datetime.now().year

log_lines = []
def log(msg):
    print(msg)
    log_lines.append(msg)


# ── Téléchargement CSV ────────────────────────────────────────
def _pick_csv_resource(resources):
    """Retourne (url, title) du meilleur CSV/ZIP dans une liste de resources."""
    for r in resources:
        t = (r.get("title") or "").lower()
        fmt = (r.get("format") or "").lower()
        if fmt in ("csv", "zip") and any(k in t for k in ("libre", "rpps", "professionnel")):
            return r["url"], r["title"]
    # fallback : premier CSV/ZIP dispo
    for r in resources:
        if (r.get("format") or "").lower() in ("csv", "zip"):
            return r["url"], r["title"]
    return None, None


def _find_rpps_dataset():
    """
    Cherche le dataset RPPS sur data.gouv.fr via l'API de recherche.
    Essaie d'abord par ID connu, sinon cherche par mots-clés.
    Retourne la liste des resources du dataset trouvé.
    """
    # 1) Essai par ID direct
    r = requests.get(f"https://www.data.gouv.fr/api/1/datasets/{RPPS_DATASET_ID}/", timeout=15)
    if r.status_code == 200:
        log(f"   Dataset trouvé par ID : {r.json().get('title','')}")
        return r.json().get("resources", [])

    log(f"   ID {RPPS_DATASET_ID} introuvable (HTTP {r.status_code}), recherche par mots-clés…")

    # 2) Recherche textuelle
    r = requests.get(RPPS_SEARCH_URL, timeout=15)
    r.raise_for_status()
    datasets = r.json().get("data", [])
    for ds in datasets:
        title = (ds.get("title") or "").lower()
        if any(k in title for k in ("rpps", "répertoire partagé", "repertoire partage", "professionnel")):
            log(f"   Dataset trouvé : {ds['title']} (id={ds['id']})")
            return ds.get("resources", [])

    raise ValueError(
        "Dataset RPPS introuvable sur data.gouv.fr. "
        "Vérifiez manuellement sur https://www.data.gouv.fr et mettez à jour RPPS_DATASET_ID."
    )


def fetch_rpps():
    log("🔍 Recherche du dernier extrait RPPS sur data.gouv.fr…")
    resources = _find_rpps_dataset()
    url, title = _pick_csv_resource(resources)
    if not url:
        raise ValueError("Aucun fichier CSV/ZIP trouvé dans le dataset RPPS")

    log(f"   📥 {title} → {url}")
    resp = requests.get(url, timeout=180)
    resp.raise_for_status()
    raw = resp.content
    filename = url.split("/")[-1]

    # Extraction si ZIP
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            csvs = [n for n in z.namelist() if n.lower().endswith(".csv")]
            if not csvs: raise ValueError("Pas de CSV dans le ZIP RPPS")
            raw = z.read(csvs[0])
            filename = csvs[0]
    log(f"   {len(raw)/1024/1024:.1f} Mo récupérés")
    return filename, raw


# ── Upload Storage Supabase ───────────────────────────────────
def upload_csv(filename, raw_bytes):
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = f"rpps/{ts}-{filename}"
    log(f"☁  Upload Storage → observatoire-csv/{path}")
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/observatoire-csv/{path}",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "text/csv",
            "x-upsert":      "true",
        },
        data=raw_bytes,
        timeout=300,
    )
    if r.status_code not in (200, 201):
        log(f"   ⚠  Upload échoué {r.status_code} : {r.text[:200]}")
        return None
    return path


# ── Parsing CSV RPPS ──────────────────────────────────────────
def parse_csv(raw_bytes):
    log("📖 Parsing CSV…")
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(io.BytesIO(raw_bytes), sep="|", encoding=enc, low_memory=False, dtype=str)
            log(f"   {len(df):,} lignes ({enc})")
            return df
        except (UnicodeDecodeError, pd.errors.ParserError):
            continue
    raise ValueError("Décodage CSV impossible")


def find_col(df, *substrings):
    for c in df.columns:
        cl = c.lower()
        if all(s.lower() in cl for s in substrings):
            return c
    return None


# ── Calcul indicateurs ────────────────────────────────────────
def compute(df):
    log("📊 Calcul des indicateurs…")
    col_dept   = find_col(df, "département", "coord") or find_col(df, "departement", "coord")
    col_prof   = find_col(df, "libellé", "profession") or find_col(df, "libelle", "profession")
    col_savoir = find_col(df, "libellé", "savoir-faire") or find_col(df, "libelle", "savoir-faire")

    if not col_dept or not col_prof:
        raise ValueError(f"Colonnes RPPS introuvables. Présentes : {list(df.columns[:25])}")

    mask = df[col_prof].fillna("").str.lower().str.contains("médecin") & df[col_dept].isin(IDF_DEPTS)
    subset = df[mask]
    total_idf = int(len(subset))
    log(f"   Médecins IDF : {total_idf:,}")

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
    if col_savoir:
        counts = subset[col_savoir].value_counts().head(10)
        for rang, (spec, n) in enumerate(counts.items(), start=1):
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
    return kpis, series


# ── Écriture Supabase (statut=pending) ────────────────────────
def create_import_row(source, filename, storage_path, nb_lignes, statut="success", erreur=None):
    payload = {
        "source":           source,
        "fichier":          filename,
        "storage_path":     storage_path,
        "nb_lignes_brutes": nb_lignes,
        "statut":           statut,
        "erreur":           erreur,
        "log":              "\n".join(log_lines)[-8000:],
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
        filename, raw = fetch_rpps()
        storage_path = upload_csv(filename, raw)
        df = parse_csv(raw)
        nb_lignes = len(df)

        import_id = create_import_row("RPPS", filename, storage_path, nb_lignes)
        log(f"   import_id = {import_id}")

        kpis, series = compute(df)
        n_kpis   = write_kpis_pending(kpis, import_id)
        n_series = write_series_pending(series, import_id)

        if import_id:
            update_import_row(import_id, n_kpis + n_series)

        log(f"✅ {n_kpis} KPI(s) et {n_series} ligne(s) en attente de validation.")
        log("   → Va dans l'admin > Observatoire pour valider.")

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
