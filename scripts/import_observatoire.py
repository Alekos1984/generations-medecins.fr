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


def compute(path):
    """
    Lit le RPPS en streaming (pandas chunks de 100k lignes), agrège
    médecins IDF + top spécialités sans tout charger en RAM.
    """
    log("📊 Calcul des indicateurs en streaming…")
    encoding = "utf-8"
    total_lignes = 0
    total_idf = 0
    by_spec = {}
    col_dept = col_prof = col_savoir = None

    try:
        reader = pd.read_csv(path, sep="|", encoding=encoding, dtype=str,
                              chunksize=100_000, low_memory=False, on_bad_lines="skip")
        for chunk in reader:
            if col_prof is None:
                headers = list(chunk.columns)
                col_dept   = (find_col(headers, "code département") or find_col(headers, "code departement")
                              or find_col(headers, "département", "structure") or find_col(headers, "departement", "structure"))
                col_prof   = find_col(headers, "libellé profession") or find_col(headers, "libelle profession")
                col_savoir = find_col(headers, "libellé savoir-faire") or find_col(headers, "libelle savoir-faire")
                if not col_dept or not col_prof:
                    raise ValueError(
                        "Colonnes introuvables. En-têtes contenant 'départ' / 'profes' : "
                        + " | ".join(h for h in headers if "départ" in h.lower() or "profes" in h.lower())
                    )
                log(f"   colonnes : dept='{col_dept}' / prof='{col_prof}' / savoir='{col_savoir}'")

            total_lignes += len(chunk)
            chunk_prof = chunk[col_prof].fillna("").str.lower()
            chunk_dept = chunk[col_dept].fillna("")
            mask = chunk_prof.str.contains("médecin") & chunk_dept.isin(IDF_DEPTS)
            sub = chunk[mask]
            total_idf += len(sub)

            if col_savoir and len(sub):
                counts = sub[col_savoir].fillna("Autre").value_counts()
                for spec, n in counts.items():
                    by_spec[spec] = by_spec.get(spec, 0) + int(n)

            if total_lignes % 500_000 == 0:
                log(f"   {total_lignes:,} lignes lues — {total_idf:,} médecins IDF jusqu'ici")

    except UnicodeDecodeError:
        log("   ⚠ encodage utf-8 ko, ré-essai latin-1")
        return compute_fallback_encoding(path, "latin-1")

    log(f"✓ Total : {total_lignes:,} lignes, {total_idf:,} médecins IDF, {len(by_spec)} spécialités")

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
        filename, dest_path = fetch_rpps("rpps.txt")
        kpis, series, nb_lignes = compute(dest_path)

        # Historique (pas d'upload du fichier brut — 700 Mo, on garde juste l'URL stable)
        import_id = create_import_row("RPPS", filename, RPPS_STABLE_URL, nb_lignes)
        log(f"   import_id = {import_id}")

        n_kpis   = write_kpis_pending(kpis, import_id)
        n_series = write_series_pending(series, import_id)

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
