"""Référentiel régional du rapport DRH d'octobre 2026 (repris de codeSource, application/planning_5years.py).

Seuls les éléments qui ne dépendent pas des effectifs du rapport sont repris : priorité, taux d'attrition
régional (total, retraites comprises), situation, orientation et constats. Les effectifs et les quotas du
rapport ne sont pas utilisés : la planification se calcule sur les données du jeu importé.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..commun.texte import norm

REGIONS_DRH: List[Dict[str, Any]] = [{'region': 'Adamaoua',
  'priorite': 1,
  'attr_reg_pri_pct': 4.4,
  'situation': "Déficit structurel d'encadrement",
  'orientation': 'Recruter en priorité (S-besoin) et recevoir des enseignants redéployés',
  'problemes': ["1. Déficit structurel d'encadrement : REM du primaire de 90,2 (référence 74,4). Atteindre la "
                'norme demande 1 381 recrutements en trois ans (S-besoin), contre 710 sous plafond ; à défaut, le '
                'REM serait de 102,6 en 2029-30 avec les seules retraites remplacées.',
                '2. Retraites : 52 en 2027, 42 en 2028, 56 en 2029, soit 5,0 % du stock ; quota incompressible de '
                '150 sur trois ans.',
                '3. Autres départs élevés : attrition estimée à 4,4 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) sont à examiner avec la DRH.',
                '4. Écoles sous-dotées : 19,5 % des écoles de plus de 100 élèves ont moins de 3 chargés de '
                'classe, maîtres des parents compris (moyenne 9,0 %).',
                '5. Directeurs sans classe nombreux : 16,0 % des directeurs du primaire ne tiennent pas de classe '
                '(moyenne 15,4 %).',
                "6. Données à fiabiliser : 13,3 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Centre',
  'priorite': 2,
  'attr_reg_pri_pct': 3.0,
  'situation': 'Encadrement au-dessus de la norme ; vague de retraites',
  'orientation': 'Remplacer au moins les retraites (S-min) ; région pourvoyeuse pour le redéploiement',
  'problemes': ['1. Encadrement au-dessus de la norme : REM du primaire de 48,1. La région peut fournir des '
                "enseignants au redéploiement plutôt que d'en recevoir.",
                '2. Retraites : 509 en 2027, 221 en 2028, 274 en 2029, soit 10,0 % du stock ; quota '
                "incompressible de 1 004 sur trois ans — l'une des vagues les plus fortes du pays.",
                '3. Écoles sous-dotées : 10,1 % des écoles de plus de 100 élèves ont moins de 3 chargés de '
                'classe, maîtres des parents compris (moyenne 9,0 %).',
                '4. Directeurs sans classe nombreux : 25,4 % des directeurs du primaire ne tiennent pas de classe '
                '(moyenne 15,4 %).',
                "5. Données à fiabiliser : 17,3 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Est',
  'priorite': 1,
  'attr_reg_pri_pct': 3.6,
  'situation': "Déficit structurel d'encadrement",
  'orientation': 'Recruter en priorité (S-besoin) et recevoir des enseignants redéployés',
  'problemes': ["1. Déficit structurel d'encadrement : REM du primaire de 86,3 (référence 74,4). Atteindre la "
                'norme demande 1 390 recrutements en trois ans (S-besoin), contre 756 sous plafond ; à défaut, le '
                'REM serait de 93,6 en 2029-30 avec les seules retraites remplacées.',
                '2. Retraites : 69 en 2027, 47 en 2028, 54 en 2029, soit 4,8 % du stock ; quota incompressible de '
                '170 sur trois ans.',
                '3. Autres départs élevés : attrition estimée à 3,6 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) sont à examiner avec la DRH.',
                '4. Écoles sous-dotées : 11,5 % des écoles de plus de 100 élèves ont moins de 3 chargés de '
                'classe, maîtres des parents compris (moyenne 9,0 %).',
                '5. Directeurs sans classe nombreux : 17,9 % des directeurs du primaire ne tiennent pas de classe '
                '(moyenne 15,4 %).',
                "6. Données à fiabiliser : 14,1 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Extrême-Nord',
  'priorite': 1,
  'attr_reg_pri_pct': 4.4,
  'situation': "Déficit structurel d'encadrement",
  'orientation': 'Recruter en priorité (S-besoin) et recevoir des enseignants redéployés',
  'problemes': ["1. Déficit structurel d'encadrement : REM du primaire de 127,5 (référence 74,4). Atteindre la "
                'norme demande 6 086 recrutements en trois ans (S-besoin), contre 2 790 sous plafond ; à défaut, '
                'le REM serait de 146,0 en 2029-30 avec les seules retraites remplacées.',
                '2. Retraites : 156 en 2027, 72 en 2028, 104 en 2029, soit 4,7 % du stock ; quota incompressible '
                'de 332 sur trois ans.',
                '3. Autres départs élevés : attrition estimée à 4,4 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) ne sont pas identifiables dans les données et sont '
                'à examiner avec la DRH.']},
 {'region': 'Littoral',
  'priorite': 2,
  'attr_reg_pri_pct': 3.0,
  'situation': 'Encadrement au-dessus de la norme ; vague de retraites',
  'orientation': 'Remplacer au moins les retraites (S-min) ; région pourvoyeuse pour le redéploiement',
  'problemes': ['1. Encadrement au-dessus de la norme : REM du primaire de 45,6. La région peut fournir des '
                "enseignants au redéploiement plutôt que d'en recevoir.",
                '2. Retraites : 305 en 2027, 111 en 2028, 140 en 2029, soit 12,1 % du stock ; quota '
                "incompressible de 556 sur trois ans — l'une des vagues les plus fortes du pays.",
                '3. Directeurs sans classe nombreux : 45,8 % des directeurs du primaire ne tiennent pas de classe '
                '(moyenne 15,4 %).',
                "4. Données à fiabiliser : 14,5 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Nord',
  'priorite': 1,
  'attr_reg_pri_pct': 4.4,
  'situation': "Déficit structurel d'encadrement",
  'orientation': 'Recruter en priorité (S-besoin) et recevoir des enseignants redéployés',
  'problemes': ["1. Déficit structurel d'encadrement : REM du primaire de 127,2 (référence 74,4). Atteindre la "
                'norme demande 4 190 recrutements en trois ans (S-besoin), contre 1 886 sous plafond ; à défaut, '
                'le REM serait de 141,8 en 2029-30 avec les seules retraites remplacées.',
                '2. Retraites : 99 en 2027, 53 en 2028, 58 en 2029, soit 4,6 % du stock ; quota incompressible de '
                '210 sur trois ans.',
                '3. Autres départs élevés : attrition estimée à 4,4 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) sont à examiner avec la DRH.',
                "4. Données à fiabiliser : 14,8 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Nord-Ouest',
  'priorite': 2,
  'attr_reg_pri_pct': 1.7,
  'situation': 'Encadrement au-dessus de la norme ; vague de retraites',
  'orientation': 'Remplacer au moins les retraites (S-min) ; région pourvoyeuse pour le redéploiement',
  'problemes': ['1. Encadrement au-dessus de la norme : REM du primaire de 39,9. La région peut fournir des '
                "enseignants au redéploiement plutôt que d'en recevoir.",
                '2. Retraites : 377 en 2027, 139 en 2028, 160 en 2029, soit 13,3 % du stock ; quota '
                "incompressible de 676 sur trois ans — l'une des vagues les plus fortes du pays.",
                '3. Écoles sous-dotées : 19,3 % des écoles de plus de 100 élèves ont moins de 3 chargés de '
                'classe, maîtres des parents compris (moyenne 9,0 %).',
                "4. Répartition inégale entre écoles : aléa de 0,93 (moyenne 0,67) ; le nombre d'enseignants suit "
                "mal le nombre d'élèves."]},
 {'region': 'Ouest',
  'priorite': 2,
  'attr_reg_pri_pct': 3.9,
  'situation': 'Encadrement proche de la norme',
  'orientation': 'Remplacer tous les départs (S-maintien)',
  'problemes': ['1. Encadrement proche de la norme : REM du primaire de 76,0 ; tout départ non remplacé le '
                'dégrade.',
                '2. Retraites : 488 en 2027, 188 en 2028, 205 en 2029, soit 13,9 % du stock ; quota '
                "incompressible de 881 sur trois ans — l'une des vagues les plus fortes du pays.",
                '3. Autres départs élevés : attrition estimée à 3,9 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) sont à examiner avec la DRH.',
                "4. Données à fiabiliser : 10,7 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Sud',
  'priorite': 2,
  'attr_reg_pri_pct': 3.4,
  'situation': 'Encadrement au-dessus de la norme ; vague de retraites',
  'orientation': 'Remplacer au moins les retraites (S-min) ; région pourvoyeuse pour le redéploiement',
  'problemes': ['1. Encadrement au-dessus de la norme : REM du primaire de 47,3. La région peut fournir des '
                "enseignants au redéploiement plutôt que d'en recevoir.",
                '2. Retraites : 180 en 2027, 80 en 2028, 93 en 2029, soit 10,3 % du stock ; quota incompressible '
                "de 353 sur trois ans — l'une des vagues les plus fortes du pays.",
                '3. Autres départs élevés : attrition estimée à 3,4 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) sont à examiner avec la DRH.',
                "4. Données à fiabiliser : 15,8 % des agents de la cartographie n'ont pas été rattachés à une "
                'école du SIGE.']},
 {'region': 'Sud-Ouest',
  'priorite': 2,
  'attr_reg_pri_pct': 3.4,
  'situation': 'Encadrement au-dessus de la norme ; vague de retraites',
  'orientation': 'Remplacer au moins les retraites (S-min) ; région pourvoyeuse pour le redéploiement',
  'problemes': ['1. Encadrement au-dessus de la norme : REM du primaire de 37,6. La région peut fournir des '
                "enseignants au redéploiement plutôt que d'en recevoir.",
                '2. Retraites : 402 en 2027, 109 en 2028, 125 en 2029, soit 14,4 % du stock ; quota '
                "incompressible de 636 sur trois ans — l'une des vagues les plus fortes du pays.",
                '3. Autres départs élevés : attrition estimée à 3,4 % par an au primaire (moyenne 3,3 %) ; les '
                'motifs (mutations, abandons de poste, décès) sont à examiner avec la DRH.',
                '4. Écoles sous-dotées : 16,3 % des écoles de plus de 100 élèves ont moins de 3 chargés de '
                'classe, maîtres des parents compris (moyenne 9,0 %).',
                "5. Répartition inégale entre écoles : aléa de 0,77 (moyenne 0,67) ; le nombre d'enseignants suit "
                "mal le nombre d'élèves."]}]


def _cle(region: Any) -> str:
    s = norm(region)
    for a, b in (("é", "e"), ("è", "e"), ("ê", "e"), ("_", "-"), (" ", "-")):
        s = s.replace(a, b)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


_PAR_CLE = {_cle(r["region"]): r for r in REGIONS_DRH}


def region_drh(region: Any) -> Optional[Dict[str, Any]]:
    """Fiche du référentiel pour une région, quelle que soit sa graphie (casse, accents, tirets)."""
    return _PAR_CLE.get(_cle(region))
