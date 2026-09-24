from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

	dependencies = [
		('places', '0063_account_security_state_and_retry_grants'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.CreateModel(
			name='BusinessClaimRetryVerification',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('code_digest', models.CharField(max_length=64)),
				('expires_at', models.DateTimeField()),
				('attempts', models.PositiveSmallIntegerField(default=0)),
				('used_at', models.DateTimeField(blank=True, null=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('rejected_claim', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='retry_verifications', to='places.businessclaim')),
				('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='business_claim_retry_verifications', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-created_at', '-pk'],
				'indexes': [models.Index(fields=['user', 'expires_at'], name='places_retry_verify_exp_idx')],
			},
		),
	]
