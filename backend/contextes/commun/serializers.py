from rest_framework import serializers


class EnvoiFichierSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["etablissements", "enseignants"])
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