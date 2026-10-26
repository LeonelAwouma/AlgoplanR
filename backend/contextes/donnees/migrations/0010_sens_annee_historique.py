"""Sens de l'année des jeux existants : établi d'après l'historique, jamais deviné.

Avant la migration 0006, un jeu n'avait pas d'année : celle qu'elle lui a donnée est l'année en cours au moment de la
migration, sans lien avec ses données. Son sens ne peut pas être établi : « non_confirme ».

Après la migration 0006, l'écran d'import demandait « la rentrée que prépare ce jeu » et l'application lisait l'année
ainsi (base = année précédente). Un jeu créé après l'application de 0006 sur ce poste porte donc cette convention :
« rentree_preparee ». L'année enregistrée n'est jamais modifiée ; la migration inverse ne retire rien (les champs
sont retirés par la migration 0009 inverse).
"""
from django.db import migrations, models


def classer(apps, schema_editor):
    from django.db.migrations.recorder import MigrationRecorder
    jeux = apps.get_model("donnees", "JeuDeDonnees")
    appliquee = (MigrationRecorder(schema_editor.connection).migration_qs
                 .filter(app="donnees", name="0006_annee_scolaire_du_jeu").values_list("applied", flat=True).first())
    for jeu in jeux.objects.filter(sens_annee_scolaire="non_confirme"):
        # Créé après l'ajout du champ sur ce poste : l'année a été saisie (ou laissée par défaut) sous la convention
        # « rentrée préparée ». Sinon, l'année est celle de la migration : sens impossible à établir.
        if appliquee is not None and jeu.cree_le >= appliquee:
            jeu.sens_annee_scolaire = "rentree_preparee"
        jeu.sens_annee_origine = "migration"
        jeu.save(update_fields=["sens_annee_scolaire", "sens_annee_origine"])


class Migration(migrations.Migration):

    dependencies = [
        ("donnees", "0009_sens_annee_et_donnees_fictives"),
    ]

    operations = [
        migrations.AddField(
            model_name="jeudedonnees",
            name="sens_annee_origine",
            field=models.CharField(db_default="creation", default="creation", max_length=20),
        ),
        migrations.RunPython(classer, migrations.RunPython.noop),
    ]
