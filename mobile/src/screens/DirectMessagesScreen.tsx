import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Animated, Image, Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../appStyles';
import { NativeIOSLiquidGlassHeaderButton } from '../components/NativeIOSLiquidGlass';
import { PhotoLightbox } from '../components/PhotoLightbox';
import type { BusinessAttachmentDraft, DirectMessageItem, DirectMessageThread, DirectMessageThreadDetailResponse, DirectMessageSendResponse, SignupResponse } from '../types';

type DirectMessagesScreenProps = {
	backButtonLabel?: string;
	contextBusinessName?: string | null;
	contextListingSlug?: string | null;
	isLandscape: boolean;
	onBack: () => void;
	onBlockCustomerFromDirectMessaging: (customerUsername: string) => Promise<void> | void;
	onDeleteConversation: (threadId: number) => Promise<void> | void;
	onLoadThreadDetail: (threadId: number) => Promise<DirectMessageThreadDetailResponse>;
	onRefreshThreads: () => Promise<DirectMessageThread[]>;
	onSendImageMessage: (threadId: number, image: BusinessAttachmentDraft) => Promise<DirectMessageSendResponse>;
	onSendTextMessage: (payload: { listingSlug?: string; message: string; threadId?: number }) => Promise<DirectMessageSendResponse>;
	onUnblockCustomerFromDirectMessaging: (blockId: number) => Promise<void> | void;
	session: SignupResponse;
};

const directMessageThreadCache = new Map<string, DirectMessageThread[]>();

function buildImageDraft(asset: ImagePicker.ImagePickerAsset): BusinessAttachmentDraft {
	const extension = asset.mimeType?.includes('png') ? 'png' : 'jpg';
	return {
		id: `${asset.assetId ?? 'dm-image'}-${Date.now()}`,
		name: asset.fileName || `direct-message.${extension}`,
		uri: asset.uri,
		mimeType: asset.mimeType || 'image/jpeg',
		size: typeof asset.fileSize === 'number' ? asset.fileSize : null,
	};
}

function wrapMessageText(value: string, maxCharsPerLine = 30) {
	return value
		.split('\n')
		.map((line) => {
			if (!line.length) {
				return '';
			}

			const wrappedLines: string[] = [];
			const words = line.split(/\s+/).filter(Boolean);
			let currentLine = '';

			for (const word of words) {
				if (!currentLine.length) {
					currentLine = word;
					continue;
				}

				if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
					currentLine = `${currentLine} ${word}`;
					continue;
				}

				wrappedLines.push(currentLine);
				currentLine = word;
			}

			if (currentLine.length) {
				wrappedLines.push(currentLine);
			}

			return wrappedLines.join('\n');
		})
		.join('\n');
}

export function DirectMessagesScreen({
	backButtonLabel = 'Back',
	contextBusinessName = null,
	contextListingSlug = null,
	isLandscape,
	onBack,
	onBlockCustomerFromDirectMessaging,
	onDeleteConversation,
	onLoadThreadDetail,
	onRefreshThreads,
	onSendImageMessage,
	onSendTextMessage,
	onUnblockCustomerFromDirectMessaging,
	session,
}: DirectMessagesScreenProps) {
	const insets = useSafeAreaInsets();
	const messageScrollRef = useRef<ScrollView | null>(null);
	const swipeableRowRefs = useRef(new Map<number, Swipeable | null>());
	const threadCacheKey = `${session.portal}:${session.id}`;
	const cachedThreads = directMessageThreadCache.get(threadCacheKey) ?? null;
	const [threads, setThreads] = useState<DirectMessageThread[]>(() => cachedThreads ?? []);
	const [loadingThreads, setLoadingThreads] = useState(() => !cachedThreads);
	const [threadsError, setThreadsError] = useState<string | null>(null);
	const normalizedContextBusinessName = contextBusinessName?.trim().toLowerCase() ?? '';
	const hasCustomerContext = session.portal === 'customer' && Boolean(contextListingSlug || normalizedContextBusinessName);

	function findPreferredThread(nextThreads: DirectMessageThread[]) {
		if (!hasCustomerContext) {
			return null;
		}

		const slugMatch = contextListingSlug
			? nextThreads.find((thread) => thread.business_slug === contextListingSlug)
			: null;
		if (slugMatch) {
			return slugMatch;
		}

		if (!normalizedContextBusinessName) {
			return null;
		}

		return nextThreads.find((thread) => thread.business_name.trim().toLowerCase() === normalizedContextBusinessName) ?? null;
	}

	const [selectedThreadId, setSelectedThreadId] = useState<number | null>(() => {
		if (cachedThreads?.length) {
			return findPreferredThread(cachedThreads)?.id ?? null;
		}

		return null;
	});
	const [loadingMessages, setLoadingMessages] = useState(false);
	const [messagesError, setMessagesError] = useState<string | null>(null);
	const [messages, setMessages] = useState<DirectMessageItem[]>([]);
	const [composerText, setComposerText] = useState('');
	const [composerImageDraft, setComposerImageDraft] = useState<BusinessAttachmentDraft | null>(null);
	const [sending, setSending] = useState(false);
	const [updatingBlock, setUpdatingBlock] = useState(false);
	const [pendingDeleteThread, setPendingDeleteThread] = useState<DirectMessageThread | null>(null);
	const [pendingBlockThread, setPendingBlockThread] = useState<DirectMessageThread | null>(null);
	const [pendingUnblockThread, setPendingUnblockThread] = useState<DirectMessageThread | null>(null);
	const [processingInboxAction, setProcessingInboxAction] = useState<'delete' | 'block' | 'unblock' | null>(null);
	const [keyboardVisible, setKeyboardVisible] = useState(false);
	const [photoLightboxVisible, setPhotoLightboxVisible] = useState(false);
	const [photoLightboxIndex, setPhotoLightboxIndex] = useState(0);

	const selectedThread = useMemo(
		() => threads.find((thread) => thread.id === selectedThreadId) ?? null,
		[selectedThreadId, threads],
	);
	const messageImageUrls = useMemo(
		() => messages
			.filter((message) => message.message_type === 'image' && Boolean(message.image_url))
			.map((message) => message.image_url),
		[messages],
	);
	const blockedCustomerAccounts = session.blocked_customer_accounts ?? [];

	function getBlockedCustomerAccountForThread(thread: DirectMessageThread | null) {
		if (!isBusinessPortal || !thread?.customer_username) {
			return null;
		}

		return blockedCustomerAccounts.find(
			(account) => account.username.trim().toLowerCase() === thread.customer_username.trim().toLowerCase(),
		) ?? null;
	}

	const isBusinessPortal = session.portal === 'business';
	const blockedCustomerAccount = useMemo(() => getBlockedCustomerAccountForThread(selectedThread), [selectedThread, blockedCustomerAccounts, isBusinessPortal]);
	const businessThreadBlocked = Boolean(blockedCustomerAccount);
	const launchedFromBusinessProfile = hasCustomerContext;
	const customerHasContextWithoutThread = !!(hasCustomerContext && !selectedThreadId);
	const showInboxList = !launchedFromBusinessProfile && !selectedThreadId;
	const showConversation = launchedFromBusinessProfile || !!selectedThreadId;
	const inboxFade = useRef(new Animated.Value(showInboxList ? 1 : 0)).current;
	const screenFade = useRef(new Animated.Value(launchedFromBusinessProfile ? 0 : 1)).current;

	function closeAllSwipeableRows(exceptThreadId?: number) {
		swipeableRowRefs.current.forEach((row, threadId) => {
			if (!row || threadId === exceptThreadId) {
				return;
			}
			row.close();
		});
	}

	function formatThreadTimestamp(value: string) {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) {
			return '';
		}

		const elapsedMs = Date.now() - parsed.getTime();
		const elapsedMinutes = Math.floor(elapsedMs / 60000);
		if (elapsedMinutes < 1) {
			return 'Sent just now';
		}
		if (elapsedMinutes < 60) {
			return `Sent ${elapsedMinutes}m ago`;
		}

		const elapsedHours = Math.floor(elapsedMinutes / 60);
		if (elapsedHours < 24) {
			return `Sent ${elapsedHours}h ago`;
		}

		const elapsedDays = Math.floor(elapsedHours / 24);
		return `Sent ${elapsedDays}d ago`;
	}

	function buildThreadInitials(name: string) {
		const tokens = name.trim().split(/\s+/).filter(Boolean);
		if (!tokens.length) {
			return '?';
		}

		if (tokens.length === 1) {
			return tokens[0].slice(0, 2).toUpperCase();
		}

		return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
	}

	function handleOpenMessagePhotoLightbox(imageUrl: string) {
		const imageIndex = messageImageUrls.indexOf(imageUrl);
		if (imageIndex < 0) {
			return;
		}
		setPhotoLightboxIndex(imageIndex);
		setPhotoLightboxVisible(true);
	}

	function getThreadDisplayName(thread: DirectMessageThread) {
		if (isBusinessPortal) {
			return thread.customer_username || 'Customer';
		}
		return thread.business_name;
	}

	useEffect(() => {
		let mounted = true;

		async function loadThreads() {
			const cachedPreferredThread = cachedThreads ? findPreferredThread(cachedThreads) : null;
			const canUseCachedThreads = Boolean(cachedThreads) && (!hasCustomerContext || Boolean(cachedPreferredThread));

			if (canUseCachedThreads && cachedThreads) {
				setThreads(cachedThreads);
				setLoadingThreads(false);
				setThreadsError(null);
				if (cachedPreferredThread) {
					setSelectedThreadId(cachedPreferredThread.id);
				}
			} else if (cachedThreads && !hasCustomerContext) {
				setThreads(cachedThreads);
				setLoadingThreads(false);
				setThreadsError(null);
			}

			if (!cachedThreads) {
				setLoadingThreads(true);
			}
			setThreadsError(null);
			try {
				const nextThreads = await onRefreshThreads();
				if (!mounted) {
					return;
				}
				setThreads(nextThreads);
				directMessageThreadCache.set(threadCacheKey, nextThreads);

				const preferredThread = findPreferredThread(nextThreads);
				setSelectedThreadId((currentThreadId) => {
					if (preferredThread) {
						return preferredThread.id;
					}

					if (!currentThreadId) {
						return null;
					}

					return nextThreads.some((thread) => thread.id === currentThreadId) ? currentThreadId : null;
				});
			} catch (error) {
				if (!mounted) {
					return;
				}
				setThreadsError(error instanceof Error ? error.message : 'Unable to load direct message threads.');
			} finally {
				if (mounted) {
					setLoadingThreads(false);
				}
			}
		}

		void loadThreads();

		return () => {
			mounted = false;
		};
	}, [contextListingSlug, hasCustomerContext, normalizedContextBusinessName, onRefreshThreads, threadCacheKey]);

	useEffect(() => {
		let mounted = true;

		async function loadMessages() {
			if (!selectedThreadId) {
				setMessages([]);
				setMessagesError(null);
				return;
			}

			setLoadingMessages(true);
			setMessagesError(null);
			try {
				const detail = await onLoadThreadDetail(selectedThreadId);
				if (!mounted) {
					return;
				}
				setMessages(detail.messages ?? []);
			} catch (error) {
				if (!mounted) {
					return;
				}
				setMessagesError(error instanceof Error ? error.message : 'Unable to load this conversation.');
			} finally {
				if (mounted) {
					setLoadingMessages(false);
				}
			}
		}

		void loadMessages();

		return () => {
			mounted = false;
		};
	}, [onLoadThreadDetail, selectedThreadId]);

	async function refreshThreadsAndThread(threadIdToSelect?: number) {
		const nextThreads = await onRefreshThreads();
		setThreads(nextThreads);
		directMessageThreadCache.set(threadCacheKey, nextThreads);
		if (threadIdToSelect) {
			setSelectedThreadId(threadIdToSelect);
			return;
		}

		if (selectedThreadId && nextThreads.some((thread) => thread.id === selectedThreadId)) {
			return;
		}

		const nextPreferred = findPreferredThread(nextThreads);
		setSelectedThreadId(nextPreferred?.id ?? null);
	}

	function updateThreadCache(nextThreads: DirectMessageThread[]) {
		directMessageThreadCache.set(threadCacheKey, nextThreads);
		setThreads(nextThreads);
	}

	async function handleSendText() {
		const normalizedMessage = wrapMessageText(composerText.trim());
		const hasImageDraft = Boolean(composerImageDraft);

		if (businessThreadBlocked) {
			setMessagesError('Unblock this customer before sending new direct messages.');
			return;
		}

		if (!normalizedMessage && !hasImageDraft) {
			setMessagesError('Enter a message or add a photo before sending.');
			return;
		}

		if (!selectedThreadId && !contextListingSlug) {
			setMessagesError('Choose a conversation before sending a message.');
			return;
		}

		setSending(true);
		setMessagesError(null);

		try {
			let nextThreadId = selectedThreadId ?? null;

			if (hasImageDraft && isBusinessPortal) {
				if (!nextThreadId) {
					setMessagesError('Open a conversation before sending a photo.');
					return;
				}
				const imageResponse = await onSendImageMessage(nextThreadId, composerImageDraft as BusinessAttachmentDraft);
				nextThreadId = imageResponse.thread.id;
			}

			if (normalizedMessage) {
				const textResponse = await onSendTextMessage({
					threadId: nextThreadId ?? undefined,
					listingSlug: nextThreadId ? undefined : contextListingSlug ?? undefined,
					message: normalizedMessage,
				});
				nextThreadId = textResponse.thread.id;
			}

			if (!nextThreadId) {
				setMessagesError('Choose a conversation before sending a message.');
				return;
			}

			setComposerText('');
			setComposerImageDraft(null);
			await refreshThreadsAndThread(nextThreadId);
			const detail = await onLoadThreadDetail(nextThreadId);
			setMessages(detail.messages ?? []);
		} catch (error) {
			setMessagesError(error instanceof Error ? error.message : 'Unable to send your message right now.');
		} finally {
			setSending(false);
		}
	}

	async function handlePickBusinessImage() {
		if (businessThreadBlocked) {
			setMessagesError('Unblock this customer before sending a photo.');
			return;
		}

		if (!selectedThreadId) {
			setMessagesError('Open a conversation before sending a photo.');
			return;
		}

		const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!permission.granted) {
			setMessagesError('Photo library permission is required to send a direct message image.');
			return;
		}

		const picker = await ImagePicker.launchImageLibraryAsync({
			allowsEditing: true,
			allowsMultipleSelection: false,
			mediaTypes: ['images'],
			quality: 0.8,
		});

		if (picker.canceled || !picker.assets.length) {
			return;
		}

		setSending(true);
		setMessagesError(null);

		try {
			setComposerImageDraft(buildImageDraft(picker.assets[0]));
		} catch (error) {
			setMessagesError(error instanceof Error ? error.message : 'Unable to attach this photo right now.');
		} finally {
			setSending(false);
		}
	}

	function scrollMessagesToEnd(animated = true) {
		requestAnimationFrame(() => {
			messageScrollRef.current?.scrollToEnd({ animated });
		});
	}

	async function handleUnblockCustomer() {
		if (!blockedCustomerAccount || updatingBlock) {
			return;
		}

		setUpdatingBlock(true);
		setMessagesError(null);
		try {
			await onUnblockCustomerFromDirectMessaging(blockedCustomerAccount.block_id);
		} catch (error) {
			setMessagesError(error instanceof Error ? error.message : 'Unable to unblock this customer right now.');
		} finally {
			setUpdatingBlock(false);
		}
	}

	async function handleConfirmDeleteConversation() {
		if (!pendingDeleteThread || processingInboxAction) {
			return;
		}

		setProcessingInboxAction('delete');
		setThreadsError(null);
		try {
			await onDeleteConversation(pendingDeleteThread.id);
			const nextThreads = threads.filter((thread) => thread.id !== pendingDeleteThread.id);
			updateThreadCache(nextThreads);
			closeAllSwipeableRows();
			setPendingDeleteThread(null);
		} catch (error) {
			setThreadsError(error instanceof Error ? error.message : 'Unable to delete this conversation right now.');
		} finally {
			setProcessingInboxAction(null);
		}
	}

	async function handleConfirmBlockCustomer() {
		if (!pendingBlockThread || processingInboxAction) {
			return;
		}

		setProcessingInboxAction('block');
		setThreadsError(null);
		try {
			await onBlockCustomerFromDirectMessaging(pendingBlockThread.customer_username);
			await refreshThreadsAndThread();
			closeAllSwipeableRows();
			setPendingBlockThread(null);
		} catch (error) {
			setThreadsError(error instanceof Error ? error.message : 'Unable to block this customer right now.');
		} finally {
			setProcessingInboxAction(null);
		}
	}

	async function handleConfirmUnblockCustomer() {
		if (!pendingUnblockThread || processingInboxAction) {
			return;
		}

		const blockedAccount = getBlockedCustomerAccountForThread(pendingUnblockThread);
		if (!blockedAccount) {
			setPendingUnblockThread(null);
			return;
		}

		setProcessingInboxAction('unblock');
		setThreadsError(null);
		try {
			await onUnblockCustomerFromDirectMessaging(blockedAccount.block_id);
			await refreshThreadsAndThread();
			closeAllSwipeableRows();
			setPendingUnblockThread(null);
		} catch (error) {
			setThreadsError(error instanceof Error ? error.message : 'Unable to unblock this customer right now.');
		} finally {
			setProcessingInboxAction(null);
		}
	}

	function renderBusinessInboxActions(thread: DirectMessageThread) {
		const threadBlockedAccount = getBlockedCustomerAccountForThread(thread);
		const showUnblockAction = Boolean(threadBlockedAccount);
		return (
			<View style={styles.directMessageInboxActionTray}>
				<Pressable
					onPress={() => {
						closeAllSwipeableRows(thread.id);
						if (showUnblockAction) {
							setPendingUnblockThread(thread);
							return;
						}
						setPendingBlockThread(thread);
					}}
					style={[styles.directMessageInboxActionButton, showUnblockAction ? styles.directMessageInboxActionButtonUnblock : styles.directMessageInboxActionButtonBlock]}
				>
					<Ionicons color="#fffaf4" name={showUnblockAction ? 'lock-open-outline' : 'ban-outline'} size={26} />
				</Pressable>
				<Pressable
					onPress={() => {
						closeAllSwipeableRows(thread.id);
						setPendingDeleteThread(thread);
					}}
					style={[styles.directMessageInboxActionButton, styles.directMessageInboxActionButtonDelete]}
				>
					<Ionicons color="#fffaf4" name="trash-outline" size={26} />
				</Pressable>
			</View>
		);
	}

	useEffect(() => {
		if (!loadingMessages) {
			scrollMessagesToEnd(false);
		}
	}, [loadingMessages, selectedThreadId]);

	useEffect(() => {
		Animated.timing(inboxFade, {
			duration: 180,
			toValue: showInboxList ? 1 : 0,
			useNativeDriver: true,
		}).start();
	}, [inboxFade, showInboxList]);

	useEffect(() => {
		if (!launchedFromBusinessProfile) {
			screenFade.setValue(1);
			return;
		}

		screenFade.setValue(0);
		Animated.timing(screenFade, {
			duration: 220,
			toValue: 1,
			useNativeDriver: true,
		}).start();
	}, [launchedFromBusinessProfile, screenFade]);

	useEffect(() => {
		const showSubscription = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
		const hideSubscription = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	useEffect(() => {
		return () => {
			closeAllSwipeableRows();
		};
	}, []);

	return (
		<KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[styles.detailScreenRoot, styles.directMessageScreenRoot, isLandscape ? styles.detailScreenLandscape : null]}>
			<Animated.View style={{ flex: 1, opacity: screenFade }}>
				<View style={[styles.screenHeaderBar, styles.screenHeaderBarRow, styles.directMessageScreenHeaderBar]}>
					{!showInboxList ? (
						<NativeIOSLiquidGlassHeaderButton
							fallback={(
								<Pressable
									onPress={() => {
										if (launchedFromBusinessProfile) {
											onBack();
											return;
										}
										setSelectedThreadId(null);
										setMessages([]);
										setMessagesError(null);
									}}
									style={styles.backButton}
								>
									<Text style={styles.backButtonText}>{launchedFromBusinessProfile ? backButtonLabel : 'Inbox'}</Text>
								</Pressable>
							)}
							label={launchedFromBusinessProfile ? backButtonLabel : 'Inbox'}
							onPress={() => {
								if (launchedFromBusinessProfile) {
									onBack();
									return;
								}
								setSelectedThreadId(null);
								setMessages([]);
								setMessagesError(null);
							}}
							variant="pill"
						/>
					) : (
						<NativeIOSLiquidGlassHeaderButton
							fallback={(
								<Pressable onPress={onBack} style={styles.backButton}>
									<Text style={styles.backButtonText}>{backButtonLabel}</Text>
								</Pressable>
							)}
							label={backButtonLabel}
							onPress={onBack}
							variant="pill"
						/>
					)}
				</View>

				<View style={{ flex: 1 }}>
				<Animated.View
					pointerEvents={showInboxList ? 'auto' : 'none'}
					style={{
						bottom: 0,
						left: 0,
						opacity: inboxFade,
						position: 'absolute',
						right: 0,
						top: 0,
					}}
				>
					<ScrollView
						contentContainerStyle={[
							styles.directMessageFeed,
							isLandscape ? styles.directMessageFeedLandscape : null,
							{ paddingBottom: Math.max(insets.bottom + 20, 20) },
						]}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
						<View style={styles.directMessageInboxHeaderBar}>
							<Text style={styles.directMessageInboxTitle}>Direct Messages</Text>
						</View>
						{threadsError ? <Text style={styles.errorText}>{threadsError}</Text> : null}
						{loadingThreads ? <ActivityIndicator color="#8a4b2a" style={styles.directMessageSpinner} /> : null}
						{!loadingThreads ? (
							<View style={styles.directMessageInboxList}>
								{threads.map((thread) => {
									const inboxRowContent = (
										<Pressable onPress={() => setSelectedThreadId(thread.id)} style={styles.directMessageInboxRow}>
											<View style={styles.directMessageInboxAvatar}>
												<Text style={styles.directMessageInboxAvatarText}>{buildThreadInitials(getThreadDisplayName(thread))}</Text>
											</View>
											<View style={styles.directMessageInboxCopy}>
												<Text numberOfLines={1} style={styles.directMessageInboxName}>{getThreadDisplayName(thread)}</Text>
												<Text numberOfLines={1} style={styles.directMessageInboxPreview}>{thread.last_message_preview || 'Start a conversation'}</Text>
												<Text style={styles.directMessageInboxMeta}>{formatThreadTimestamp(thread.last_message_at)}</Text>
											</View>
											{thread.unread_count ? <Text style={styles.directMessageUnreadBadge}>{thread.unread_count}</Text> : null}
										</Pressable>
									);

									if (!isBusinessPortal) {
										return <View key={thread.id}>{inboxRowContent}</View>;
									}

									return (
										<Swipeable
											friction={2}
											key={thread.id}
											onSwipeableWillOpen={() => closeAllSwipeableRows(thread.id)}
											renderRightActions={() => renderBusinessInboxActions(thread)}
											ref={(row) => {
												if (row) {
													swipeableRowRefs.current.set(thread.id, row);
												} else {
													swipeableRowRefs.current.delete(thread.id);
												}
											}}
											rightThreshold={48}
										>
											{inboxRowContent}
										</Swipeable>
									);
								})}
							</View>
						) : null}
						{!loadingThreads && !threads.length ? (
							<Text style={styles.dashboardSupportText}>No direct message conversations yet.</Text>
						) : null}
					</ScrollView>
				</Animated.View>

				<Animated.View
					pointerEvents={showConversation ? 'auto' : 'none'}
					style={{
						bottom: 0,
						left: 0,
						opacity: inboxFade.interpolate({
							inputRange: [0, 1],
							outputRange: [1, 0],
						}),
						position: 'absolute',
						right: 0,
						top: 0,
					}}
				>
					{showConversation ? (
						<>
							<View style={styles.directMessageConversationTitleBar}>
								<Text style={styles.directMessageConversationTitle}>
									{selectedThread?.business_name || contextBusinessName || 'Conversation'}
								</Text>
							</View>

							<ScrollView
								ref={messageScrollRef}
								contentContainerStyle={[
									styles.directMessageFeed,
									isLandscape ? styles.directMessageFeedLandscape : null,
									{ paddingBottom: Math.max(insets.bottom + 12, 12) },
								]}
								keyboardShouldPersistTaps="handled"
								onContentSizeChange={() => scrollMessagesToEnd(false)}
								showsVerticalScrollIndicator={false}
							>
								<View style={styles.directMessageConversationSection}>
									{messagesError ? <Text style={styles.errorText}>{messagesError}</Text> : null}
									{loadingMessages ? <ActivityIndicator color="#8a4b2a" style={styles.directMessageSpinner} /> : null}
									<View style={styles.directMessageMessageList}>
										{messages.map((message) => {
											const isMine = message.sender_id === session.id;
											const bubbleText = wrapMessageText(message.message ?? '');
											return (
												<View key={message.id} style={[styles.directMessageBubbleWrap, isMine ? styles.directMessageBubbleWrapMine : null]}>
													{message.message_type === 'image' && message.image_url ? (
														<View style={[styles.directMessageImageWrap, isMine ? styles.directMessageImageWrapMine : null]}>
															<Pressable onPress={() => handleOpenMessagePhotoLightbox(message.image_url)}>
																<Image source={{ uri: message.image_url }} style={styles.directMessageImage} />
															</Pressable>
														</View>
													) : (
														<View style={[styles.directMessageBubble, isMine ? styles.directMessageBubbleMine : null]}>
															<Text style={[styles.directMessageBubbleText, isMine ? styles.directMessageBubbleTextMine : null]}>{bubbleText}</Text>
														</View>
													)}
												</View>
											);
										})}
										{!loadingMessages && !messages.length && !customerHasContextWithoutThread ? (
											<Text style={styles.dashboardSupportText}>Start the conversation.</Text>
										) : null}
										{customerHasContextWithoutThread ? (
											<Text style={styles.dashboardSupportText}>Send your first message to start this conversation.</Text>
										) : null}
										{businessThreadBlocked ? (
											<View style={styles.errorBanner}>
												<Text style={styles.errorText}>This customer is currently blocked from direct messages. Unblock them before sending a reply.</Text>
												<Pressable onPress={() => void handleUnblockCustomer()} style={[styles.linkButtonSecondaryWide, styles.settingsInlineButton, updatingBlock ? styles.linkButtonDisabled : null]}>
													<Text style={styles.linkButtonSecondaryText}>{updatingBlock ? 'Unblocking...' : `Unblock @${blockedCustomerAccount?.username}`}</Text>
												</Pressable>
											</View>
										) : null}
									</View>
								</View>
							</ScrollView>

							<View
								style={[
									styles.directMessageComposerDock,
									{ paddingBottom: keyboardVisible ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 8) + 56 },
								]}
							>
								{isBusinessPortal ? (
									<Pressable onPress={() => void handlePickBusinessImage()} style={[styles.directMessageComposerIconButton, sending || businessThreadBlocked ? styles.linkButtonDisabled : null]}>
										<Text style={styles.directMessageComposerIconButtonText}>+</Text>
									</Pressable>
								) : null}
								{isBusinessPortal && composerImageDraft ? (
									<View style={styles.directMessageComposerImageDraftRow}>
										<Image source={{ uri: composerImageDraft.uri }} style={styles.directMessageComposerImageDraft} />
										<Pressable
											onPress={() => setComposerImageDraft(null)}
											style={[styles.directMessageComposerImageRemoveButton, sending ? styles.linkButtonDisabled : null]}
										>
											<Text style={styles.directMessageComposerImageRemoveButtonText}>Remove</Text>
										</Pressable>
									</View>
								) : null}
								<View style={styles.directMessageComposerRow}>
									<TextInput
										onChangeText={(value) => {
											setComposerText(value);
											setMessagesError(null);
										}}
										editable={!businessThreadBlocked}
										blurOnSubmit={false}
										multiline
										scrollEnabled
										placeholder={businessThreadBlocked ? 'Unblock this customer to reply' : 'Message'}
										placeholderTextColor="#9a7f6c"
										style={[styles.profileInput, styles.directMessageComposerInput]}
										value={composerText}
									/>
									<Pressable onPress={() => void handleSendText()} style={[styles.directMessageComposerSendButton, sending || businessThreadBlocked ? styles.linkButtonDisabled : null]}>
										<Text style={styles.linkButtonSecondaryText}>{sending ? 'Sending...' : 'Send'}</Text>
									</Pressable>
								</View>
							</View>
						</>
					) : null}
				</Animated.View>
				</View>
			</Animated.View>
			<PhotoLightbox
				imageUrls={messageImageUrls}
				initialIndex={photoLightboxIndex}
				onClose={() => setPhotoLightboxVisible(false)}
				visible={photoLightboxVisible}
			/>
			<Modal animationType="fade" onRequestClose={() => setPendingDeleteThread(null)} transparent visible={pendingDeleteThread !== null}>
				<Pressable onPress={() => setPendingDeleteThread(null)} style={styles.guestFavoriteModalBackdrop}>
					<Pressable onPress={() => undefined} style={styles.guestFavoriteModalCard}>
						<Text style={styles.guestFavoriteModalTitle}>Delete conversation?</Text>
						<Text style={styles.guestFavoriteModalText}>This permanently deletes the full conversation feed for both your business and the customer.</Text>
						{pendingDeleteThread ? <Text style={styles.directMessageActionModalHandle}>@{pendingDeleteThread.customer_username}</Text> : null}
						<View style={styles.guestFavoriteModalActions}>
							<Pressable onPress={() => setPendingDeleteThread(null)} style={styles.guestFavoriteModalSecondaryButton}>
								<Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
							</Pressable>
							<Pressable onPress={() => void handleConfirmDeleteConversation()} style={[styles.guestFavoriteModalPrimaryButton, processingInboxAction !== null ? styles.linkButtonDisabled : null]}>
								<Text style={styles.guestFavoriteModalPrimaryText}>{processingInboxAction === 'delete' ? 'Deleting...' : 'Delete conversation'}</Text>
							</Pressable>
						</View>
					</Pressable>
				</Pressable>
			</Modal>
			<Modal animationType="fade" onRequestClose={() => setPendingBlockThread(null)} transparent visible={pendingBlockThread !== null}>
				<Pressable onPress={() => setPendingBlockThread(null)} style={styles.guestFavoriteModalBackdrop}>
					<Pressable onPress={() => undefined} style={styles.guestFavoriteModalCard}>
						<Text style={styles.guestFavoriteModalTitle}>Block user?</Text>
						<Text style={styles.guestFavoriteModalText}>This customer will no longer be able to direct message your business until you unblock them.</Text>
						{pendingBlockThread ? <Text style={styles.directMessageActionModalHandle}>@{pendingBlockThread.customer_username}</Text> : null}
						<View style={styles.guestFavoriteModalActions}>
							<Pressable onPress={() => setPendingBlockThread(null)} style={styles.guestFavoriteModalSecondaryButton}>
								<Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
							</Pressable>
							<Pressable onPress={() => void handleConfirmBlockCustomer()} style={[styles.guestFavoriteModalPrimaryButton, processingInboxAction !== null ? styles.linkButtonDisabled : null]}>
								<Text style={styles.guestFavoriteModalPrimaryText}>{processingInboxAction === 'block' ? 'Blocking...' : 'Block user'}</Text>
							</Pressable>
						</View>
					</Pressable>
				</Pressable>
			</Modal>
			<Modal animationType="fade" onRequestClose={() => setPendingUnblockThread(null)} transparent visible={pendingUnblockThread !== null}>
				<Pressable onPress={() => setPendingUnblockThread(null)} style={styles.guestFavoriteModalBackdrop}>
					<Pressable onPress={() => undefined} style={styles.guestFavoriteModalCard}>
						<Text style={styles.guestFavoriteModalTitle}>Unblock user?</Text>
						<Text style={styles.guestFavoriteModalText}>This customer will be able to direct message your business again once you confirm.</Text>
						{pendingUnblockThread ? <Text style={styles.directMessageActionModalHandle}>@{pendingUnblockThread.customer_username}</Text> : null}
						<View style={styles.guestFavoriteModalActions}>
							<Pressable onPress={() => setPendingUnblockThread(null)} style={styles.guestFavoriteModalSecondaryButton}>
								<Text style={styles.guestFavoriteModalSecondaryText}>Cancel</Text>
							</Pressable>
							<Pressable onPress={() => void handleConfirmUnblockCustomer()} style={[styles.guestFavoriteModalPrimaryButton, processingInboxAction !== null ? styles.linkButtonDisabled : null]}>
								<Text style={styles.guestFavoriteModalPrimaryText}>{processingInboxAction === 'unblock' ? 'Unblocking...' : 'Unblock user'}</Text>
							</Pressable>
						</View>
					</Pressable>
				</Pressable>
			</Modal>
		</KeyboardAvoidingView>
	);
}
