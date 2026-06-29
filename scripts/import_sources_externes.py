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

def try_drees_apl():
    """Récupère le dataset DREES APL (Accessibilité Potentielle Localisée).
    L'APL est L'indicateur officiel français de mesure des déserts médicaux :
      - APL > 4 consultations/an/hab : bien doté
      - APL entre 2.5 et 4 : fragile
      - APL < 2.5 : sous-doté (zone d'intervention prioritaire)
      - APL < 1.5 : très sous-doté
    Source : DREES, calculé à partir du SNDS + RPPS + INSEE.

    Émet 2 KPIs :
      - apl_moyen FR : valeur moyenne nationale (consultations/an/hab)
      - zones_sous_dotees FR : % communes avec APL < 2.5
    """
    # Slug connu (vu dans le précédent run search)
    candidates = [
        "530_l-accessibilite-potentielle-localisee-apl",
        "l-accessibilite-potentielle-localisee-apl",
    ]
    # Recherche fallback
    if not candidates:
        for q in ["accessibilite potentielle localisee", "apl medecins generalistes"]:
            for ds in drees_search(q, limit=5):
                slug = ds.get("dataset_id")
                if slug and "apl" in slug.lower():
                    candidates.append(slug)

    found = []
    for slug in candidates:
        url = f"{DREES_BASE}/api/explore/v2.1/catalog/datasets/{slug}/exports/csv?delimiter=%3B"
        log(f"   · DREES download '{slug}'")
        df, _ = fetch_csv(url)
        if df is None or df.empty:
            continue
        log(f"     {len(df):,} lignes, colonnes : {list(df.columns)[:12]}")

        # Cherche une colonne profession + une colonne APL numérique
        cols = list(df.columns)
        apl_col = None
        for c in cols:
            cl = c.lower()
            if "apl" in cl and ("medecin" in cl or "gene" in cl or cl.strip() == "apl"):
                apl_col = c; break
        if not apl_col:
            apl_col = next((c for c in cols if "apl" in c.lower()), None)
        prof_col = next((c for c in cols if "profession" in c.lower() or "metier" in c.lower()), None)
        annee_col = next((c for c in cols if c.lower() in ("annee","année","year")), None)

        if not apl_col:
            log(f"     ⚠ pas de colonne APL trouvée")
            continue
        log(f"     col APL = '{apl_col}', col prof = '{prof_col}', col année = '{annee_col}'")

        df_use = df.copy()
        if prof_col:
            # Garde uniquement les lignes "médecins généralistes"
            mask = df_use[prof_col].fillna("").str.lower().str.contains("medecin|généraliste|generaliste|mg|gene")
            df_use = df_use[mask]
            log(f"     filtré sur 'généraliste' : {len(df_use):,} lignes")
        if annee_col and len(df_use):
            # Garde la dernière année dispo
            annees = pd.to_numeric(df_use[annee_col], errors="coerce").dropna()
            if len(annees):
                annee_max = int(annees.max())
                df_use = df_use[pd.to_numeric(df_use[annee_col], errors="coerce") == annee_max]
                log(f"     année max = {annee_max} : {len(df_use):,} lignes")
        if df_use.empty:
            log("     ⚠ après filtres, 0 lignes")
            continue

        nums = pd.to_numeric(df_use[apl_col], errors="coerce").dropna()
        if len(nums) < 10:
            log(f"     ⚠ trop peu de valeurs numériques ({len(nums)})")
            continue
        apl_moyen = float(nums.mean())
        n_sous = int((nums < 2.5).sum())
        n_total = len(nums)
        pct_sous = 100 * n_sous / n_total

        log(f"     ✓ APL moyen = {apl_moyen:.2f} cons/an/hab, "
            f"{n_sous}/{n_total} communes < 2.5 ({pct_sous:.1f}%)")

        annee_kpi = annee_max if annee_col and len(annees) else ANNEE
        found.append({
            "id":           "apl_moyen",
            "valeur":       f"{apl_moyen:.2f}",
            "label":        "APL moyen (cons./an/hab.)",
            "tendance":     None, "tendance_dir": "neutral",
            "source":       f"DREES — APL (slug {slug})",
            "annee":        annee_kpi, "region": "FR",
        })
        found.append({
            "id":           "zones_sous_dotees",
            "valeur":       f"{pct_sous:.1f}%",
            "label":        "Communes en sous-dotation (APL < 2.5)",
            "tendance":     None,
            "tendance_dir": "down" if pct_sous > 30 else "neutral",
            "source":       f"DREES — APL (slug {slug})",
            "annee":        annee_kpi, "region": "FR",
        })
        return found

    log("   ❌ aucun dataset APL accessible")
    return []


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

    log("🔍 DREES — APL (Accessibilité Potentielle Localisée)")
    found.extend(try_drees_apl())

    import_id = create_import_row(
        "EXT (DREES APL)", "success" if found else "failed",
        len(found),
    )
    log(f"   import_id = {import_id}")

    for k in found:
        write_kpi_pending(k, import_id)
        log(f"   ✓ KPI '{k['id']}' poussé en pending : {k['valeur']} (source: {k['source']})")

    if not found:
        log("⚠ aucun KPI n'a pu être récupéré depuis les sources externes.")

    log(f"✅ {len(found)} KPI(s) externe(s) en attente de validation.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"❌ Erreur : {e}")
        import traceback
        log(traceback.format_exc()[:2000])
        sys.exit(1)
