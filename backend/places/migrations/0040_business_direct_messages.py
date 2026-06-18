from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

	dependencies = [
		('places', '0039_favoritebusinesspushdevice'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.AddField(
			model_name='businessclaim',
			name='direct_messaging_enabled',
			field=models.BooleanField(default=True),
		),
		migrations.CreateModel(
			name='BusinessDirectMessageThread',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('last_message_at', models.DateTimeField(default=django.utils.timezone.now)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('business_claim', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='direct_message_threads', to='places.businessclaim')),
				('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='direct_message_threads', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-last_message_at', '-created_at'],
			},
		),
		migrations.CreateModel(
			name='BusinessDirectMessage',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('body', models.TextField()),
				('read_at', models.DateTimeField(blank=True, null=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_direct_messages', to=settings.AUTH_USER_MODEL)),
				('thread', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='places.businessdirectmessagethread')),
			],
			options={
				'ordering': ['created_at', 'id'],
			},
		),
		migrations.CreateModel(
			name='BusinessDirectMessageBlock',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('blocked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='business_direct_message_blocks_created', to=settings.AUTH_USER_MODEL)),
				('business_claim', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='direct_message_blocks', to='places.businessclaim')),
				('customer', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='blocked_business_direct_messages', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-created_at', '-id'],
			},
		),
		migrations.AddConstraint(
			model_name='businessdirectmessagethread',
			constraint=models.UniqueConstraint(fields=('business_claim', 'customer'), name='unique_direct_message_thread_per_business_customer'),
		),
		migrations.AddConstraint(
			model_name='businessdirectmessageblock',
			constraint=models.UniqueConstraint(fields=('business_claim', 'customer'), name='unique_blocked_customer_per_business_claim'),
		),
	]
