import { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { styles } from '../appStyles';
import type { BusinessAttachmentDraft, DirectMessageItem, DirectMessageThread, DirectMessageThreadDetailResponse, DirectMessageSendResponse, SignupResponse } from '../types';

type DirectMessagesScreenProps = {
  backButtonLabel?: string;
  contextBusinessName?: string | null;
  contextListingSlug?: string | null;
  isLandscape: boolean;
  onBack: () => void;
  onLoadThreadDetail: (threadId: number) => Promise<DirectMessageThreadDetailResponse>;
  onRefreshThreads: () => Promise<DirectMessageThread[]>;
  onSendImageMessage: (threadId: number, image: BusinessAttachmentDraft) => Promise<DirectMessageSendResponse>;
  onSendTextMessage: (payload: { listingSlug?: string; message: string; threadId?: number }) => Promise<DirectMessageSendResponse>;
  session: SignupResponse;
};

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
  onLoadThreadDetail,
  onRefreshThreads,
  onSendImageMessage,
  onSendTextMessage,
  session,
}: DirectMessagesScreenProps) {
  const insets = useSafeAreaInsets();
  const messageScrollRef = useRef<ScrollView | null>(null);
  const [threads, setThreads] = useState<DirectMessageThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threads],
  );

  const isBusinessPortal = session.portal === 'business';
  const customerHasContextWithoutThread = !!(session.portal === 'customer' && contextListingSlug && !selectedThreadId);

  useEffect(() => {
    let mounted = true;

    async function loadThreads() {
      setLoadingThreads(true);
      setThreadsError(null);
      try {
        const nextThreads = await onRefreshThreads();
        if (!mounted) {
          return;
        }
        setThreads(nextThreads);

        const preferredThread = contextListingSlug
          ? nextThreads.find((thread) => thread.business_slug === contextListingSlug)
          : null;
        const fallbackThread = preferredThread ?? nextThreads[0] ?? null;
        setSelectedThreadId(fallbackThread ? fallbackThread.id : null);
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
  }, [contextListingSlug, onRefreshThreads]);

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
    if (threadIdToSelect) {
      setSelectedThreadId(threadIdToSelect);
      return;
    }

    if (selectedThreadId && nextThreads.some((thread) => thread.id === selectedThreadId)) {
      return;
    }

    const nextPreferred = contextListingSlug
      ? nextThreads.find((thread) => thread.business_slug === contextListingSlug)
      : null;
    setSelectedThreadId((nextPreferred ?? nextThreads[0] ?? null)?.id ?? null);
  }

  async function handleSendText() {
    const normalizedMessage = wrapMessageText(composerText.trim());
    if (!normalizedMessage) {
      setMessagesError('Enter a message before sending.');
      return;
    }

    if (!selectedThreadId && !contextListingSlug) {
      setMessagesError('Choose a conversation before sending a message.');
      return;
    }

    setSending(true);
    setMessagesError(null);

    try {
      const response = await onSendTextMessage({
        threadId: selectedThreadId ?? undefined,
        listingSlug: selectedThreadId ? undefined : contextListingSlug ?? undefined,
        message: normalizedMessage,
      });
      const nextThreadId = response.thread.id;
      setComposerText('');
      await refreshThreadsAndThread(nextThreadId);
      const detail = await onLoadThreadDetail(nextThreadId);
      setMessages(detail.messages ?? []);
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Unable to send your message right now.');
    } finally {
      setSending(false);
    }
  }

  async function handleSendBusinessImage() {
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
      const response = await onSendImageMessage(selectedThreadId, buildImageDraft(picker.assets[0]));
      await refreshThreadsAndThread(response.thread.id);
      const detail = await onLoadThreadDetail(response.thread.id);
      setMessages(detail.messages ?? []);
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : 'Unable to send this photo right now.');
    } finally {
      setSending(false);
    }
  }

  function scrollMessagesToEnd(animated = true) {
    requestAnimationFrame(() => {
      messageScrollRef.current?.scrollToEnd({ animated });
    });
  }

  useEffect(() => {
    if (!loadingMessages) {
      scrollMessagesToEnd(false);
    }
  }, [loadingMessages, selectedThreadId]);

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0} style={[styles.detailScreenRoot, styles.directMessageScreenRoot, isLandscape ? styles.detailScreenLandscape : null]}>
      <View style={[styles.screenHeaderBar, styles.screenHeaderBarRow, styles.directMessageScreenHeaderBar]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>{backButtonLabel}</Text>
        </Pressable>
      </View>

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
                  <View style={[styles.directMessageBubble, isMine ? styles.directMessageBubbleMine : null]}>
                    {message.message_type === 'image' && message.image_url ? (
                      <Image source={{ uri: message.image_url }} style={styles.directMessageImage} />
                    ) : (
                      <Text style={[styles.directMessageBubbleText, isMine ? styles.directMessageBubbleTextMine : null]}>{bubbleText}</Text>
                    )}
                  </View>
                </View>
              );
            })}
            {!loadingMessages && !messages.length && !customerHasContextWithoutThread ? (
              <Text style={styles.dashboardSupportText}>Start the conversation.</Text>
            ) : null}
            {customerHasContextWithoutThread ? (
              <Text style={styles.dashboardSupportText}>Send your first message to start this conversation.</Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.directMessageComposerDock, { paddingBottom: Math.max(insets.bottom, 18) + 25 }]}>
        {isBusinessPortal ? (
          <Pressable onPress={() => void handleSendBusinessImage()} style={[styles.directMessageComposerIconButton, sending ? styles.linkButtonDisabled : null]}>
            <Text style={styles.directMessageComposerIconButtonText}>+</Text>
          </Pressable>
        ) : null}
        {!isBusinessPortal ? (
          <View style={styles.directMessageComposerRow}>
            <TextInput
              onChangeText={(value) => {
                setComposerText(value);
                setMessagesError(null);
              }}
              blurOnSubmit={false}
              multiline
              scrollEnabled
              placeholder="Message"
              placeholderTextColor="#9a7f6c"
              style={[styles.profileInput, styles.directMessageComposerInput]}
              value={composerText}
            />
            <Pressable onPress={() => void handleSendText()} style={[styles.directMessageComposerSendButton, sending ? styles.linkButtonDisabled : null]}>
              <Text style={styles.linkButtonSecondaryText}>{sending ? 'Sending...' : 'Send'}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.directMessageComposerHint}>Business accounts can send pictures only.</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
