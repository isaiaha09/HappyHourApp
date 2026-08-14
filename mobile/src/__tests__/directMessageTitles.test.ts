import { getDirectMessageConversationTitle } from '../screens/DirectMessagesScreen';
import type { DirectMessageThread } from '../types';

const thread: DirectMessageThread = {
	business_name: 'Photo Message Bistro',
	business_slug: 'photo-message-bistro',
	customer_username: 'image_dm_customer',
	id: 1,
	last_message_at: '2026-08-13T17:00:00Z',
	last_message_preview: 'Hello business profile!',
	read_only: false,
	read_only_reason: '',
	unread_count: 0,
};

describe('getDirectMessageConversationTitle', () => {
	it('shows the customer username to business users', () => {
		expect(getDirectMessageConversationTitle({
			contextBusinessName: 'Photo Message Bistro',
			isBusinessPortal: true,
			selectedThread: thread,
		})).toBe('image_dm_customer');
	});

	it('shows the business name to customer users', () => {
		expect(getDirectMessageConversationTitle({
			contextBusinessName: 'Photo Message Bistro',
			isBusinessPortal: false,
			selectedThread: thread,
		})).toBe('Photo Message Bistro');
	});
});