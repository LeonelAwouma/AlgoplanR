"""Génère un jeu « réaliste » (établissements + enseignants) pour AlgoPlanR, au format des fichiers nationaux.

    cd backend
    .venv/Scripts/python.exe jeux_de_test/realiste/generer.py [dossier] [--ecoles 450] [--nom realiste]

Sortie par défaut : le dossier `dist` à la racine du projet, 450 écoles. Fichiers : `etablissements_<nom>.xlsx` et
`enseignants_<nom>.xlsx`. Un jeu de 13 000 écoles (taille du primaire public) donne environ 80 000 enseignants.

Ce qui rend le jeu réaliste, sans prétendre être une cartographie réelle :
  - géographie : les dix régions, leurs départements et arrondissements (communes) réels ;
  - sous-systèmes : Nord-Ouest et Sud-Ouest presque entièrement anglophones, quelques écoles anglophones ailleurs ;
  - sécurité : zones rouges concentrées dans l'Extrême-Nord (bassin du Lac Tchad) et les deux régions anglophones,
    zones jaunes à l'Est et dans l'Adamaoua frontaliers ;
  - effectifs et salles : plus grands et plus dotés en ville, petits et souvent multigrades en zone enclavée ;
  - dotation : excédents surtout en milieu urbain du Centre et du Littoral, déficits en zone rurale et enclavée ;
  - enseignants : un par poste occupé (le nombre d'enseignants d'une école vaut `Enseignants_Actuels`), noms par
    aire culturelle, âge, ancienneté, situation familiale et vœux cohérents entre eux.
"""
from __future__ import annotations

import argparse
import math
import random
from pathlib import Path

import pandas as pd

RACINE = Path(__file__).resolve().parents[3]
GRAINE = 20261015
NB_ECOLES = 450
ROMAINS = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

# région : (code, part des écoles, part des écoles anglophones, centre lat/lon, {département: [(commune, type)]})
# type : U urbain (chef-lieu, grande ville), S semi-urbain, R rural.
REGIONS = {
    "Adamaoua": ("ADA", 32, 0.03, (7.3, 13.5), {
        "Vina": [("Ngaoundéré 1er", "U"), ("Ngaoundéré 2e", "U"), ("Ngaoundéré 3e", "S"), ("Belel", "R"),
                 ("Nyambaka", "R")],
        "Djérem": [("Tibati", "S"), ("Ngaoundal", "S")],
        "Faro-et-Déo": [("Tignère", "S"), ("Kontcha", "R")],
        "Mbéré": [("Meiganga", "S"), ("Dir", "R")],
        "Mayo-Banyo": [("Banyo", "S"), ("Bankim", "R")]}),
    "Centre": ("CEN", 62, 0.06, (4.5, 11.8), {
        "Mfoundi": [("Yaoundé 1er", "U"), ("Yaoundé 2e", "U"), ("Yaoundé 3e", "U"), ("Yaoundé 4e", "U"),
                    ("Yaoundé 5e", "U"), ("Yaoundé 6e", "U"), ("Yaoundé 7e", "U")],
        "Lekié": [("Obala", "S"), ("Monatélé", "S"), ("Sa'a", "R"), ("Evodoula", "R")],
        "Mbam-et-Inoubou": [("Bafia", "S"), ("Ndikiniméki", "R")],
        "Mbam-et-Kim": [("Ntui", "R"), ("Yoko", "R")],
        "Méfou-et-Afamba": [("Mfou", "S"), ("Esse", "R")],
        "Méfou-et-Akono": [("Ngoumou", "R"), ("Akono", "R")],
        "Nyong-et-Kéllé": [("Eséka", "S"), ("Makak", "R")],
        "Nyong-et-Mfoumou": [("Akonolinga", "S"), ("Ayos", "R")],
        "Nyong-et-So'o": [("Mbalmayo", "S"), ("Mengueme", "R")],
        "Haute-Sanaga": [("Nanga-Eboko", "S"), ("Minta", "R")]}),
    "Est": ("EST", 30, 0.02, (4.5, 14.2), {
        "Lom-et-Djérem": [("Bertoua 1er", "U"), ("Bertoua 2e", "S"), ("Bélabo", "R")],
        "Haut-Nyong": [("Abong-Mbang", "S"), ("Lomié", "R")],
        "Kadey": [("Batouri", "S"), ("Kette", "R")],
        "Boumba-et-Ngoko": [("Yokadouma", "S"), ("Moloundou", "R")]}),
    "Extrême-Nord": ("EXN", 62, 0.01, (10.7, 14.3), {
        "Diamaré": [("Maroua 1er", "U"), ("Maroua 2e", "U"), ("Maroua 3e", "U"), ("Meri", "R")],
        "Mayo-Danay": [("Yagoua", "S"), ("Kar-Hay", "R")],
        "Mayo-Kani": [("Kaélé", "S"), ("Guidiguis", "R")],
        "Mayo-Sava": [("Mora", "S"), ("Kolofata", "R")],
        "Mayo-Tsanaga": [("Mokolo", "S"), ("Bourrha", "R")],
        "Logone-et-Chari": [("Kousseri", "S"), ("Makary", "R")]}),
    "Littoral": ("LIT", 58, 0.10, (4.1, 9.8), {
        "Wouri": [("Douala 1er", "U"), ("Douala 2e", "U"), ("Douala 3e", "U"), ("Douala 4e", "U"),
                  ("Douala 5e", "U")],
        "Moungo": [("Nkongsamba", "S"), ("Loum", "S"), ("Mbanga", "S")],
        "Nkam": [("Yabassi", "R")],
        "Sanaga-Maritime": [("Edéa", "S"), ("Dizangué", "R")]}),
    "Nord": ("NOR", 45, 0.01, (9.0, 13.5), {
        "Bénoué": [("Garoua 1er", "U"), ("Garoua 2e", "U"), ("Garoua 3e", "S"), ("Pitoa", "S"), ("Lagdo", "R")],
        "Faro": [("Poli", "R")],
        "Mayo-Louti": [("Guider", "S"), ("Figuil", "S")],
        "Mayo-Rey": [("Tcholliré", "S"), ("Rey-Bouba", "R")]}),
    "Nord-Ouest": ("NOU", 48, 0.96, (6.2, 10.4), {
        "Mezam": [("Bamenda 1er", "U"), ("Bamenda 2e", "U"), ("Bamenda 3e", "U"), ("Bafut", "S")],
        "Boyo": [("Fonfuka", "R"), ("Belo", "R")],
        "Bui": [("Kumbo", "S"), ("Jakiri", "R")],
        "Donga-Mantung": [("Nkambé", "S"), ("Ndu", "R")],
        "Menchum": [("Wum", "S"), ("Fundong", "R")],
        "Momo": [("Mbengwi", "S"), ("Njikwa", "R")],
        "Ngoketunjia": [("Ndop", "S"), ("Babessi", "R")]}),
    "Ouest": ("OUE", 52, 0.10, (5.5, 10.4), {
        "Mifi": [("Bafoussam 1er", "U"), ("Bafoussam 2e", "U"), ("Bafoussam 3e", "U")],
        "Bamboutos": [("Mbouda", "S"), ("Galim", "R")],
        "Menoua": [("Dschang", "S"), ("Penka-Michel", "R")],
        "Haut-Nkam": [("Bafang", "S"), ("Kekem", "R")],
        "Noun": [("Foumban", "S"), ("Foumbot", "S")],
        "Ndé": [("Bangangté", "S"), ("Tonga", "R")],
        "Koung-Khi": [("Bandjoun", "S")],
        "Hauts-Plateaux": [("Baham", "S")]}),
    "Sud": ("SUD", 25, 0.03, (2.9, 11.3), {
        "Mvila": [("Ebolowa 1er", "U"), ("Ebolowa 2e", "S")],
        "Dja-et-Lobo": [("Sangmélima", "S"), ("Djoum", "R")],
        "Océan": [("Kribi 1er", "S"), ("Campo", "R")],
        "Vallée-du-Ntem": [("Ambam", "S"), ("Ma'an", "R")]}),
    "Sud-Ouest": ("SOU", 36, 0.95, (4.8, 9.2), {
        "Fako": [("Limbé 1er", "U"), ("Buéa", "S"), ("Tiko", "S")],
        "Meme": [("Kumba 1er", "U"), ("Mbonge", "R")],
        "Manyu": [("Mamfe", "S"), ("Eyumojock", "R")],
        "Lebialem": [("Menji", "R")],
        "Ndian": [("Mundemba", "R"), ("Idenau", "R")],
        "Koupé-Manengouba": [("Bangem", "R"), ("Tombel", "S")]}),
}

# (part de zones rouges, part de zones jaunes) par département ; défaut : très peu de zones sensibles.
SECURITE_DEFAUT = (0.01, 0.07)
SECURITE = {
    "Mayo-Sava": (0.35, 0.35), "Mayo-Tsanaga": (0.25, 0.35), "Logone-et-Chari": (0.30, 0.35),
    "Mayo-Danay": (0.08, 0.25), "Diamaré": (0.05, 0.20), "Mayo-Kani": (0.04, 0.18),
    "Mezam": (0.22, 0.38), "Boyo": (0.40, 0.35), "Bui": (0.38, 0.35), "Donga-Mantung": (0.35, 0.35),
    "Menchum": (0.38, 0.35), "Momo": (0.35, 0.35), "Ngoketunjia": (0.30, 0.35),
    "Fako": (0.10, 0.30), "Meme": (0.25, 0.35), "Manyu": (0.30, 0.35), "Lebialem": (0.40, 0.35),
    "Ndian": (0.30, 0.35), "Koupé-Manengouba": (0.30, 0.35),
    "Kadey": (0.04, 0.25), "Boumba-et-Ngoko": (0.04, 0.25), "Mbéré": (0.04, 0.22), "Mayo-Banyo": (0.04, 0.20),
}

# Accessibilité selon le type de commune : (urbain, semi-urbain, rural, rural enclavé).
ACCES = {"U": (0.72, 0.22, 0.05, 0.01), "S": (0.15, 0.40, 0.35, 0.10), "R": (0.0, 0.15, 0.50, 0.35)}
LIBELLES_ACCES = ("Urbain", "Semi-urbain", "Rural", "Rural enclavé")
# Effectif attendu médian et dispersion selon l'accessibilité.
EFFECTIF = {"Urbain": (480, 0.45), "Semi-urbain": (320, 0.45), "Rural": (190, 0.50), "Rural enclavé": (95, 0.45)}
# Taux de couverture moyen des besoins (enseignants en poste / enseignants nécessaires).
COUVERTURE = {"Urbain": 1.08, "Semi-urbain": 0.95, "Rural": 0.75, "Rural enclavé": 0.55}
AJUSTEMENT_REGION = {"Centre": 0.10, "Littoral": 0.10, "Ouest": 0.05, "Extrême-Nord": -0.10, "Nord-Ouest": -0.10,
                     "Sud-Ouest": -0.08, "Est": -0.08}

# --- Noms ---------------------------------------------------------------------------------------------------------
NOMS = {
    "beti": ["MBALLA", "ONDOA", "ESSOMBA", "ATANGANA", "MVONDO", "NKOA", "OWONA", "NGONO", "BEKONO", "ABENA",
             "EBOGO", "FOUDA", "ONANA", "MENGUE", "MANGA", "ELA", "ZOA", "TSANGA", "ATEBA", "EKANI", "BIYONG",
             "NNANGA", "MEKA", "EVINA", "AMOUGOU", "ETOUNDI", "NDONGO", "MINKOULOU", "BILOA", "EYENGA"],
    "bamileke": ["TCHINDA", "KAMGA", "FOTSO", "NGUEFACK", "TAGNE", "KOUAM", "TALLA", "DJOUMESSI", "FEUDJIO",
                 "TCHAMDA", "NGOUFACK", "SONKENG", "KENFACK", "WAFO", "TEDONGMO", "NANA", "NOUBISSI", "MBOUOMBOUO",
                 "DJOKO", "TCHOUPE", "NJIKE", "KEMAJOU", "FOKOU", "TAKAM", "YOUMBI", "MOUAFO", "SIMO", "TOUKAM"],
    "nord": ["ABBA", "BELLO", "HAMADOU", "OUMAROU", "MOUSSA", "IBRAHIM", "MAHAMAT", "ADAMOU", "ISSA", "ABDOULAYE",
             "YAYA", "ABOUBAKAR", "HAMAN", "SAIDOU", "MOHAMADOU", "OUSMANOU", "DJIBRILLA", "MANA", "ZRA",
             "TCHAKOUNTE", "DJAORO", "HAMAWA", "MBAIWA", "DAWAI", "NGAIMBE", "BOUBA", "ALIOUM", "GUIDAWA", "HAYATOU"],
    "anglophone": ["NGWA", "FONYUY", "TABI", "ACHU", "NDIKUM", "TANYI", "NJONG", "AYUK", "TAKANG", "MBAH", "NKWAIN",
                   "FON", "NDIFOR", "MUKETE", "EWANE", "ETTA", "EYONG", "ENOW", "ASHU", "MANYI", "BESONG", "TAMBE",
                   "AWAH", "CHE", "NEBA", "NGU", "BIH", "FRU", "MBUA", "NJI", "ABANDA", "FORBA"],
}
PRENOMS = {
    "beti": ["Jean-Pierre", "Marie", "Christine", "Paul", "Françoise", "Célestin", "Bernadette", "Pascal", "Estelle",
             "Thérèse", "Joseph", "Rose", "Émile", "Colette", "Hortense", "Blaise", "Georgette", "Prosper",
             "Solange", "Martin", "Cécile", "Alphonse", "Odette", "Gérard", "Virginie", "Fabrice", "Nadège"],
    "bamileke": ["Pierre", "Michel", "Alain", "Rodrigue", "Sylvie", "Brigitte", "Désiré", "Honoré", "Clarisse", "Flore",
                 "Gaston", "Armand", "Judith", "Léonie", "Raïssa", "Dieudonné", "Carine", "Hervé", "Mireille",
                 "Boris", "Justine", "Cyrille", "Edwige", "Serge", "Ghislaine", "Aristide", "Laure"],
    "nord": ["Aïcha", "Fadimatou", "Hadjara", "Zenabou", "Hawa", "Mariama", "Ali", "Ousmane", "Souleymane", "Bouba",
             "Salamatou", "Abdou", "Hamidou", "Ramatou", "Haoua", "Ibrahim", "Mohamed", "Daouda", "Aminatou",
             "Adamou", "Djamila", "Nafissatou", "Oumarou", "Rabiatou", "Idrissou", "Falmata", "Moustapha"],
    "anglophone": ["Emmanuel", "Grace", "Peter", "Florence", "Samuel", "Beatrice", "Lucas", "Mercy", "Divine",
                   "Constance", "Collins", "Blessing", "Elizabeth", "Ernest", "Roseline", "Prosper", "Julius",
                   "Agnes", "Cyprian", "Patience", "Gladys", "Innocent", "Terence", "Veronica", "Clement",
                   "Joyce", "Ferdinand", "Rita", "Moses"],
}
# Poids des aires culturelles par région : (beti, bamileke, nord, anglophone).
AIRES = {
    "Adamaoua": (0.15, 0.10, 0.65, 0.10), "Centre": (0.72, 0.18, 0.04, 0.06), "Est": (0.60, 0.15, 0.18, 0.07),
    "Extrême-Nord": (0.01, 0.01, 0.97, 0.01), "Littoral": (0.28, 0.50, 0.04, 0.18),
    "Nord": (0.02, 0.01, 0.95, 0.02), "Nord-Ouest": (0.02, 0.10, 0.03, 0.85), "Ouest": (0.05, 0.85, 0.03, 0.07),
    "Sud": (0.85, 0.08, 0.02, 0.05), "Sud-Ouest": (0.04, 0.10, 0.02, 0.84),
}

# --- Noms d'écoles ------------------------------------------------------------------------------------------------
LOCALITES = {
    "francophone_sud": ["Nkolbisson", "Mvog-Betsi", "Ngoulemakong", "Nkol-Afamba", "Mbankomo", "Bikok", "Ebebda",
                        "Nkolo", "Zamakoé", "Akok", "Nkolmetet", "Mengang", "Ntouessong", "Minkama", "Ekoumdoum",
                        "Mvolyé", "Ongot", "Soa", "Ebang", "Nkoabang", "Ndanan", "Nkol-Ndzo", "Zoétélé",
                        "Meyomessala", "Bengbis", "Oveng", "Lolodorf", "Bipindi", "Ntoumou", "Mendong", "Biyem-Assi",
                        "Etoudi", "Melen", "Ekounou", "Nsimeyong", "Oyom-Abang", "Tsinga", "Essos", "Mimboman",
                        "Emana", "Odza", "Messassi", "Mvan", "Obili", "Ngoa-Ekélé", "Nkomo", "Mvog-Ada", "Efoulan"],
    "francophone_nord": ["Dziguilao", "Zamay", "Gazawa", "Ouro-Tchédé", "Mayo-Oulo", "Tchatibali", "Doualaré",
                         "Founangué", "Maga", "Blangoua", "Hile-Alifa", "Mogodé", "Koza", "Mozogo", "Tokombéré",
                         "Gawar", "Kolara", "Pette", "Mindif", "Moulvoudaye", "Djarengol", "Garey", "Bidzar",
                         "Ouro-Labo", "Sorawel", "Gashiga", "Mayo-Darlé", "Bibémi", "Touboro", "Djohong",
                         "Ngaoundal-Gare", "Baschéo", "Lagdo-Rive", "Bogo", "Pouss", "Datcheka"],
    "francophone_ouest": ["Bandjoun", "Bamendjou", "Batcham", "Bangang", "Baleng", "Banengo", "Djeleng", "Tamdja",
                          "Ndiangdam", "Bangoua", "Bazou", "Balengou", "Foréké", "Fongo-Tongo", "Manjo", "Penja",
                          "Njombé", "Ndogpassi", "Bassa", "Ngodi", "Bonamoussadi", "Yassa", "Kotto", "Logbaba",
                          "Cité-des-Palmiers", "Bépanda", "Makepe", "Akwa", "Deido", "New-Bell", "Bonabéri", "Nyalla",
                          "Ndogbong", "Logpom", "Japoma", "Mbanga-Pongo"],
    "anglophone": ["Mankon", "Nkwen", "Bambili", "Bambui", "Mile 4", "Up Station", "Ntarikon", "Mulang", "Azire",
                   "Mendankwe", "Menteh", "Ndzah", "Njinikom", "Bamessing", "Santa", "Tubah", "Molyko", "Bonduma",
                   "Bokwai", "Bonakanda", "Mutengene", "Bota", "Down Beach", "Mile 17", "Fiango", "Ekondo",
                   "Muyuka", "Idenau", "Ekok", "Mamfe Town", "Bali", "Bafut Town", "Babanki", "Oku", "Nso",
                   "Sabga", "Bamali", "Widikum", "Batibo", "Kombone", "Likomba", "Small Soppo", "Great Soppo"],
}


# Noms de localités fabriqués (préfixes, racines) : sans eux, 13 000 écoles épuiseraient la liste ci-dessus.
RACINES = {
    "francophone_sud": (["Nkol", "Mvog", "Ebo", "Ntou", "Ndzo", "Akon", "Ngo", "Zam", "Mbo", "Mekok"],
                        ["afamba", "betsi", "ada", "mekok", "zok", "ntoum", "owono", "ngon", "bidjom", "assi", "mbarga",
                         "eyene", "fouda", "mfou", "menyin", "elig", "ebanda", "mbida"], "-"),
    "francophone_nord": (["Ouro", "Mayo", "Dar", "Tchaka", "Gada", "Kalfou", "Zina", "Ngou", "Bala"],
                         ["Boulou", "Hamadou", "Sali", "Goudé", "Kélé", "Saïdou", "Mana", "Doubo", "Bello", "Dari",
                          "Yangué", "Tchéré", "Mbaï", "Djaligo"], "-"),
    "francophone_ouest": (["Ba", "Ban", "Bam", "Bat", "Foum", "Nda", "Pen", "Mba"],
                          ["tcha", "gou", "zou", "lang", "kwé", "bou", "dzing", "nté", "fang", "ssa", "mbo", "tié"], ""),
    "anglophone": (["Ndu", "Mbo", "Bam", "Nko", "Fi", "Bu", "Tu", "Ba", "Ngu", "Mu"],
                   ["mbeng", "ngwe", "tubuh", "kon", "wara", "nyang", "bese", "ndop", "kwa", "mengo", "tang"], ""),
}


def localite(rnd: random.Random, pool: str) -> str:
    if rnd.random() < 0.45:
        return rnd.choice(LOCALITES[pool])
    prefixes, racines, lien = RACINES[pool]
    racine = rnd.choice(racines)
    return f"{rnd.choice(prefixes)}{lien}{racine.capitalize() if lien else racine.lower()}"


def tirer(rnd: random.Random, poids: tuple, valeurs: tuple):
    return rnd.choices(valeurs, weights=poids, k=1)[0]


def poisson(rnd: random.Random, lam: float) -> int:
    seuil, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rnd.random()
        if p <= seuil:
            return k
        k += 1


def pe(n: float) -> int:
    return 1 if n <= 20 else max(1, math.ceil((n - 20) / 60.0))


def repartir_ecoles(rnd: random.Random, nb_ecoles: int) -> list:
    """Liste de (région, département, commune, type) : une entrée par école."""
    total = sum(r[1] for r in REGIONS.values())
    out = []
    for region, (_, part, _, _, deps) in REGIONS.items():
        n = round(nb_ecoles * part / total)
        communes = [(d, c, t) for d, cs in deps.items() for c, t in cs]
        poids = [{"U": 3.0, "S": 2.0, "R": 1.5}[t] for _, _, t in communes]
        for d, c, t in rnd.choices(communes, weights=poids, k=n):
            out.append((region, d, c, t))
    return out


def construire(nb_ecoles: int = NB_ECOLES):
    rnd = random.Random(GRAINE)
    centre_commune: dict = {}
    noms_pris: set = set()
    groupes: dict = {}
    ecoles: list = []
    for k, (region, dept, commune, type_c) in enumerate(sorted(repartir_ecoles(rnd, nb_ecoles)), 1):
        code, _, p_ang, (lat0, lon0), _ = REGIONS[region]
        anglophone = rnd.random() < p_ang
        acces = LIBELLES_ACCES[tirer(rnd, ACCES[type_c], (0, 1, 2, 3))]
        p_rouge, p_jaune = SECURITE.get(dept, SECURITE_DEFAUT)
        x = rnd.random()
        securite = "Zone rouge" if x < p_rouge else "Zone jaune" if x < p_rouge + p_jaune else "Zone verte"
        multigrade = rnd.random() < {"Urbain": 0.03, "Semi-urbain": 0.12, "Rural": 0.40, "Rural enclavé": 0.70}[acces]
        mediane, sigma = EFFECTIF[acces]
        effectif = int(min(1100, max(40, rnd.lognormvariate(math.log(mediane), sigma))) // 5 * 5)
        besoin = max(pe(effectif), 3 if multigrade else 6)
        simple = max(1 if multigrade else 3, round(besoin * rnd.uniform(0.6, 1.05)))
        double = rnd.randint(1, 3) if acces == "Urbain" and effectif > 500 and rnd.random() < 0.3 else 0
        couverture = COUVERTURE[acces] + AJUSTEMENT_REGION.get(region, 0) - (0.08 if securite == "Zone rouge" else 0)
        en_poste = int(max(0, min(besoin + 4, round(besoin * rnd.gauss(couverture, 0.22)))))
        if acces == "Rural enclavé" and rnd.random() < 0.02:
            en_poste = 0
        pool = "anglophone" if anglophone else {
            "Centre": "francophone_sud", "Sud": "francophone_sud", "Est": "francophone_sud",
            "Adamaoua": "francophone_nord", "Nord": "francophone_nord", "Extrême-Nord": "francophone_nord",
            "Ouest": "francophone_ouest", "Littoral": "francophone_ouest", "Nord-Ouest": "francophone_ouest",
            "Sud-Ouest": "francophone_ouest"}[region]
        nom = rnd.choices(["GPS {l}", "GBPS {l}", "Government School {l}"], weights=[55, 25, 20])[0] if anglophone             else rnd.choices(["EP de {l}", "EP Groupe {n} de {c}", "EPB de {l}"], weights=[50, 25, 10])[0]
        if "{n}" in nom:
            groupes[commune] = groupes.get(commune, 0) + 1     # « Groupe 1 », « Groupe 2 »… dans l'ordre
        nom = nom.format(l=localite(rnd, pool), n=groupes.get(commune, 1), c=commune)
        # Un nom est unique dans sa commune (deux « EP de Mendong » existent, dans des communes différentes).
        base, rang = nom, 0
        while (commune, nom) in noms_pris:
            nom = f"{base} {ROMAINS[rang]}" if rang < len(ROMAINS) else f"{base} {rang + 2}"
            rang += 1
        noms_pris.add((commune, nom))
        lat_c, lon_c = centre_commune.setdefault(commune, (lat0 + rnd.gauss(0, 0.30), lon0 + rnd.gauss(0, 0.30)))
        ecoles.append({
            "Identifiant_Ecole": f"ECO-{code}-{k:05d}", "nom_etab": nom,
            "Sous_Systeme": "Anglophone" if anglophone else "Francophone", "Region": region, "Departement": dept,
            "Commune": commune, "Circonscription_IAEB": f"IAEB de {commune}", "Accessibilite_Zone": acces,
            "Securite_Zone": securite, "Effectif_Eleves_Attendus": effectif, "Salles_Simple_Flux": simple,
            "Salles_Double_Flux": double, "Classes_Multigrades": "Oui" if multigrade else "Non",
            "latitude": round(lat_c + rnd.gauss(0, 0.04), 5), "longitude": round(lon_c + rnd.gauss(0, 0.04), 5),
            "Enseignants_Actuels": en_poste, "_aire": region, "_besoin": besoin})
    return ecoles, enseignants_de(rnd, ecoles)


def enseignants_de(rnd: random.Random, ecoles: list) -> list:
    par_region_ss: dict = {}
    for e in ecoles:
        par_region_ss.setdefault((e["Region"], e["Sous_Systeme"]), []).append(e)
    par_ss: dict = {}
    for e in ecoles:
        par_ss.setdefault(e["Sous_Systeme"], []).append(e)
    par_dept: dict = {}
    for e in ecoles:
        par_dept.setdefault((e["Departement"], e["Sous_Systeme"]), []).append(e)
    lettres = "ABCDEFGHJKLMNPRSTUVWXYZ"
    matricules: set = set()
    enseignants: list = []
    for e in ecoles:
        niveau = 1 if (e["Accessibilite_Zone"] == "Rural enclavé" or e["Securite_Zone"] == "Zone rouge") else \
            2 if (e["Accessibilite_Zone"] == "Rural" or e["Securite_Zone"] == "Zone jaune") else 0
        for _ in range(e["Enseignants_Actuels"]):
            while True:
                m = f"{rnd.randint(100000, 899999)}{rnd.choice(lettres)}"
                if m not in matricules:
                    matricules.add(m)
                    break
            age = int(min(62, max(23, round(rnd.gauss(41 - (3 if niveau == 1 else 0), 9)))))
            if rnd.random() < 0.012:
                age = rnd.randint(60, 62)
            debut = rnd.randint(21, 30)
            anc_car = max(0, age - debut)
            anc_poste = min(anc_car, int(rnd.expovariate(1 / 6.0)))
            reste = anc_car - anc_poste
            n1 = (anc_poste if niveau == 1 else 0) + (int(rnd.random() * min(reste, 5) * 0.5) if reste else 0)
            n2 = (anc_poste if niveau == 2 else 0) + (int(rnd.random() * min(reste, 5) * 0.5) if reste else 0)
            n1, n2 = min(n1, anc_car), min(n2, max(0, anc_car - min(n1, anc_car)))
            p_marie = 0.25 if age < 28 else 0.60 if age < 36 else 0.72
            x = rnd.random()
            if x < p_marie:
                situation = "Marié(e)"
            elif x < p_marie + 0.07 and age >= 28:
                situation = "Divorcé(e)"
            elif x < p_marie + 0.11 and age >= 40:
                situation = "Veuf(ve)"
            else:
                situation = "Célibataire"
            enfants = min(9, poisson(rnd, 0.3 if situation == "Célibataire" else max(0.6, (age - 24) * 0.17)))
            formations = max(0, min(4, round(anc_car / 8 + rnd.gauss(0, 1))))
            aires = tuple(AIRES[e["Region"]])
            aire = "anglophone" if e["Sous_Systeme"] == "Anglophone" and rnd.random() < 0.8 else \
                tirer(rnd, aires, ("beti", "bamileke", "nord", "anglophone"))
            formation_ss = e["Sous_Systeme"]
            if rnd.random() < 0.015:
                formation_ss = "Francophone" if formation_ss == "Anglophone" else "Anglophone"
            voeux = ["", "", ""]
            motif = ""
            if rnd.random() < 0.42:
                cibles = []
                reserve = par_ss[formation_ss]
                nb_voeux = 1 + (rnd.random() < 0.55) + (rnd.random() < 0.30)
                while len(cibles) < nb_voeux:
                    x = rnd.random()
                    liste = (par_dept.get((e["Departement"], formation_ss)) if x < 0.5 else
                             par_region_ss.get((e["Region"], formation_ss)) if x < 0.85 else reserve) or reserve
                    c = rnd.choice(liste)
                    if c["Identifiant_Ecole"] in [e["Identifiant_Ecole"], *cibles]:
                        continue
                    if c["Accessibilite_Zone"] in ("Rural", "Rural enclavé") and rnd.random() < 0.65:
                        continue
                    cibles.append(c["Identifiant_Ecole"])
                voeux = cibles + [""] * (3 - len(cibles))
                if rnd.random() < 0.07:
                    motif = rnd.choice(["Rapprochement de conjoint", "Raison de santé (certificat médical)",
                                        "Conjoint fonctionnaire dans la localité", "Parent âgé à charge"])
                    # Les deux premiers motifs citent l'école visée (son premier vœu), comme l'exige la bonification
                    # ciblée ; les deux autres restent des motifs libres, sans bonification (avertissement à l'import).
                    # Sans tirage supplémentaire : le reste du jeu est inchangé.
                    if voeux[0] and motif in ("Rapprochement de conjoint", "Raison de santé (certificat médical)"):
                        motif = f"{motif} — {voeux[0]}"
            enseignants.append({
                "Matricule_Enseignant": m, "nom": rnd.choice(NOMS[aire]), "prenom": rnd.choice(PRENOMS[aire]),
                "Statut": "Actif", "Paye_Par_Etat": "Oui", "Sous_Systeme_Formation": formation_ss,
                "Ecole_Attache_Actuelle": e["Identifiant_Ecole"], "Age": age, "Anciennete_Carriere": anc_car,
                "Anciennete_Poste_Actuel": anc_poste, "Annees_Zone_Difficulte_1": n1,
                "Annees_Zone_Difficulte_2": n2, "Situation_Matrimoniale": situation,
                "Nombre_Enfants_A_Charge": enfants, "Formations_Continues": formations, "Voeu_1": voeux[0],
                "Voeu_2": voeux[1], "Voeu_3": voeux[2], "Motif_Bonification": motif})
    rnd.shuffle(enseignants)
    return enseignants


ORDRE_ETAB = ["Identifiant_Ecole", "nom_etab", "Sous_Systeme", "Region", "Departement", "Commune",
              "Circonscription_IAEB", "Accessibilite_Zone", "Securite_Zone", "Effectif_Eleves_Attendus",
              "Salles_Simple_Flux", "Salles_Double_Flux", "Classes_Multigrades", "latitude", "longitude",
              "Enseignants_Actuels"]


def principal(sortie: Path, nb_ecoles: int, nom: str) -> None:
    ecoles, enseignants = construire(nb_ecoles)
    sortie.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(ecoles)[ORDRE_ETAB].to_excel(sortie / f"etablissements_{nom}.xlsx", index=False)
    pd.DataFrame(enseignants).to_excel(sortie / f"enseignants_{nom}.xlsx", index=False)
    print(f"{len(ecoles)} écoles, {len(enseignants)} enseignants écrits dans {sortie}")


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    a.add_argument("dossier", nargs="?", type=Path, default=RACINE / "dist")
    a.add_argument("--ecoles", type=int, default=NB_ECOLES)
    a.add_argument("--nom", default="realiste")
    args = a.parse_args()
    principal(args.dossier, args.ecoles, args.nom)
