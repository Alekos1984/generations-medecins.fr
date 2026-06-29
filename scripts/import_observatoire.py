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
import re
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

# Mapping département (2 chiffres) → code région INSEE (métropole + DOM-TOM)
# Référence : https://www.insee.fr/fr/information/2114819
DEPT_TO_REGION = {
    # Auvergne-Rhône-Alpes (84)
    "01":"84","03":"84","07":"84","15":"84","26":"84","38":"84","42":"84","43":"84","63":"84","69":"84","73":"84","74":"84",
    # Bourgogne-Franche-Comté (27)
    "21":"27","25":"27","39":"27","58":"27","70":"27","71":"27","89":"27","90":"27",
    # Bretagne (53)
    "22":"53","29":"53","35":"53","56":"53",
    # Centre-Val de Loire (24)
    "18":"24","28":"24","36":"24","37":"24","41":"24","45":"24",
    # Corse (94)
    "2A":"94","2B":"94","20":"94",
    # Grand Est (44)
    "08":"44","10":"44","51":"44","52":"44","54":"44","55":"44","57":"44","67":"44","68":"44","88":"44",
    # Hauts-de-France (32)
    "02":"32","59":"32","60":"32","62":"32","80":"32",
    # Île-de-France (11)
    "75":"11","77":"11","78":"11","91":"11","92":"11","93":"11","94":"11","95":"11",
    # Normandie (28)
    "14":"28","27":"28","50":"28","61":"28","76":"28",
    # Nouvelle-Aquitaine (75)
    "16":"75","17":"75","19":"75","23":"75","24":"75","33":"75","40":"75","47":"75","64":"75","79":"75","86":"75","87":"75",
    # Occitanie (76)
    "09":"76","11":"76","12":"76","30":"76","31":"76","32":"76","34":"76","46":"76","48":"76","65":"76","66":"76","81":"76","82":"76",
    # Pays de la Loire (52)
    "44":"52","49":"52","53":"52","72":"52","85":"52",
    # PACA (93)
    "04":"93","05":"93","06":"93","13":"93","83":"93","84":"93",
    # DOM
    "971":"01","972":"02","973":"03","974":"04","976":"06",
}

# Noms régions pour affichage
REGION_NAMES = {
    "FR":"France entière","11":"Île-de-France","24":"Centre-Val de Loire","27":"Bourgogne-Franche-Comté",
    "28":"Normandie","32":"Hauts-de-France","44":"Grand Est","52":"Pays de la Loire","53":"Bretagne",
    "75":"Nouvelle-Aquitaine","76":"Occitanie","84":"Auvergne-Rhône-Alpes","93":"Provence-Alpes-Côte d'Azur",
    "94":"Corse","01":"Guadeloupe","02":"Martinique","03":"Guyane","04":"La Réunion","06":"Mayotte",
}

# Population INSEE 2024 (estimations) — utilisée pour la densité médicale
REGION_POPULATION = {
    "FR": 68_402_000, "11": 12_317_279, "24": 2_563_598, "27": 2_782_050,
    "28": 3_293_749, "32": 5_969_004, "44": 5_547_575, "52": 3_852_557,
    "53": 3_373_300, "75": 6_056_008, "76": 6_010_571, "84": 8_141_873,
    "93": 5_198_028, "94": 350_416,
    "01": 384_239, "02": 360_749, "03": 290_691, "04": 871_911, "06": 321_000,
}

def parse_age_from_dn(dn, current_year):
    """Essaie d'extraire un âge depuis une date de naissance (formats variés RPPS).
    Retourne None si non parseable ou aberrant."""
    if dn is None: return None
    s = str(dn).strip()
    if not s or s.lower() == "nan": return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y"):
        try:
            age = current_year - datetime.strptime(s, fmt).year
            if 20 < age < 100: return age
        except ValueError:
            pass
    m = re.search(r"(19\d{2}|20[0-1]\d)", s)
    if m:
        age = current_year - int(m.group(1))
        if 20 < age < 100: return age
    return None

def is_femme_from_civilite(civ):
    """Retourne True/False/None depuis le champ civilité RPPS (Mme/M./Mr…)."""
    if civ is None: return None
    c = str(civ).strip().upper()
    if not c or c == "NAN": return None
    if "MME" in c or c == "F" or "MADAME" in c: return True
    if c.startswith("M.") or c.startswith("M ") or c in ("M","MR","H") or "MONSIEUR" in c: return False
    return None

def is_liberal_from_mode(mode):
    """True si exercice libéral, False si salarié, None si indéterminé."""
    if mode is None: return None
    m = str(mode).strip().lower()
    if not m or m == "nan": return None
    if "libéral" in m or "liberal" in m or m.startswith("lib"): return True
    if "salarié" in m or "salarie" in m or "salari" in m: return False
    return None

def dept_to_region(dept):
    if not dept: return None
    d = str(dept).lstrip("0")  # "075" → "75"
    if d in DEPT_TO_REGION: return DEPT_TO_REGION[d]
    # Cas DOM : code postal 971xx, 972xx, etc.
    if len(d) >= 3 and d.startswith("9") and d[:3] in DEPT_TO_REGION:
        return DEPT_TO_REGION[d[:3]]
    return None

# Canonicalisation des spécialités RPPS.
# Le fichier source contient plusieurs codes pour la même spécialité (ex:
# SM26 "Qualifié en Médecine Générale", SM53 "Spécialiste en Médecine
# Générale", SM54 "Médecine Générale" → tout est "Médecine générale").
# On normalise pour fusionner les variantes avant agrégation.
_PARENTHETICAL_RE = re.compile(r"\s*\([^)]*\)")

def canonicalize_specialite(raw):
    """Fusionne les variantes RPPS vers la liste DES 2017 (~44 spécialités).

    Règles :
      - on retire d'abord les parenthèses (ex "Chirurgie maxillo-faciale
        (réforme 2017)" → "Chirurgie maxillo-faciale")
      - puis match sur mots-clés ordonnés du plus spécifique au plus général
        (ex: "Méd cardiovasculaire opt cardio interventionnelle" → Cardiologie)
    """
    if not raw:
        return "Autre"
    s = _PARENTHETICAL_RE.sub("", str(raw).strip()).strip()
    sl = s.lower()

    # ── Cas qualifications / catégories non-spécialité ────────────
    if "qualification" in sl or sl in ("autre",):
        return "Autre"
    if "recherche médicale" in sl or "recherche medicale" in sl:
        return "Recherche médicale"

    # ── SOUS-OPTIONS CARDIO → CARDIOLOGIE ─────────────────────────
    # "Méd cardiovasculaire opt cardio interventionnelle", "...imagerie cardio
    # d'expert", "...rythmo inter stimu card"
    if "cardiovasculaire" in sl or "cardiologie" in sl or "cardio interventionnelle" in sl:
        return "Cardiologie"

    # ── CHIR PÉDIATRIQUE → toutes les sous-options + Chir infantile
    if "chirurgie pédiatrique" in sl or "chirurgie pediatrique" in sl or "chirurgie infantile" in sl:
        return "Chirurgie pédiatrique"

    # ── PSYCHIATRIE (avant Pédopsychiatrie qui contient "psy") ─────
    if "pédo-psychiatrie" in sl or "pedopsychiatrie" in sl or "pédopsychiatrie" in sl:
        return "Pédopsychiatrie"
    if "psychiatrie" in sl:
        return "Psychiatrie"

    # ── MÉDECINE GÉNÉRALE (SM26/SM53/SM54)
    if "médecine générale" in sl or "medecine generale" in sl:
        return "Médecine générale"

    # ── GYNÉCO (3 variantes : médicale, obstétrique, médicale et obstétrique)
    if "gynéco" in sl or "gyneco" in sl:
        return "Gynécologie-obstétrique"

    # ── ANESTHÉSIE-RÉA
    if "anesthés" in sl or "anesthes" in sl:
        return "Anesthésie-réanimation"
    # ── RÉANIMATION (médicale, intensive) — distincte de l'anesthésie
    if "réanimat" in sl or "reanimat" in sl:
        return "Médecine intensive-réanimation"

    # ── RADIO (diagnostic vs thérapie)
    if "radio-thérap" in sl or "radio therap" in sl or "radiothérap" in sl or "radiotherap" in sl:
        return "Radiothérapie"
    if "radiol" in sl or "radio-diagnostic" in sl or "imagerie médicale" in sl or "imagerie medicale" in sl:
        return "Radiologie et imagerie médicale"

    # ── ORL — inclut "O.R.L et chirurgie cervico faciale", "ORL - chir cervico..."
    if "oto-rhino" in sl or "o.r.l" in sl or sl.startswith("orl ") or sl == "orl" \
       or "cervico-faciale" in sl or "cervico faciale" in sl:
        return "ORL / Chirurgie cervico-faciale"

    # ── STOMATOLOGIE / CHIR MAXILLO-FACIALE / CHIR ORALE (réforme 2017 a tout
    # regroupé sous chir maxillo-faciale)
    if "maxillo-faciale" in sl or "stomatologie" in sl or "chirurgie orale" in sl:
        return "Chirurgie maxillo-faciale / Stomatologie"

    # ── MÉDECINE INTERNE (inclut "et immunologie clinique")
    if "médecine interne" in sl or "medecine interne" in sl:
        return "Médecine interne"

    # ── CHIRURGIES SPÉCIALISÉES (le mot-clé "chirurgie" est large, on traite
    # les sous-spés AVANT le fallback Chirurgie générale)
    if "neurochirurg" in sl or "neuro-chirurg" in sl:
        return "Neuro-chirurgie"
    if "chirurgie" in sl:
        if "vasculaire" in sl:                       return "Chirurgie vasculaire"
        if "viscérale" in sl or "viscerale" in sl:   return "Chirurgie viscérale et digestive"
        if "orthopédique" in sl or "orthopedique" in sl: return "Chirurgie orthopédique et traumatologique"
        if "plastique" in sl:                        return "Chirurgie plastique reconstructrice et esthétique"
        if "thoracique" in sl or "cardio-vasculaire" in sl: return "Chirurgie thoracique et cardio-vasculaire"
        if "urologique" in sl:                       return "Urologie"
        if "générale" in sl or "generale" in sl:     return "Chirurgie générale"
        return "Chirurgie générale"
    if "urologie" in sl:
        return "Urologie"

    # ── AUTRES SPÉCIALITÉS (1 mot-clé, pas de variante connue)
    if "pédiatrie" in sl or "pediatrie" in sl:                  return "Pédiatrie"
    if "dermatolog" in sl:                                       return "Dermatologie et vénéréologie"
    if "ophtalmolog" in sl:                                      return "Ophtalmologie"
    if "rhumatolog" in sl:                                       return "Rhumatologie"
    if "neurolog" in sl:                                         return "Neurologie"
    if "gastro" in sl or "hépato-gastro" in sl or "hépatolog" in sl: return "Hépato-gastro-entérologie"
    if "endocrinolog" in sl or "diabéto" in sl or "diabeto" in sl: return "Endocrinologie-diabétologie-nutrition"
    if "pneumolog" in sl:                                        return "Pneumologie"
    if "néphrolog" in sl or "nephrolog" in sl:                  return "Néphrologie"
    if "hématolog" in sl or "hematolog" in sl:                  return "Hématologie"
    if "oncolog" in sl:                                          return "Oncologie médicale"
    if "médecine du travail" in sl or "medecine du travail" in sl: return "Médecine du travail"
    if "médecine légale" in sl or "medecine legale" in sl:     return "Médecine légale"
    if "médecine d'urgence" in sl or "medecine d'urgence" in sl: return "Médecine d'urgence"
    if "médecine vasculaire" in sl or "medecine vasculaire" in sl: return "Médecine vasculaire"
    if "médecine nucléaire" in sl or "medecine nucleaire" in sl: return "Médecine nucléaire"
    if "médecine physique" in sl or "medecine physique" in sl or "réadaptation" in sl or "readaptation" in sl:
        return "Médecine physique et de réadaptation"
    if "santé publique" in sl or "sante publique" in sl:        return "Santé publique"
    if "biolog" in sl:                                           return "Biologie médicale"
    if "génétique" in sl or "genetique" in sl:                   return "Génétique médicale"
    if "anatomie" in sl and "pathologi" in sl:                   return "Anatomie et cytologie pathologiques"
    if "maladies infectieuses" in sl or "tropicales" in sl:      return "Maladies infectieuses et tropicales"
    if "allergolog" in sl:                                       return "Allergologie"
    if "gériatrie" in sl or "geriatrie" in sl:                  return "Gériatrie"

    # Tronque proprement les libellés inconnus restants
    return s[:60]

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
        log("   ⚠ pas de médecins à indexer (RPPS_INDEX vide) — "
            "probablement col_id_pp introuvable dans le fichier source")
        return 0
    log(f"📤 Push de {len(RPPS_INDEX):,} médecins dans rpps_medecins (TRUNCATE + insert)…")
    # Sample des 2 premières lignes pour vérifier visuellement ce qu'on envoie
    sample = list(RPPS_INDEX.values())[:2]
    log(f"   sample[0] = {sample[0] if sample else 'aucun'}")
    if len(sample) > 1:
        log(f"   sample[1] = {sample[1]}")
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
    Lit le RPPS en streaming, agrège PAR RÉGION (12 régions métro + DOM + FR
    entière), médecins actifs + top spécialités. Pour chaque région on dédupe
    sur l'identifiant national PP pour compter des personnes (un médecin
    multi-sites ne doit pas être compté plusieurs fois).
    """
    log("📊 Calcul des indicateurs par région en streaming…")
    encoding = "utf-8"
    total_lignes = 0
    n_match_prof = 0
    dept_counts = {}
    prof_counts = {}
    # Dédup par région
    medecins_par_region = {}        # region → set(id)
    spec_par_id_region = {}         # (region, id) → spec canonique
    attrs_par_id_region = {}        # (region, id) → tuple(civilite, mode_exercice, date_naissance)
    col_dept = col_prof = col_savoir = col_id = None
    col_civilite = col_dnaiss = None

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
                col_civilite = (find_col(headers, "libellé civilité") or find_col(headers, "libelle civilite")
                                or find_col(headers, "civilité") or find_col(headers, "civilite"))
                col_dnaiss   = (find_col(headers, "date", "naissance") or find_col(headers, "naissance"))
                if not col_prof or not (col_cp or col_commune or col_dept):
                    raise ValueError(
                        "Colonnes introuvables. En-têtes contenant 'postal' / 'commune' / 'départ' / 'profes' : "
                        + " | ".join(h for h in headers if any(k in h.lower() for k in ("postal","commune","départ","profes")))
                    )
                if not col_id:
                    raise ValueError(
                        "Colonne d'identifiant national PP introuvable. En-têtes contenant 'identif' : "
                        + " | ".join(h for h in headers if "identif" in (h or "").lower())
                    )
                log(f"   colonnes IDF : cp='{col_cp}' / commune='{col_commune}' / dept(officiel)='{col_dept}' / prof='{col_prof}' / savoir='{col_savoir}'")
                log(f"   colonnes démographiques : civilite='{col_civilite}' / date_naissance='{col_dnaiss}' / mode_ex='{col_mode_ex}'")
                log(f"   colonnes RPPS index : id_pp='{col_id_pp}' / id_nat='{col_id_nat}' / nom='{col_nom}' / prenom='{col_prenom}' / mode_ex='{col_mode_ex}' / libcom='{col_libcom}'")
                if not col_id_pp:
                    log("   ⚠⚠ col_id_pp introuvable — l'index rpps_medecins ne sera PAS peuplé. "
                        "Colonnes contenant 'identifiant' : " +
                        " | ".join(repr(h) for h in headers if "identifiant" in (h or "").lower()))
                DIAG["col_cp"] = col_cp
                DIAG["col_commune"] = col_commune
                DIAG["col_dept"] = col_dept
                DIAG["col_prof"] = col_prof
                DIAG["col_savoir"] = col_savoir
                DIAG["col_id_pp"] = col_id_pp
                DIAG["col_nom"] = col_nom
                DIAG["col_prenom"] = col_prenom

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

            mask_prof = chunk_prof.str.contains("médecin")
            n_match_prof += int(mask_prof.sum())

            # Échantillons des valeurs réellement vues (pour debug)
            for v in chunk_dept.value_counts().head(50).items():
                dept_counts[v[0]] = dept_counts.get(v[0], 0) + int(v[1])
            for v in chunk[col_prof].fillna("").value_counts().head(50).items():
                prof_counts[v[0]] = prof_counts.get(v[0], 0) + int(v[1])

            # ── Agrégation par région (vectorisée pour éviter le timeout) ──
            # Au lieu d'iterrows sur 545k médecins, on enrichit le chunk avec
            # _region et _pid puis on dédup au niveau du chunk avant la boucle.
            med_chunk = chunk[mask_prof].copy()
            if col_id and len(med_chunk):
                med_chunk["_region"] = chunk_dept.loc[med_chunk.index].map(dept_to_region)
                med_chunk = med_chunk[med_chunk["_region"].notna() & med_chunk[col_id].notna()]
                # Première occurrence de chaque (region, pid) — un médecin peut
                # avoir plusieurs sites dans la même région
                med_unique = med_chunk.drop_duplicates(subset=[col_id, "_region"])
                # Ajoute aux sets globaux + capture spécialité, civilité, mode, date_naissance
                for region, group in med_unique.groupby("_region"):
                    s = medecins_par_region.setdefault(region, set())
                    s_fr = medecins_par_region.setdefault("FR", set())
                    pids_arr  = group[col_id].values
                    specs_arr = (group[col_savoir].fillna("Autre").values
                                 if col_savoir else ["Autre"] * len(group))
                    civs_arr  = (group[col_civilite].fillna("").values
                                 if col_civilite else [""] * len(group))
                    modes_arr = (group[col_mode_ex].fillna("").values
                                 if col_mode_ex else [""] * len(group))
                    dns_arr   = (group[col_dnaiss].fillna("").values
                                 if col_dnaiss else [""] * len(group))
                    for pid, spec, civ, mode, dn in zip(pids_arr, specs_arr, civs_arr, modes_arr, dns_arr):
                        if pid not in s:
                            s.add(pid)
                            spec_par_id_region[(region, pid)] = spec
                            attrs_par_id_region[(region, pid)] = (civ, mode, dn)
                        if pid not in s_fr:
                            s_fr.add(pid)
                            spec_par_id_region[("FR", pid)] = spec
                            attrs_par_id_region[("FR", pid)] = (civ, mode, dn)

            # ── Index complet des médecins (tous départements) pour la vérif
            # des adhérents — VECTORISÉ aussi.
            def safe_str(v):
                if v is None: return ""
                if isinstance(v, float) and v != v: return ""
                return str(v).strip()

            if col_id_pp and len(med_chunk):
                # Dédup au niveau du chunk d'abord
                idx_chunk = med_chunk.drop_duplicates(subset=[col_id_pp])
                # Filtre les pid déjà dans RPPS_INDEX (chunks précédents)
                idx_chunk = idx_chunk[~idx_chunk[col_id_pp].astype(str).str.strip().isin(RPPS_INDEX.keys())]
                for _, row in idx_chunk.iterrows():
                    pp = safe_str(row.get(col_id_pp))
                    if not pp or pp in RPPS_INDEX:
                        continue
                    cp_val   = safe_str(row.get(col_cp))     if col_cp     else ""
                    dept_val = cp_val[:2] if cp_val[:2].isdigit() else ""
                    nom      = safe_str(row.get(col_nom))    if col_nom    else ""
                    prenom   = safe_str(row.get(col_prenom)) if col_prenom else ""
                    RPPS_INDEX[pp] = {
                    "identifiant_pp":        pp,
                    "identification_nat":    safe_str(row.get(col_id_nat))  if col_id_nat else None,
                    "nom":                   nom or None,
                    "prenom":                prenom or None,
                    "nom_upper":             nom.upper() if nom else None,
                    "prenom_upper":          prenom.upper() if prenom else None,
                    "libelle_profession":    safe_str(row.get(col_prof))     or None,
                    "libelle_savoir_faire":  safe_str(row.get(col_savoir))   or None if col_savoir else None,
                    "libelle_mode_exercice": safe_str(row.get(col_mode_ex))  or None if col_mode_ex else None,
                    "code_postal":           cp_val or None,
                    "code_departement":      dept_val or None,
                    "libelle_commune":       safe_str(row.get(col_libcom))   or None if col_libcom else None,
                }

            # Progress log toutes les 5 chunks (~500k lignes)
            if total_lignes % 500_000 < 100_000:
                nb_fr = len(medecins_par_region.get("FR", set()))
                log(f"   {total_lignes:,} lignes lues — {nb_fr:,} médecins uniques (FR) jusqu'ici")

    except UnicodeDecodeError:
        log("   ⚠ encodage utf-8 ko, ré-essai latin-1")
        return compute_fallback_encoding(path, "latin-1")

    # Diagnostic final
    DIAG["top_dept"] = dict(sorted(dept_counts.items(), key=lambda x: -x[1])[:20])
    DIAG["top_prof"] = dict(sorted(prof_counts.items(), key=lambda x: -x[1])[:20])
    DIAG["nb_par_region"] = {r: len(s) for r, s in medecins_par_region.items()}
    DIAG["filter_stats"] = {
        "total":               total_lignes,
        "match_prof_seul":     n_match_prof,
        "medecins_FR":         len(medecins_par_region.get("FR", set())),
        "medecins_IDF":        len(medecins_par_region.get("11", set())),
    }
    log(f"   stats filtre : {n_match_prof:,} ont 'médecin' dans la prof, "
        f"FR = {len(medecins_par_region.get('FR', set())):,} uniques, "
        f"IDF = {len(medecins_par_region.get('11', set())):,} uniques")
    log(f"   par région : {DIAG['nb_par_region']}")

    # KPIs : pour chaque région, on émet medecins_actifs + densité + démographie
    kpis = []
    for region, ids in medecins_par_region.items():
        n = len(ids)
        if n < 10: continue   # ignore régions trop petites (DOM peu peuplés)
        label_region = REGION_NAMES.get(region, region)
        kpis.append({
            "id":           "medecins_actifs",
            "valeur":       f"{n:,}".replace(",", " "),
            "label":        f"Médecins actifs — {label_region}",
            "tendance":     None,
            "tendance_dir": "neutral",
            "source":       "RPPS",
            "annee":        ANNEE,
            "region":       region,
        })

        # Densité médicale (médecins / 100k habitants) — référence INSEE
        pop = REGION_POPULATION.get(region)
        if pop:
            densite = 100_000 * n / pop
            kpis.append({
                "id":           "densite",
                "valeur":       f"{densite:.0f} / 100k hab.",
                "label":        f"Densité médicale — {label_region}",
                "tendance":     None,
                "tendance_dir": "neutral",
                "source":       f"RPPS / INSEE pop. {pop:,}".replace(",", " "),
                "annee":        ANNEE,
                "region":       region,
            })

        # Démographie : âge moyen, % > 60 ans, % femmes, % libéraux
        ages, n_femmes, n_civ_known, n_lib, n_mode_known = [], 0, 0, 0, 0
        for pid in ids:
            civ, mode, dn = attrs_par_id_region.get((region, pid), ("", "", ""))
            a = parse_age_from_dn(dn, ANNEE)
            if a is not None: ages.append(a)
            f = is_femme_from_civilite(civ)
            if f is not None: n_civ_known += 1; n_femmes += 1 if f else 0
            l = is_liberal_from_mode(mode)
            if l is not None: n_mode_known += 1; n_lib += 1 if l else 0

        if ages:
            age_moy = sum(ages) / len(ages)
            pct_60  = 100 * sum(1 for a in ages if a >= 60) / len(ages)
            kpis.append({
                "id":           "age_moyen",
                "valeur":       f"{age_moy:.0f} ans",
                "label":        f"Âge moyen — {label_region}",
                "tendance":     None, "tendance_dir": "neutral",
                "source":       "RPPS", "annee": ANNEE, "region": region,
            })
            kpis.append({
                "id":           "pct_plus_60",
                "valeur":       f"{pct_60:.1f}%",
                "label":        f"Médecins ≥ 60 ans — {label_region}",
                "tendance":     None,
                "tendance_dir": "down" if pct_60 < 25 else ("up" if pct_60 > 35 else "neutral"),
                "source":       "RPPS", "annee": ANNEE, "region": region,
            })
        if n_civ_known >= 10:
            pct_f = 100 * n_femmes / n_civ_known
            kpis.append({
                "id":           "pct_femmes",
                "valeur":       f"{pct_f:.1f}%",
                "label":        f"Médecins femmes — {label_region}",
                "tendance":     None, "tendance_dir": "neutral",
                "source":       f"RPPS (civilité, n={n_civ_known})",
                "annee":        ANNEE, "region": region,
            })
        if n_mode_known >= 10:
            pct_l = 100 * n_lib / n_mode_known
            kpis.append({
                "id":           "pct_liberaux",
                "valeur":       f"{pct_l:.1f}%",
                "label":        f"Médecins libéraux — {label_region}",
                "tendance":     None, "tendance_dir": "neutral",
                "source":       f"RPPS (mode d'exercice, n={n_mode_known})",
                "annee":        ANNEE, "region": region,
            })

    # Séries : top spécialités par région (canonicalisées, ≥ 5 médecins)
    series = []
    for region, ids in medecins_par_region.items():
        by_spec_region = {}
        for pid in ids:
            spec_raw = spec_par_id_region.get((region, pid)) or "Autre"
            canon = canonicalize_specialite(spec_raw)
            by_spec_region[canon] = by_spec_region.get(canon, 0) + 1
        top = sorted(by_spec_region.items(), key=lambda x: -x[1])
        top = [(s, n) for s, n in top if n >= 5]
        for rang, (spec, n) in enumerate(top, start=1):
            series.append({
                "serie_id":   "demographie",
                "label":      spec,
                "valeur_num": int(n),
                "valeur_fmt": f"{int(n):,}".replace(",", " "),
                "rang":       rang,
                "source":     "RPPS",
                "annee":      ANNEE,
                "region":     region,
            })
    log(f"✓ {len(kpis)} KPIs et {len(series)} lignes séries (toutes régions confondues)")
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
    """Pour chaque KPI : écrit la nouvelle valeur dans les colonnes *_pending, statut='pending'.
    Clé composite (id, region) — un KPI peut exister pour plusieurs régions."""
    n = 0
    for k in kpis:
        region = k.get("region", "FR")
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
            f"{SUPABASE_URL}/rest/v1/observatoire_kpis?id=eq.{k['id']}&region=eq.{region}",
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
    """Pour chaque ligne : UPSERT sur (region, serie_id, label), écrit dans *_pending.

    Avant d'écrire, on supprime les lignes orphelines : tout label dans
    (region, serie_id) qui n'est PAS dans le nouveau batch est supprimé.
    Ça évite de garder des spécialités héritées d'imports précédents (avant
    canonicalisation, sous-options, fautes de frappe RPPS, etc.).
    """
    # Groupe les nouveaux labels par (region, serie_id)
    new_labels = {}
    for s in series:
        key = (s.get("region", "FR"), s["serie_id"])
        new_labels.setdefault(key, set()).add(s["label"])
    # Supprime les orphelins
    for (region, serie_id), labels in new_labels.items():
        if not labels: continue
        # On lit la liste actuelle puis on DELETE ceux pas dans labels
        q = (f"{SUPABASE_URL}/rest/v1/observatoire_series"
             f"?region=eq.{region}&serie_id=eq.{serie_id}&select=id,label")
        existing = requests.get(q, headers=HEADERS, timeout=30).json() or []
        orphan_ids = [str(r["id"]) for r in existing if r["label"] not in labels]
        if orphan_ids:
            log(f"   🧹 suppression de {len(orphan_ids)} ligne(s) orpheline(s) dans ({region},{serie_id})")
            url = f"{SUPABASE_URL}/rest/v1/observatoire_series?id=in.(" + ",".join(orphan_ids) + ")"
            requests.delete(url, headers=HEADERS, timeout=60)

    n = 0
    for s in series:
        region = s.get("region", "FR")
        # Cherche si la ligne existe (clé : region + serie_id + label)
        q = (f"{SUPABASE_URL}/rest/v1/observatoire_series"
             f"?serie_id=eq.{s['serie_id']}&label=eq.{requests.utils.quote(s['label'])}"
             f"&region=eq.{region}&select=id")
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

    # On crée le record d'import DÈS LE DÉBUT (statut='failed' par défaut) pour
    # avoir une trace même si la suite crashe. On bascule à 'success' à la fin.
    import_id = create_import_row("RPPS", "rpps.txt (en cours)", RPPS_STABLE_URL, 0,
                                   statut="failed", erreur="Import en cours…", diag=DIAG)
    log(f"   import_id (créé au début) = {import_id}")

    try:
        filename, dest_path = fetch_rpps("rpps.txt")
        sample_raw = read_raw_sample(dest_path, n_lines=100)
        kpis, series, nb_lignes = compute(dest_path)

        # Met à jour le record avec les vraies métadonnées + statut=success
        if import_id:
            import json as _json
            requests.patch(
                f"{SUPABASE_URL}/rest/v1/observatoire_imports?id=eq.{import_id}",
                headers=HEADERS,
                json={
                    "fichier":          filename,
                    "nb_lignes_brutes": nb_lignes,
                    "statut":           "success",
                    "erreur":           None,
                    "sample_raw":       (sample_raw or "")[:30000],
                    "colonnes_detectees": _json.dumps(DIAG.get("colonnes", []), ensure_ascii=False)[:8000],
                    "top_valeurs":      _json.dumps(DIAG, ensure_ascii=False, indent=2, default=str)[:30000],
                    "log":              "\n".join(log_lines)[-8000:],
                },
                timeout=30,
            )

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
        import traceback
        log(traceback.format_exc()[:4000])
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
