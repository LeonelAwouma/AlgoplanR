"""Sens de l'année scolaire et marquage des données fictives.

Les jeux existants reçoivent « non_confirme » : leur année avait été saisie comme « rentrée que prépare le jeu » et
n'est pas réinterprétée en silence. Les nouveaux jeux reçoivent « donnees », y compris ceux qu'écrirait une version
antérieure de l'application (valeur par défaut portée par la base). Aucune année n'est modifiée ; la migration inverse
retire simplement les deux champs.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('donnees', '0008_suivi_double_flux'),
    ]

    operations = [
        migrations.AddField(
            model_name='jeudedonnees',
            name='sens_annee_scolaire',
            field=models.CharField(default='non_confirme', max_length=20),
        ),
        migrations.AlterField(
            model_name='jeudedonnees',
            name='sens_annee_scolaire',
            field=models.CharField(db_default='donnees', default='donnees', max_length=20),
        ),
        migrations.AddField(
            model_name='jeudedonnees',
            name='donnees_fictives',
            field=models.BooleanField(db_default=False, default=False),
        ),
    ]
