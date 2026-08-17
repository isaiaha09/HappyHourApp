import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import { ContentReportModal } from '../components/ContentReportModal';

jest.mock('expo-image-picker', () => ({
	launchImageLibraryAsync: jest.fn(),
}));

describe('ContentReportModal screenshot evidence', () => {
	it('lets a user attach a library screenshot before sending the report', async () => {
		jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
			assets: [{
				assetId: 'screenshot-asset',
				fileName: 'conversation.png',
				fileSize: 1234,
				height: 1200,
				mimeType: 'image/png',
				uri: 'file:///conversation.png',
				width: 800,
			}],
			canceled: false,
		});
		const onClose = jest.fn();
		const onSubmit = jest.fn().mockResolvedValue('Report received.');

		const screen = render(
			<ContentReportModal
				onClose={onClose}
				onSubmit={onSubmit}
				screenshotTip
				targetLabel="direct message"
				visible
			/>,
		);

		fireEvent.press(screen.getByText('Attach screenshot'));
		await waitFor(() => expect(screen.getByText('conversation.png')).toBeTruthy());
		fireEvent.press(screen.getByText('Objectionable content'));
		fireEvent.press(screen.getByText('Send report'));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
			'objectionable_content',
			'',
			expect.objectContaining({
				mimeType: 'image/png',
				name: 'conversation.png',
				uri: 'file:///conversation.png',
			}),
		));
	});
});