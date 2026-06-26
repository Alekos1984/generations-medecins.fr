#!/usr/bin/env python3
"""
Import Observatoire data into Supabase.

Sources officielles (open data) :
  - RPPS  : https://www.data.gouv.fr/fr/datasets/repertoire-partage-des-professionnels-de-sante/
  - DREES : https://www.data.gouv.fr/fr/organizations/ministere-des-affaires-sociales-et-de-la-sante/
  - CNAM  : https://www.data.gouv.fr/fr/datasets/open-damir-base-complete-sur-les-depenses-d-assurance-maladie-inter-regimes/

Usage :
  # Téléchargement auto depuis data.gouv.fr
  python scripts/import_observatoire.py

  # Avec un fichier RPPS local (téléchargé manuellement depuis annuaire.sante.fr)
  python scripts/import_observatoire.py --rpps /path/to/PS_LibreAcces_202412.csv

  # Dry-run (calcule sans écrire dans Supabase)
  python scripts/import_observatoire.py --dry-run

Dépendances : pip install supabase python-dotenv requests pandas
"""

import argparse
import os
import sys
import io
import zipfile
import requests
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL  = os.environ.get("SUPABASE_URL",  os.environ.get("VITE_SUPABASE_URL", ""))
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service role key requis pour bypass RLS

if not SUPABASE_URL or not SUPABASE_KEY:
    print("⚠  SUPABASE_URL et SUPABASE_SERVICE_KEY doivent être définis (.env ou variables d'environnement).")
    print("   Exemple .env :")
    print("     SUPABASE_URL=https://xxxx.supabase.co")
    print("     SUPABASE_SERVICE_KEY=eyJ...")
    sys.exit(1)

# Départements Île-de-France
IDF_DEPTS = {"75", "77", "78", "91", "92", "93", "94", "95"}

# Mapping spécialités RPPS → libellés courts pour l'affichage
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
    "Endocrinologie-diabétologie-nutrition": "Endocrinologie",
}

# URL du dataset RPPS sur data.gouv.fr (extrait libre accès)
RPPS_DATAGOUV_DATASET = "https://www.data.gouv.fr/api/1/datasets/53f1e90f-a50c-4e46-9b43-b09d3d15f476/"

ANNEE = datetime.now().year


def fetch_rpps_url() -> str:
    """Récupère l'URL de téléchargement du dernier extrait RPPS sur data.gouv.fr."""
    print("🔍 Recherche du dernier extrait RPPS sur data.gouv.fr…")
    resp = requests.get(RPPS_DATAGOUV_DATASET, timeout=30)
    resp.raise_for_status()
    resources = resp.json().get("resources", [])
    # Cherche le CSV ou ZIP de l'extrait libre accès PS
    for r in resources:
        title = r.get("title", "").lower()
        if "libre" in title and r.get("format", "").lower() in ("csv", "zip"):
            url = r["url"]
            print(f"   Trouvé : {r['title']} → {url}")
            return url
    # Fallback : premier CSV
    for r in resources:
        if r.get("format", "").lower() in ("csv", "zip"):
            url = r["url"]
            print(f"   Fallback : {r['title']} → {url}")
            return url
    raise ValueError("Aucun fichier CSV/ZIP trouvé dans le dataset RPPS.")


def load_rpps_dataframe(path_or_url: str) -> pd.DataFrame:
    """Charge le CSV RPPS (local ou URL). Gère les ZIP et les encodages."""
    print(f"📥 Chargement RPPS depuis : {path_or_url}")

    if path_or_url.startswith("http"):
        resp = requests.get(path_or_url, stream=True, timeout=120)
        resp.raise_for_status()
        raw = resp.content
    else:
        with open(path_or_url, "rb") as f:
            raw = f.read()

    # Si ZIP, extraire le premier CSV
    if raw[:2] == b"PK":
        print("   Format ZIP détecté, extraction…")
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            csv_names = [n for n in z.namelist() if n.lower().endswith(".csv")]
            if not csv_names:
                raise ValueError("Aucun CSV dans le ZIP RPPS.")
            raw = z.read(csv_names[0])
            print(f"   Fichier extrait : {csv_names[0]}")

    # Encodage souvent latin-1 ou utf-8
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(io.BytesIO(raw), sep="|", encoding=enc, low_memory=False, dtype=str)
            print(f"   Encodage {enc} OK — {len(df):,} lignes chargées.")
            return df
        except (UnicodeDecodeError, pd.errors.ParserError):
            continue

    raise ValueError("Impossible de décoder le CSV RPPS.")


def compute_demographie_idf(df: pd.DataFrame) -> list[dict]:
    """
    Agrège le nombre de médecins actifs en IDF par spécialité (top 10).
    Retourne une liste prête pour observatoire_series.
    """
    print("📊 Calcul démographie IDF par spécialité…")

    # Colonnes attendues (peuvent varier légèrement selon version RPPS)
    col_dept     = next((c for c in df.columns if "département" in c.lower() and "coord" in c.lower()), None)
    col_prof     = next((c for c in df.columns if "libellé profession" in c.lower() or "libelle profession" in c.lower()), None)
    col_savoir   = next((c for c in df.columns if "libellé savoir-faire" in c.lower() or "libelle savoir-faire" in c.lower()), None)
    col_mode_ex  = next((c for c in df.columns if "mode exercice" in c.lower()), None)

    if not col_dept or not col_prof:
        print(f"   ⚠  Colonnes introuvables. Colonnes disponibles : {list(df.columns[:20])}")
        return []

    # Filtre : médecins en IDF
    mask_medecin = df[col_prof].str.lower().str.contains("médecin", na=False)
    mask_idf     = df[col_dept].isin(IDF_DEPTS)
    subset       = df[mask_medecin & mask_idf].copy()
    print(f"   {len(subset):,} médecins actifs en IDF trouvés.")

    if col_savoir:
        # Agrège par spécialité
        counts = subset[col_savoir].value_counts().head(15)
    else:
        # Pas de colonne savoir-faire : on group par profession
        counts = subset[col_prof].value_counts().head(15)

    rows = []
    rang = 1
    for specialite, count in counts.items():
        label = SPECIALITE_LABELS.get(specialite, specialite[:30])
        rows.append({
            "serie_id":   "demographie_idf",
            "label":      label,
            "valeur_num": int(count),
            "valeur_fmt": f"{count:,}".replace(",", " "),
            "rang":       rang,
            "source":     "RPPS",
            "annee":      ANNEE,
        })
        rang += 1
        if rang > 10:
            break

    return rows


def compute_kpi_medecins_idf(df: pd.DataFrame) -> dict:
    """Calcule le total médecins actifs en IDF."""
    col_dept = next((c for c in df.columns if "département" in c.lower() and "coord" in c.lower()), None)
    col_prof = next((c for c in df.columns if "libellé profession" in c.lower() or "libelle profession" in c.lower()), None)
    if not col_dept or not col_prof:
        return {}

    mask_medecin = df[col_prof].str.lower().str.contains("médecin", na=False)
    mask_idf     = df[col_dept].isin(IDF_DEPTS)
    total        = int((mask_medecin & mask_idf).sum())

    print(f"   KPI médecins IDF : {total:,}")
    return {
        "id":           "medecins_idf",
        "valeur":       f"{total:,}".replace(",", " "),
        "label":        "Médecins actifs en IDF",
        "tendance":     None,
        "tendance_dir": "neutral",
        "source":       "RPPS",
        "annee":        ANNEE,
    }


def upsert_supabase(table: str, rows: list[dict], conflict_col: str) -> None:
    """Upsert rows dans Supabase via l'API REST."""
    if not rows:
        print(f"   Aucune donnée à écrire dans {table}.")
        return

    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        f"resolution=merge-duplicates,return=representation",
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, json=rows, headers=headers, timeout=60)
    if resp.status_code in (200, 201):
        print(f"   ✅ {len(rows)} lignes upsertées dans {table}.")
    else:
        print(f"   ❌ Erreur {resp.status_code} sur {table} : {resp.text[:300]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import données Observatoire → Supabase")
    parser.add_argument("--rpps",    help="Chemin ou URL du CSV RPPS (auto-téléchargé si absent)")
    parser.add_argument("--dry-run", action="store_true", help="Calcule sans écrire dans Supabase")
    args = parser.parse_args()

    print("=" * 60)
    print("Observatoire · Import données")
    print(f"Cible : {SUPABASE_URL}")
    print("=" * 60)

    # --- RPPS ---
    rpps_url = args.rpps or fetch_rpps_url()
    try:
        df_rpps = load_rpps_dataframe(rpps_url)
    except Exception as e:
        print(f"❌ Impossible de charger RPPS : {e}")
        print("   Conseil : téléchargez manuellement depuis https://annuaire.sante.fr/web/site-pro/extractions-snds")
        print("   et relancez avec --rpps /chemin/vers/fichier.csv")
        sys.exit(1)

    kpi_medecins  = compute_kpi_medecins_idf(df_rpps)
    series_demo   = compute_demographie_idf(df_rpps)

    kpis_to_write   = [kpi_medecins] if kpi_medecins else []
    series_to_write = series_demo

    # Résumé
    print()
    print("── Résumé ──────────────────────────────────────")
    for k in kpis_to_write:
        print(f"  KPI  {k['id']:30s} = {k['valeur']}")
    for s in series_to_write:
        print(f"  Série {s['serie_id']:25s} [{s['rang']:2d}] {s['label']:30s} = {s['valeur_fmt']}")

    if args.dry_run:
        print()
        print("🔎 Dry-run : aucune écriture.")
        return

    print()
    print("── Écriture Supabase ────────────────────────────")
    upsert_supabase("observatoire_kpis",   kpis_to_write,   "id")
    upsert_supabase("observatoire_series", series_to_write, "serie_id,label")

    print()
    print("✅ Import terminé.")


if __name__ == "__main__":
    main()
