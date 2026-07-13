import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Text,
  View,
  type ViewToken,
} from 'react-native';

import { fetchHomeFeed, recordFeedEngagement, recordFeedImpression } from '../api';
import { styles } from '../appStyles';
import { HomeFeedCard } from '../components/HomeFeedCards';
import type { FeedItem } from '../types';

type FeedCacheEntry = {
  impressionIds: Record<string, number>;
  items: FeedItem[];
  nextPage: number | null;
  seenImpressionIds: Set<string>;
  sessionKey: string;
};

type HomeFeedScreenProps = {
  apiBaseUrl: string;
  feedAnimatedStyle?: object;
  footerContent?: ReactNode;
  headerHorizontalPadding?: number;
  isLandscape: boolean;
  headerContent?: ReactNode;
  refreshProgressViewOffset?: number;
  reloadToken: number;
  searchQuery: string;
  selectedCity: string;
  selectedVenueTypes: string[];
  onVisibleCountChange?: (count: number) => void;
  showFeedHeader?: boolean;
};

const PAGE_SIZE = 12;
const feedCache = new Map<string, FeedCacheEntry>();

function createFeedSessionKey() {
  return `feed-${Date.now()}-${Math.round(Math.random() * 1000000)}`;
}

function getFeedCacheKey(apiBaseUrl: string, reloadToken: number, selectedCity: string) {
  return `${apiBaseUrl}::${selectedCity}::${reloadToken}`;
}

function getOrCreateFeedCacheEntry(cacheKey: string) {
  const existingEntry = feedCache.get(cacheKey);
  if (existingEntry) {
    return existingEntry;
  }

  const nextEntry: FeedCacheEntry = {
    impressionIds: {},
    items: [],
    nextPage: 1,
    seenImpressionIds: new Set<string>(),
    sessionKey: createFeedSessionKey(),
  };
  feedCache.set(cacheKey, nextEntry);
  return nextEntry;
}

function replaceFeedCacheEntry(cacheKey: string, items: FeedItem[], nextPage: number | null) {
  const existingEntry = getOrCreateFeedCacheEntry(cacheKey);
  const nextEntry: FeedCacheEntry = {
    impressionIds: {},
    items,
    nextPage,
    seenImpressionIds: new Set<string>(),
    sessionKey: createFeedSessionKey(),
  };

  if (existingEntry.items.length === items.length && existingEntry.items.every((item, index) => item.id === items[index]?.id)) {
    nextEntry.impressionIds = existingEntry.impressionIds;
    nextEntry.seenImpressionIds = existingEntry.seenImpressionIds;
    nextEntry.sessionKey = existingEntry.sessionKey;
  }

  feedCache.set(cacheKey, nextEntry);
  return nextEntry;
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function dedupeFeedItems(items: FeedItem[]) {
  const seenIds = new Set<string>();
  return items.filter((item) => {
    if (seenIds.has(item.id)) {
      return false;
    }
    seenIds.add(item.id);
    return true;
  });
}

export function HomeFeedScreen({
  apiBaseUrl,
  feedAnimatedStyle,
  footerContent,
  headerHorizontalPadding = 0,
  isLandscape,
  headerContent,
  refreshProgressViewOffset = 0,
  reloadToken,
  searchQuery,
  selectedCity,
  selectedVenueTypes,
  onVisibleCountChange,
  showFeedHeader = true,
}: HomeFeedScreenProps) {
  const cacheKey = getFeedCacheKey(apiBaseUrl, reloadToken, selectedCity);
  const cachedEntry = getOrCreateFeedCacheEntry(cacheKey);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(cachedEntry.items.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(cachedEntry.items.length > 0 ? cachedEntry.nextPage : 1);
  const impressionIdsRef = useRef<Record<string, number>>({ ...cachedEntry.impressionIds });
  const seenImpressionsRef = useRef<Set<string>>(new Set(cachedEntry.seenImpressionIds));
  const apiBaseUrlRef = useRef(apiBaseUrl);
  const sessionKeyRef = useRef(cachedEntry.sessionKey);

  apiBaseUrlRef.current = apiBaseUrl;

  useEffect(() => {
    const nextCachedEntry = getOrCreateFeedCacheEntry(cacheKey);
    impressionIdsRef.current = { ...nextCachedEntry.impressionIds };
    seenImpressionsRef.current = new Set(nextCachedEntry.seenImpressionIds);
    sessionKeyRef.current = nextCachedEntry.sessionKey;
    setItems(nextCachedEntry.items);
    setNextPage(nextCachedEntry.items.length > 0 ? nextCachedEntry.nextPage : 1);
    setInitialLoading(nextCachedEntry.items.length === 0);
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;

    if (cachedEntry.items.length > 0) {
      setItems(cachedEntry.items);
      setNextPage(cachedEntry.nextPage);
      setInitialLoading(false);
      setRefreshing(false);
      setErrorMessage(null);
      return () => {
        cancelled = true;
      };
    }

    async function loadFirstPage() {
      setInitialLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetchHomeFeed(apiBaseUrl, {
          city: selectedCity,
          page: 1,
          pageSize: PAGE_SIZE,
        });

        if (cancelled) {
          return;
        }

        const nextItems = dedupeFeedItems(response.results);
        const nextCachedEntry = replaceFeedCacheEntry(cacheKey, nextItems, response.next ? 2 : null);
        impressionIdsRef.current = { ...nextCachedEntry.impressionIds };
        seenImpressionsRef.current = new Set(nextCachedEntry.seenImpressionIds);
        sessionKeyRef.current = nextCachedEntry.sessionKey;
        setItems(nextItems);
        setNextPage(nextCachedEntry.nextPage);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load the home feed right now.');
          setItems([]);
          setNextPage(null);
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadFirstPage();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, cacheKey, cachedEntry.items, cachedEntry.nextPage, reloadToken, selectedCity]);

  const normalizedQuery = normalizeSearchText(searchQuery);
  const filteredItems = items.filter((item) => {
    if (selectedVenueTypes.length > 0 && !selectedVenueTypes.includes(item.venue_type)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      item.business_name,
      item.title,
      item.summary,
      item.body,
      item.city_label,
      item.venue_type_label,
    ].join(' ').toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  useEffect(() => {
    onVisibleCountChange?.(filteredItems.length);
  }, [filteredItems.length, onVisibleCountChange]);

  async function handleRefresh() {
    setRefreshing(true);
    setErrorMessage(null);

    try {
      const response = await fetchHomeFeed(apiBaseUrl, {
        city: selectedCity,
        page: 1,
        pageSize: PAGE_SIZE,
      });
      const nextItems = dedupeFeedItems(response.results);
      const nextCachedEntry = replaceFeedCacheEntry(cacheKey, nextItems, response.next ? 2 : null);
      impressionIdsRef.current = { ...nextCachedEntry.impressionIds };
      seenImpressionsRef.current = new Set(nextCachedEntry.seenImpressionIds);
      sessionKeyRef.current = nextCachedEntry.sessionKey;
      setItems(nextItems);
      setNextPage(nextCachedEntry.nextPage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh the home feed right now.');
    } finally {
      setRefreshing(false);
      setInitialLoading(false);
    }
  }

  async function handleLoadMore() {
    if (loadingMore || nextPage === null || initialLoading || refreshing) {
      return;
    }

    setLoadingMore(true);
    try {
      const response = await fetchHomeFeed(apiBaseUrl, {
        city: selectedCity,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });

      setItems((currentItems) => {
        const nextItems = dedupeFeedItems([...currentItems, ...response.results]);
        const resolvedNextPage = response.next ? nextPage + 1 : null;
        const currentCacheEntry = getOrCreateFeedCacheEntry(cacheKey);
        feedCache.set(cacheKey, {
          ...currentCacheEntry,
          items: nextItems,
          nextPage: resolvedNextPage,
        });
        setNextPage(resolvedNextPage);
        return nextItems;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load more feed items right now.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function handlePressItem(item: FeedItem, index: number) {
    if (!item.cta_url) {
      return;
    }

    void recordFeedEngagement(apiBaseUrlRef.current, {
      campaign: item.campaign_id,
      destination_url: item.cta_url,
      event_type: 'click',
      feed_item_id: item.id,
      impression: impressionIdsRef.current[item.id],
      page_number: 1,
      position: index,
      post: item.post_id,
      session_key: sessionKeyRef.current,
    }).catch(() => undefined);

    await Linking.openURL(item.cta_url);
  }

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken<FeedItem>> }) => {
    viewableItems.forEach((token) => {
      const item = token.item;
      if (!token.isViewable || !item || seenImpressionsRef.current.has(item.id)) {
        return;
      }

      seenImpressionsRef.current.add(item.id);
      const currentCacheEntry = getOrCreateFeedCacheEntry(cacheKey);
      currentCacheEntry.seenImpressionIds.add(item.id);
      void recordFeedImpression(apiBaseUrlRef.current, {
        campaign: item.campaign_id,
        feed_item_id: item.id,
        page_number: 1,
        placement_type: item.is_sponsored ? 'sponsored' : 'organic',
        position: token.index ?? 0,
        post: item.post_id,
        request_id: `${item.id}-${token.index ?? 0}`,
        session_key: sessionKeyRef.current,
      }).then((response) => {
        impressionIdsRef.current[item.id] = response.id;
        const nextCacheEntry = getOrCreateFeedCacheEntry(cacheKey);
        nextCacheEntry.impressionIds[item.id] = response.id;
      }).catch(() => undefined);
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const feedHeader = showFeedHeader ? (
    <Animated.View style={[styles.homeFeedHeaderWrap, feedAnimatedStyle]}>
      <View style={[styles.homeFeedHeader, headerHorizontalPadding ? { paddingHorizontal: headerHorizontalPadding } : null]}>
        <Text style={styles.homeFeedEyebrow}>Home Feed</Text>
        <Text style={styles.homeFeedTitle}>What local businesses are posting right now</Text>
        <Text style={styles.homeFeedSubtitle}>Specials, updates, events, stories, and boosted posts are blended into one scrollable feed.</Text>
      </View>
    </Animated.View>
  ) : null;

  const listHeader = (
    <>
      {headerContent}
      {feedHeader}
    </>
  );

  const listFooter = (
    <>
      {loadingMore ? (
        <View style={styles.homeFeedFooterLoading}>
          <ActivityIndicator color="#c65d1f" size="small" />
          <Text style={styles.homeFeedFooterText}>Loading more stories...</Text>
        </View>
      ) : <View style={styles.homeFeedFooterSpacer} />}
      {footerContent}
    </>
  );

  const listEmpty = initialLoading ? (
    <Animated.View style={[styles.homeFeedLoadingState, feedAnimatedStyle]}>
      <ActivityIndicator color="#c65d1f" size="large" />
      <Text style={styles.homeFeedLoadingText}>Loading your local feed...</Text>
    </Animated.View>
  ) : (
    <Animated.View style={[styles.homeFeedEmptyState, feedAnimatedStyle]}>
      <Text style={styles.homeFeedEmptyTitle}>No feed posts yet</Text>
      <Text style={styles.homeFeedEmptyText}>When local businesses publish specials, announcements, events, or blog posts, they will land here.</Text>
    </Animated.View>
  );

  return (
    <FlatList
      contentContainerStyle={styles.homeFeedListContent}
      data={filteredItems}
      key={isLandscape ? 'home-feed-landscape' : 'home-feed-portrait'}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      ListHeaderComponent={listHeader}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.45}
      onRefresh={() => void handleRefresh()}
      onViewableItemsChanged={onViewableItemsChanged}
      progressViewOffset={refreshProgressViewOffset}
      refreshing={refreshing}
      renderItem={({ item, index }) => (
        <Animated.View style={feedAnimatedStyle}>
          <HomeFeedCard
            isLandscape={isLandscape}
            item={item}
            onPress={() => void handlePressItem(item, index)}
          />
        </Animated.View>
      )}
      showsVerticalScrollIndicator={false}
      viewabilityConfig={viewabilityConfig}
    />
  );
}