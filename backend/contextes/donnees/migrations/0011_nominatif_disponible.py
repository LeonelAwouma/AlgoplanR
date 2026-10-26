"""Mode d'import d'un jeu : avec fichier nominatif des enseignants (mode complet) ou établissements seuls.

Tous les jeux existants ont été créés avec un fichier d'enseignants (l'import l'exigeait) : ils restent « avec
nominatif ». Aucun jeu n'est reclassé d'après son nombre d'enseignants.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("donnees", "0010_sens_annee_historique"),
    ]

    operations = [
        migrations.AddField(
            model_name="jeudedonnees",
            name="nominatif_disponible",
            field=models.BooleanField(db_default=True, default=True),
        ),
        migrations.AddField(
            model_name="actualisation",
            name="mode_nominatif",
            field=models.CharField(blank=True, db_default="", default="", max_length=20),
        ),
    ]
