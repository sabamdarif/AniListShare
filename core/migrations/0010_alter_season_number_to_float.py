# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_sharelink"),
    ]

    operations = [
        migrations.AlterField(
            model_name="season",
            name="number",
            field=models.FloatField(default=1),
        ),
    ]
