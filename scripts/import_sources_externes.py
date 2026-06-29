#!/usr/bin/env python3
"""
Import sources externes pour l'Observatoire :
  - Délai moyen rdv généraliste → DREES (Opendatasoft)
  - Zones sous-dotées → data.gouv.fr (zonage ARS médecins généralistes)

Stratégie : pour chaque KPI on tente plusieurs slugs candidats. Si un
dataset répond, on essaie de l'agréger. Sinon, on émet un KPI avec
source="non disponible" et la liste des slugs tentés (visible dans le
rapport admin "raw data").

Lancement : ce script fait partie du workflow GitHub Actions mensuel
(observatoire-import.yml), après import_observatoire.py (RPPS).
"""

import os
import sys
import json
from datetime import datetime, timezone
from io import StringIO

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

ANNEE = datetime.now().year
log_lines = []
def log(msg):
    print(msg)
    log_lines.append(msg)


# ── Recherche data.gouv.fr ────────────────────────────────────
def dgf_search(query, page_size=10):
    """Cherche un dataset sur data.gouv.fr.
    L'API data.gouv.fr préfère les requêtes sans accents et avec + entre mots."""
    import unicodedata
    # Retire les accents pour maximiser les chances de match
    q = unicodedata.normalize("NFD", query).encode("ascii", "ignore").decode("ascii")
    try:
        url = f"https://www.data.gouv.fr/api/1/datasets/?q={requests.utils.quote(q)}&page_size={page_size}"
        r = requests.get(url, timeout=30, headers={"Accept": "application/json"})
        r.raise_for_status()
        data = r.json()
        results = data.get("data", [])
        log(f"     data.gouv.fr search '{q}' → {len(results)} résultat(s)")
        for ds in results[:5]:
            log(f"       · {ds.get('title','?')[:80]} ({ds.get('slug','?')})")
        return results
    except Exception as e:
        log(f"   ⚠ dgf_search('{q}') failed: {e}")
        return []


# ── Recherche DREES (Opendatasoft) ────────────────────────────
def drees_search(query, limit=10):
    """Cherche un dataset sur data.drees via l'API Opendatasoft v2.1."""
    try:
        url = f"{DREES_BASE}/api/explore/v2.1/catalog/datasets?where=search(%22{requests.utils.quote(query)}%22)&limit={limit}"
        r = requests.get(url, timeout=30, headers={"Accept": "application/json"})
        r.raise_for_status()
        results = r.json().get("results", [])
        log(f"     DREES search '{query}' → {len(results)} dataset(s)")
        for ds in results[:5]:
            slug = ds.get("dataset_id") or ds.get("metas",{}).get("default",{}).get("title","?")
            title = ds.get("metas",{}).get("default",{}).get("title", "?")
            log(f"       · {title[:80]} ({slug})")
        return results
    except Exception as e:
        log(f"   ⚠ drees_search('{query}') failed: {e}")
        return []


def fetch_csv(url, sep=None):
    """Download a CSV/TSV and return a DataFrame. Detect separator if needed."""
    try:
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        text = r.text
        if sep is None:
            # auto-detect : ; ou , ou \t
            first_line = text.split("\n", 1)[0]
            sep = ";" if first_line.count(";") > first_line.count(",") else ","
            if first_line.count("\t") > first_line.count(sep):
                sep = "\t"
        return pd.read_csv(StringIO(text), sep=sep, dtype=str, low_memory=False), text
    except Exception as e:
        log(f"   ⚠ fetch_csv({url[:80]}…) failed: {e}")
        return None, ""


# ── KPI 1 : Délai moyen rdv généraliste (DREES) ───────────────
DREES_BASE = "https://data.drees.solidarites-sante.gouv.fr"

def try_drees_delai_rdv():
    """Cherche un dataset DREES sur le délai rdv via l'API search."""
    queries = [
        "delai rdv medecin",
        "delai attente consultation",
        "acces aux soins delai",
        "premier recours generaliste",
    ]
    for q in queries:
        log(f"   · DREES search '{q}'")
        results = drees_search(q, limit=10)
        for ds in results:
            slug = ds.get("dataset_id")
            title = ds.get("metas",{}).get("default",{}).get("title", "")
            if not slug:
                continue
            tl = title.lower()
            if not any(k in tl for k in ("delai", "attente", "acces", "rdv", "rendez-vous", "premier recours")):
                continue
            log(f"     → essai dataset '{title}' ({slug})")
            url = f"{DREES_BASE}/api/explore/v2.1/catalog/datasets/{slug}/exports/csv?delimiter=%3B"
            df, _ = fetch_csv(url)
            if df is None or df.empty:
                continue
            log(f"       {len(df):,} lignes, colonnes : {list(df.columns)[:10]}")
            for col in df.columns:
                cl = col.lower()
                if "delai" in cl or "attente" in cl or "jour" in cl or "duree" in cl:
                    try:
                        nums = pd.to_numeric(df[col], errors="coerce").dropna()
                        if len(nums) > 0:
                            median = float(nums.median())
                            if 1 <= median <= 365:
                                return {
                                    "id":           "delai_rdv_mg",
                                    "valeur":       f"{median:.0f} j",
                                    "label":        "Délai moyen rdv généraliste",
                                    "tendance":     None, "tendance_dir": "neutral",
                                    "source":       f"DREES — {slug}",
                                    "annee":        ANNEE, "region": "FR",
                                }
                    except Exception:
                        pass
            log(f"       ⚠ aucune colonne numérique 'délai/attente/jour' parseable dans {slug}")
    log("   ❌ aucun dataset DREES utilisable trouvé via search")
    return None


# ── KPI 2 : Zones sous-dotées (zonage ARS) ────────────────────
def try_zonage_ars():
    """Cherche un dataset 'zonage' sur data.gouv.fr."""
    queries = [
        "zonage medecins",
        "zonage medical",
        "zones intervention prioritaire",
        "zip zac medecins",
        "desert medical",
    ]
    for q in queries:
        results = dgf_search(q, page_size=15)
        for ds in results:
            title = ds.get("title", "")
            slug = ds.get("slug", "")
            tl = title.lower()
            if not any(k in tl for k in ("zonage", "zone", "desert", "sous-dot", "zip", "zac")):
                continue
            log(f"     → essai dataset '{title}' ({slug})")
            resources = ds.get("resources") or []
            csv_res = [r for r in resources
                       if (r.get("format") or "").lower() in ("csv", "tsv")
                       and r.get("url")]
            if not csv_res:
                log(f"       ⚠ pas de ressource CSV")
                continue
            df, _ = fetch_csv(csv_res[0]["url"])
            if df is None or df.empty:
                continue
            log(f"       {len(df):,} lignes, colonnes : {list(df.columns)[:8]}")
            cols_lower = [c.lower() for c in df.columns]
            zone_col = next((c for c, cl in zip(df.columns, cols_lower)
                             if "zone" in cl or "classement" in cl or "zip" in cl or "zac" in cl), None)
            if not zone_col:
                log(f"       ⚠ pas de colonne zone/classement")
                continue
            vals = df[zone_col].fillna("").astype(str).str.upper()
            total = len(vals)
            n_sous_dotes = int((vals.str.contains("SOUS|ZIP|TRES|TRÈS|SOUS-DOT")).sum())
            if total > 0 and n_sous_dotes > 0:
                pct = 100 * n_sous_dotes / total
                return {
                    "id":           "zones_sous_dotees",
                    "valeur":       f"{pct:.1f}%",
                    "label":        "Communes en zone sous-dotée",
                    "tendance":     None, "tendance_dir": "neutral",
                    "source":       f"ARS via data.gouv.fr — {slug}",
                    "annee":        ANNEE, "region": "FR",
                }
            log(f"       ⚠ pas de catégorie 'sous-dotée' trouvée dans la colonne {zone_col}")
    log("   ❌ aucun zonage ARS exploitable trouvé")
    return None


# ── Écriture Supabase (pending) ───────────────────────────────
def write_kpi_pending(k, import_id):
    region = k.get("region", "FR")
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
        f"{SUPABASE_URL}/rest/v1/observatoire_kpis?id=eq.{k['id']}&region=eq.{region}",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=payload, timeout=30,
    )
    affected = 0
    if r.status_code == 200:
        try: affected = len(r.json())
        except Exception: pass
    if affected == 0:
        insert = {
            "id":     k["id"], "region": region, "valeur": "—",
            "label":  k.get("label", k["id"]),
            **payload,
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/observatoire_kpis",
                      headers={**HEADERS, "Prefer": "return=minimal"},
                      json=insert, timeout=30)


def create_import_row(source, statut, kpi_found):
    payload = {
        "source":           source,
        "fichier":          "sources-externes",
        "storage_path":     "n/a",
        "nb_lignes_brutes": 0,
        "nb_indicateurs":   kpi_found,
        "statut":           statut,
        "log":              "\n".join(log_lines)[-8000:],
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/observatoire_imports",
        headers={**HEADERS, "Prefer": "return=representation"},
        json=payload, timeout=30,
    )
    if r.status_code in (200, 201):
        return r.json()[0]["id"]
    return None


def main():
    log(f"=== Sources externes — {datetime.now().isoformat()} ===")
    found = []

    log("🔍 Tentative DREES — délai rdv généraliste")
    k1 = try_drees_delai_rdv()
    if k1: found.append(k1)

    log("🔍 Tentative zonage ARS — zones sous-dotées")
    k2 = try_zonage_ars()
    if k2: found.append(k2)

    import_id = create_import_row(
        "EXT (DREES+ARS)", "success" if found else "failed",
        len(found),
    )
    log(f"   import_id = {import_id}")

    for k in found:
        write_kpi_pending(k, import_id)
        log(f"   ✓ KPI '{k['id']}' poussé en pending : {k['valeur']} (source: {k['source']})")

    if not found:
        log("⚠ aucun KPI n'a pu être récupéré depuis les sources externes.")
        log("   Les datasets DREES / ARS sont à brancher manuellement.")

    log(f"✅ {len(found)} KPI(s) externe(s) en attente de validation.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ Erreur : {e}")
        import traceback
        log(traceback.format_exc()[:2000])
        sys.exit(1)
