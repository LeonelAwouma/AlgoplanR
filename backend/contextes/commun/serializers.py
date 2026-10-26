from rest_framework import serializers


class EnvoiFichierSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["etablissements", "enseignants", "prince"])
    fichier = serializers.FileField(help_text="Classeur .xlsx / .xls ou .csv")
    feuille = serializers.CharField(required=False, allow_blank=True)
    base_nationale = serializers.BooleanField(required=False, default=False,
                                              help_text="Fichier de la base nationale (toutes régions)")


class ImportFichierSerializer(serializers.Serializer):
    fichier = serializers.FileField(help_text="Fichier .xlsx / .xls / .csv (ou .json pour les paramètres)")
    feuille = serializers.CharField(required=False, allow_blank=True)


class CreationJeuSerializer(serializers.Serializer):
    nom = serializers.CharField(required=False, allow_blank=True)
    fichier_etablissements = serializers.UUIDField()
    fichier_enseignants = serializers.UUIDField()
    annee_scolaire = serializers.CharField(
        required=False, allow_blank=True, help_text="Année scolaire des données importées, « AAAA-AAAA » (année en cours si omise)")
    sens_annee_scolaire = serializers.ChoiceField(
        choices=["donnees", "rentree_preparee", "non_confirme"], required=False,
        help_text="Sens de l'année saisie : année des données (par défaut) ou rentrée préparée (données de l'année "
                  "précédente)")
    donnees_fictives = serializers.BooleanField(
        required=False, default=False, help_text="Jeu de test fictif : un bandeau l'indique dans les vues et les exports")
    fichier_prince = serializers.UUIDField(
        required=False, help_text="Faits du Prince (DRH) : appliqués avant l'algorithme, au premier calcul")