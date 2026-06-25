from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from .models import BusinessClaim, BusinessClaimAttachment
from .services.media_storage import delete_removed_storage_references, delete_storage_names, delete_storage_references


@receiver(pre_save, sender=BusinessClaim)
def capture_previous_business_claim_photo_references(sender, instance, **kwargs):
	if not instance.pk:
		return
	previous_references = sender.objects.filter(pk=instance.pk).values_list('photo_references', flat=True).first()
	instance._previous_photo_references = list(previous_references or [])
	previous_deal_overrides = sender.objects.filter(pk=instance.pk).values_list('deal_overrides', flat=True).first()
	instance._previous_deal_attachment_references = _get_deal_attachment_references(previous_deal_overrides)


@receiver(post_save, sender=BusinessClaim)
def cleanup_removed_business_claim_photo_references(sender, instance, created, **kwargs):
	if created:
		return
	previous_references = getattr(instance, '_previous_photo_references', None)
	if previous_references is None:
		return
	delete_removed_storage_references(previous_references, instance.photo_references or [])
	delattr(instance, '_previous_photo_references')
	previous_deal_attachment_references = getattr(instance, '_previous_deal_attachment_references', None)
	if previous_deal_attachment_references is not None:
		delete_removed_storage_references(previous_deal_attachment_references, _get_deal_attachment_references(instance.deal_overrides))
		delattr(instance, '_previous_deal_attachment_references')


@receiver(post_delete, sender=BusinessClaim)
def cleanup_deleted_business_claim_photo_references(sender, instance, **kwargs):
	delete_storage_references(instance.photo_references or [])
	delete_storage_references(_get_deal_attachment_references(instance.deal_overrides))


@receiver(pre_save, sender=BusinessClaimAttachment)
def capture_previous_business_claim_attachment_file(sender, instance, **kwargs):
	if not instance.pk:
		return
	previous_file_name = sender.objects.filter(pk=instance.pk).values_list('file', flat=True).first()
	instance._previous_file_name = str(previous_file_name or '').strip()


@receiver(post_save, sender=BusinessClaimAttachment)
def cleanup_replaced_business_claim_attachment_file(sender, instance, created, **kwargs):
	if created:
		return
	previous_file_name = getattr(instance, '_previous_file_name', '')
	current_file_name = str(getattr(instance.file, 'name', '') or '').strip()
	if previous_file_name and previous_file_name != current_file_name:
		delete_storage_names([previous_file_name])
	if hasattr(instance, '_previous_file_name'):
		delattr(instance, '_previous_file_name')


@receiver(post_delete, sender=BusinessClaimAttachment)
def cleanup_deleted_business_claim_attachment_file(sender, instance, **kwargs):
	file_name = str(getattr(instance.file, 'name', '') or '').strip()
	if file_name:
		delete_storage_names([file_name])


def _get_deal_attachment_references(deal_overrides):
	references = []
	for deal in deal_overrides or []:
		if not isinstance(deal, dict):
			continue
		attachment = deal.get('attachment')
		if isinstance(attachment, dict) and attachment.get('url'):
			references.append(attachment['url'])
	return references