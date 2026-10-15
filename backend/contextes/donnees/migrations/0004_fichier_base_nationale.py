from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('donnees', '0003_validation_scenario_retenu_actualisation'),
    ]

    operations = [
        migrations.AddField(
            model_name='fichierimporte',
            name='base_nationale',
            field=models.BooleanField(default=False),
        ),
    ]
