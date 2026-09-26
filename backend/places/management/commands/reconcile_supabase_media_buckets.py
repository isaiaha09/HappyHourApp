from collections import Counter

from botocore.exceptions import ClientError
from django.core.management.base import BaseCommand, CommandError

from places.services.media_storage import classify_supabase_media_key
from places.services.production_backup import build_supabase_client, get_supabase_bucket_configs


def _error_is_missing_object(error):
	response = getattr(error, 'response', {}) or {}
	error_data = response.get('Error') or {}
	code = str(error_data.get('Code') or '')
	status = (response.get('ResponseMetadata') or {}).get('HTTPStatusCode')
	return code in {'404', 'NoSuchKey', 'NotFound'} or status == 404


def _normalized_etag(metadata):
	return str((metadata or {}).get('ETag') or '').strip().strip('"')


def _objects_match(left, right):
	return (
		left.get('ContentLength') == right.get('ContentLength')
		and _normalized_etag(left) != ''
		and _normalized_etag(left) == _normalized_etag(right)
		and str(left.get('ContentType') or '') == str(right.get('ContentType') or '')
	)


class Command(BaseCommand):
	help = (
		'Audit the public and private Supabase buckets, then move known managed media keys '
		'to their intended bucket. Defaults to a read-only dry run.'
	)

	def add_arguments(self, parser):
		parser.add_argument(
			'--apply',
			action='store_true',
			help='Copy each misrouted object, verify the destination, then delete the source object.',
		)

	def handle(self, *args, **options):
		try:
			client = build_supabase_client()
		except ValueError as error:
			raise CommandError(str(error)) from error

		buckets = {
			str(config.get('label') or ''): str(config.get('bucket') or '').strip()
			for config in get_supabase_bucket_configs()
		}
		public_bucket = buckets.get('public-media')
		private_bucket = buckets.get('private-media')
		if not public_bucket or not private_bucket:
			raise CommandError('Both public and private Supabase bucket names must be configured.')
		if public_bucket == private_bucket:
			raise CommandError('Public and private Supabase bucket names must be different.')

		bucket_names = {'public': public_bucket, 'private': private_bucket}
		move_plan = []
		unclassified_count = 0
		for actual_label, bucket_name in bucket_names.items():
			for item in self._list_objects(client, bucket_name):
				key = str(item.get('Key') or '')
				route = classify_supabase_media_key(key)
				if route is None:
					unclassified_count += 1
				elif route[0] != actual_label:
					move_plan.append({
						'key': key,
						'source_label': actual_label,
						'target_label': route[0],
						'category': route[1],
					})

		move_plan.sort(key=lambda item: (item['target_label'] != 'private', item['source_label'], item['key']))
		self.stdout.write('Supabase media bucket audit:')
		self.stdout.write(f'  Public bucket: {public_bucket}')
		self.stdout.write(f'  Private bucket: {private_bucket}')
		self.stdout.write(f'  Unclassified objects left in place: {unclassified_count}')

		counts = Counter((item['source_label'], item['target_label'], item['category']) for item in move_plan)
		if not counts:
			self.stdout.write(self.style.SUCCESS('No misrouted managed objects found.'))
			return
		for (source_label, target_label, category), count in sorted(counts.items()):
			self.stdout.write(f'  {source_label} -> {target_label} ({category}): {count} object(s)')

		if not options['apply']:
			self.stdout.write('Dry run only. Review the counts, then rerun with --apply to move these objects.')
			return

		self._preflight_destinations(client, move_plan, bucket_names)
		moved_count = self._apply_move_plan(client, move_plan, bucket_names)
		self.stdout.write(self.style.SUCCESS(f'Moved and verified {moved_count} object(s).'))

	def _list_objects(self, client, bucket_name):
		paginator = client.get_paginator('list_objects_v2')
		for page in paginator.paginate(Bucket=bucket_name):
			yield from page.get('Contents') or []

	def _head_or_none(self, client, bucket_name, key):
		try:
			return client.head_object(Bucket=bucket_name, Key=key)
		except ClientError as error:
			if _error_is_missing_object(error):
				return None
			raise

	def _preflight_destinations(self, client, move_plan, bucket_names):
		conflict_count = 0
		for item in move_plan:
			source_bucket = bucket_names[item['source_label']]
			target_bucket = bucket_names[item['target_label']]
			source_metadata = self._head_or_none(client, source_bucket, item['key'])
			target_metadata = self._head_or_none(client, target_bucket, item['key'])
			if source_metadata is None:
				conflict_count += 1
				continue
			if target_metadata is not None and not _objects_match(source_metadata, target_metadata):
				conflict_count += 1
				continue
			item['source_metadata'] = source_metadata
			item['target_metadata'] = target_metadata

		if conflict_count:
			raise CommandError(
				f'{conflict_count} object(s) could not be safely reconciled because the source was missing '
				'or a different object already exists in the destination. No objects were moved.'
			)

	def _apply_move_plan(self, client, move_plan, bucket_names):
		moved_count = 0
		for item in move_plan:
			source_bucket = bucket_names[item['source_label']]
			target_bucket = bucket_names[item['target_label']]
			source_metadata = item['source_metadata']
			target_metadata = item['target_metadata']

			if target_metadata is None:
				copy_source = {'Bucket': source_bucket, 'Key': item['key']}
				copy_options = {
					'Bucket': target_bucket,
					'Key': item['key'],
					'CopySource': copy_source,
					'MetadataDirective': 'COPY',
				}
				if source_metadata.get('ETag'):
					copy_options['CopySourceIfMatch'] = source_metadata['ETag']
				client.copy_object(**copy_options)
				target_metadata = client.head_object(Bucket=target_bucket, Key=item['key'])
				if not _objects_match(source_metadata, target_metadata):
					raise CommandError(
						f'Destination verification failed for {moved_count + 1} object(s). '
						'The source copy was retained.'
					)

			client.delete_object(Bucket=source_bucket, Key=item['key'])
			moved_count += 1
		return moved_count
