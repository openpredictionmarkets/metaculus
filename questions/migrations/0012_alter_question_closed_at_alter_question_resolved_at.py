# Generated by Django 5.0.6 on 2024-06-28 20:30

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("questions", "0011_alter_question_closed_at_alter_question_max_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="question",
            name="closed_at",
            field=models.DateTimeField(db_index=True, null=True),
        ),
        migrations.AlterField(
            model_name="question",
            name="resolved_at",
            field=models.DateTimeField(db_index=True, null=True),
        ),
    ]
