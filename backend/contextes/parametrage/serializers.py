from rest_framework import serializers


class ParametresSerializer(serializers.Serializer):
    """Corps libre : surcharges partielles de DEFAULT_SETTINGS (voir GET /parametres/defaut/)."""
    parametres = serializers.JSONField(required=False)
