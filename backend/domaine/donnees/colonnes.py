"""Noms de colonnes officiels (entrée / sortie) du moteur d'origine."""

COL_ETAB_ID = "Identifiant_Ecole"
COL_ETAB_SS = "Sous_Systeme"
COL_ETAB_REGION = "Region"
COL_ETAB_DEPT = "Departement"
COL_ETAB_COMMUNE = "Commune"
COL_ETAB_IAEB = "Circonscription_IAEB"
COL_ETAB_NE = "Effectif_Eleves_Attendus"
COL_ETAB_EE = "Enseignants_Actuels"
COL_ETAB_SSF = "Salles_Simple_Flux"
COL_ETAB_SDF = "Salles_Double_Flux"
COL_ETAB_ALPHA = "Accessibilite_Zone"
COL_ETAB_SIGMA = "Securite_Zone"
COL_ETAB_MULTIGRADE = "Classes_Multigrades"
COL_ETAB_CLASSES_OUVERTES = "Classes_Ouvertes"      # optionnelle : nombre de classes réellement ouvertes

COL_ENS_ID = "Matricule_Enseignant"
COL_ENS_SS = "Sous_Systeme_Formation"
COL_ENS_ETAB = "Ecole_Attache_Actuelle"
COL_ENS_AGE = "Age"
COL_ENS_ANC_CAR = "Anciennete_Carriere"
COL_ENS_ANC_POSTE = "Anciennete_Poste_Actuel"
COL_ENS_N1 = "Annees_Zone_Difficulte_1"
COL_ENS_N2 = "Annees_Zone_Difficulte_2"
COL_ENS_SITU = "Situation_Matrimoniale"
COL_ENS_ENFANTS = "Nombre_Enfants_A_Charge"
COL_ENS_FORM = "Formations_Continues"
COL_ENS_V1 = "Voeu_1"
COL_ENS_V2 = "Voeu_2"
COL_ENS_V3 = "Voeu_3"
COL_ENS_MOTIF = "Motif_Bonification"

COLONNES_ATTENDUES_ETAB = [
    "Identifiant_Ecole", "Sous_Systeme", "Region", "Departement", "Commune",
    "Circonscription_IAEB", "Effectif_Eleves_Attendus", "Enseignants_Actuels",
    "Salles_Simple_Flux", "Salles_Double_Flux", "Accessibilite_Zone",
    "Securite_Zone", "Classes_Multigrades",
]

COLONNES_ATTENDUES_ENS = [
    "Matricule_Enseignant", "Sous_Systeme_Formation", "Ecole_Attache_Actuelle",
    "Age", "Anciennete_Carriere", "Anciennete_Poste_Actuel",
    "Annees_Zone_Difficulte_1", "Annees_Zone_Difficulte_2",
    "Situation_Matrimoniale", "Nombre_Enfants_A_Charge",
    "Formations_Continues", "Voeu_1", "Voeu_2", "Voeu_3", "Motif_Bonification",
]

# Colonnes optionnelles reconnues (le moteur d'origine les lit si présentes).
COLONNES_OPTIONNELLES_ETAB = ["nom_etab", "type_etab", "latitude", "longitude", COL_ETAB_CLASSES_OUVERTES]
COLONNES_OPTIONNELLES_ENS = ["nom", "prenom"]

# Fichier des faits du Prince : décisions d'affectation prioritaires sur l'algorithme.
COL_PRINCE_MOTIF = "Motif"
COLONNES_ATTENDUES_PRINCE = ["Matricule_Enseignant", "Identifiant_Ecole", COL_PRINCE_MOTIF]
COLONNES_OPTIONNELLES_PRINCE = [COL_PRINCE_MOTIF]

# Colonnes sans lesquelles le moteur d'origine lève une erreur.
COLONNES_BLOQUANTES_ETAB = [COL_ETAB_ID]
COLONNES_BLOQUANTES_ENS = [COL_ENS_ID]
COLONNES_BLOQUANTES_PRINCE = [COL_ENS_ID, COL_ETAB_ID]
