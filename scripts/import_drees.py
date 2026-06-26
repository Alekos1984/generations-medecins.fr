#!/usr/bin/env python3
"""
Import automatique Observatoire — source DREES.

Pourquoi DREES en plus de RPPS :
  - DREES publie un dataset déjà agrégé (effectifs par spécialité × département
    × année) → fichier de quelques Mo au lieu des 700 Mo du RPPS brut.
  - Il couvre 2012 → année courante, donc on peut calculer une vraie tendance
    (N médecins en année N vs N-1) au lieu d'inventer "↓ −3,2%".
  - C'est la source officielle qui agrège le RPPS pour le compte de l'État.

Dataset : "La démographie des professionnels de santé depuis 2012"
Plateforme : data.drees (Opendatasoft)
API export CSV : /api/explore/v2.1/catalog/datasets/{slug}/exports/csv

Le script écrit dans observatoire_kpis/observatoire_series avec statut='pending',
comme import_observatoire.py (RPPS).
"""

import os
import sys
from datetime import datetime, timezone

import requests
import pandas as pd
from io import StringIO

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

# Codes département IDF (DREES utilise les codes INSEE classiques sur 2 chiffres)
IDF_DEPTS = {"75", "77", "78", "91", "92", "93", "94", "95"}

DREES_SLUG = "la-demographie-des-professionnels-de-sante-depuis-2012"
DREES_BASE = "https://data.drees.solidarites-sante.gouv.fr"
DREES_CSV_URL = f"{DREES_BASE}/api/explore/v2.1/catalog/datasets/{DREES_SLUG}/exports/csv?delimiter=%3B&timezone=UTC"

log_lines = []
def log(msg):
    print(msg)
    log_lines.append(msg)


def find_col(headers, *substrings):
    for h in headers:
        hl = (h or "").lower()
        if all(s.lower() in hl for s in substrings):
            return h
    return None


def fetch_drees():
    log(f"📥 Téléchargement DREES : {DREES_CSV_URL}")
    r = requests.get(DREES_CSV_URL, timeout=300)
    r.raise_for_status()
    log(f"   ✓ {len(r.content)/1024:.0f} Ko téléchargés")
    return r.text


def compute(csv_text):
    df = pd.read_csv(StringIO(csv_text), sep=";", dtype=str, low_memory=False)
    log(f"✓ {len(df):,} lignes, {len(df.columns)} colonnes")
    log(f"   colonnes : {list(df.columns)[:15]}")

    # Détection souple des colonnes (les noms peuvent évoluer côté DREES)
    headers = list(df.columns)
    col_annee = find_col(headers, "annee") or find_col(headers, "année")
    col_prof  = (find_col(headers, "profession", "santé") or find_col(headers, "profession_sante")
                 or find_col(headers, "libelle_profession") or find_col(headers, "libellé profession")
                 or find_col(headers, "profession"))
    col_spec  = (find_col(headers, "libelle_specialite") or find_col(headers, "libellé spécialité")
                 or find_col(headers, "specialite") or find_col(headers, "spécialité"))
    col_dept  = (find_col(headers, "code_departement") or find_col(headers, "code département")
                 or find_col(headers, "departement") or find_col(headers, "département"))
    col_eff   = (find_col(headers, "effectif") or find_col(headers, "nombre")
                 or find_col(headers, "count"))

    if not all([col_annee, col_prof, col_dept, col_eff]):
        raise ValueError(
            f"Colonnes DREES introuvables. Trouvé : annee={col_annee}, "
            f"prof={col_prof}, spec={col_spec}, dept={col_dept}, eff={col_eff}. "
            f"Toutes colonnes : {headers}"
        )
    log(f"   → annee='{col_annee}' prof='{col_prof}' spec='{col_spec}' dept='{col_dept}' eff='{col_eff}'")

    df[col_eff] = pd.to_numeric(df[col_eff], errors="coerce").fillna(0).astype(int)
    df[col_annee] = pd.to_numeric(df[col_annee], errors="coerce").astype("Int64")

    # Filtre médecins (la colonne profession contient "Médecin" en français)
    prof_lower = df[col_prof].fillna("").str.lower()
    df_med = df[prof_lower.str.contains("médecin") | prof_lower.str.contains("medecin")]
    if len(df_med) == 0:
        # Le dataset peut ne contenir QUE les médecins, sans colonne profession explicite
        log("   ⚠ aucune ligne 'Médecin' — supposé dataset médecins-only")
        df_med = df

    # Dernière année disponible
    annee_max = int(df_med[col_annee].max())
    log(f"   Dernière année DREES : {annee_max}")

    df_now  = df_med[df_med[col_annee] == annee_max]
    df_prev = df_med[df_med[col_annee] == annee_max - 1]

    # IDF
    dept_now  = df_now[col_dept].fillna("").str.lstrip("0").str.zfill(2)
    dept_prev = df_prev[col_dept].fillna("").str.lstrip("0").str.zfill(2)

    idf_now  = int(df_now[dept_now.isin(IDF_DEPTS)][col_eff].sum())
    idf_prev = int(df_prev[dept_prev.isin(IDF_DEPTS)][col_eff].sum()) if len(df_prev) else 0

    tendance_dir = "neutral"
    tendance_txt = None
    if idf_prev > 0:
        pct = 100.0 * (idf_now - idf_prev) / idf_prev
        sign = "↑" if pct >= 0 else "↓"
        tendance_dir = "up" if pct >= 0 else "down"
        tendance_txt = f"{sign} {pct:+.1f}% vs {annee_max - 1}"

    log(f"   Médecins IDF {annee_max} = {idf_now:,} ({tendance_txt or 'pas de tendance'})")

    kpis = [{
        "id":           "medecins_idf",
        "valeur":       f"{idf_now:,}".replace(",", " "),
        "label":        "Médecins actifs en IDF",
        "tendance":     tendance_txt,
        "tendance_dir": tendance_dir,
        "source":       "DREES (RPPS agrégé)",
        "annee":        annee_max,
    }]

    # Top spécialités IDF
    series = []
    if col_spec:
        df_idf = df_now[dept_now.isin(IDF_DEPTS)]
        top = df_idf.groupby(col_spec)[col_eff].sum().sort_values(ascending=False).head(10)
        for rang, (spec, n) in enumerate(top.items(), start=1):
            series.append({
                "serie_id":   "demographie_idf",
                "label":      (spec or "Autre")[:60],
                "valeur_num": int(n),
                "valeur_fmt": f"{int(n):,}".replace(",", " "),
                "rang":       rang,
                "source":     "DREES",
                "annee":      annee_max,
            })
        log(f"   {len(series)} spécialités top IDF")
    else:
        log("   ⚠ pas de colonne spécialité — séries non calculées")

    return kpis, series, len(df)


def create_import_row(source, filename, nb_lignes, statut="success", erreur=None):
    payload = {
        "source":           source,
        "fichier":          filename,
        "storage_path":     DREES_CSV_URL,
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


def write_kpis_pending(kpis, import_id):
    n = 0
    for k in kpis:
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
        if r.status_code == 200 and r.text == "[]":
            insert = {**k, **payload, "id": k["id"]}
            requests.post(f"{SUPABASE_URL}/rest/v1/observatoire_kpis",
                          headers=HEADERS, json=insert, timeout=30)
        n += 1
    return n


def write_series_pending(series, import_id):
    n = 0
    for s in series:
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
            "rang":               s["rang"],
        }
        if existing:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/observatoire_series?id=eq.{existing[0]['id']}",
                headers=HEADERS, json=payload, timeout=30,
            )
        else:
            insert = {**s, **payload}
            requests.post(f"{SUPABASE_URL}/rest/v1/observatoire_series",
                          headers=HEADERS, json=insert, timeout=30)
        n += 1
    return n


def main():
    log(f"=== Observatoire DREES — {datetime.now().isoformat()} ===")
    import_id = None
    try:
        csv_text = fetch_drees()
        kpis, series, nb_lignes = compute(csv_text)

        import_id = create_import_row("DREES", f"{DREES_SLUG}.csv", nb_lignes)
        log(f"   import_id = {import_id}")

        n_kpis   = write_kpis_pending(kpis, import_id)
        n_series = write_series_pending(series, import_id)

        if import_id:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/observatoire_imports?id=eq.{import_id}",
                headers=HEADERS,
                json={"nb_indicateurs": n_kpis + n_series,
                      "log": "\n".join(log_lines)[-8000:]},
                timeout=30,
            )

        log(f"✅ {n_kpis} KPI(s) et {n_series} ligne(s) en attente de validation.")

    except Exception as e:
        log(f"❌ Erreur : {e}")
        if import_id:
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/observatoire_imports?id=eq.{import_id}",
                headers=HEADERS,
                json={"statut": "failed", "erreur": str(e),
                      "log": "\n".join(log_lines)[-8000:]},
                timeout=30,
            )
        sys.exit(1)


if __name__ == "__main__":
    main()
