import { Image, Pressable, Text, View } from 'react-native';

import { styles } from '../appStyles';
import type { FeedItem } from '../types';

type HomeFeedCardProps = {
  item: FeedItem;
  isLandscape: boolean;
  onPress: () => void;
};

function formatFeedDateLabel(item: FeedItem) {
  const sourceDate = item.starts_at ?? item.published_at ?? item.ends_at;
  if (!sourceDate) {
    return item.venue_type_label || item.city_label;
  }

  const parsedDate = new Date(sourceDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return item.venue_type_label || item.city_label;
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function BaseHomeFeedCard({
  accentStyle,
  badgeLabel,
  item,
  isLandscape,
  onPress,
}: HomeFeedCardProps & {
  badgeLabel: string;
  accentStyle?: object;
}) {
  const hasImage = item.hero_image_url.length > 0;
  const hasAction = item.cta_label.length > 0 && item.cta_url.length > 0;
  const dateLabel = formatFeedDateLabel(item);

  return (
    <Pressable
      onPress={hasAction ? onPress : undefined}
      style={({ pressed }) => [
        styles.homeFeedCard,
        isLandscape ? styles.homeFeedCardLandscape : null,
        item.is_sponsored ? styles.homeFeedCardSponsored : null,
        accentStyle,
        pressed && hasAction ? styles.homeFeedCardPressed : null,
      ]}
    >
      {item.is_sponsored ? (
        <View style={styles.homeFeedSponsoredBand}>
          <Text style={styles.homeFeedSponsoredBandText}>Sponsored</Text>
          <Text numberOfLines={1} style={styles.homeFeedSponsoredBandMeta}>{item.sponsor_label || 'Boosted business post'}</Text>
        </View>
      ) : null}

      <View style={styles.homeFeedCardHeader}>
        <View style={styles.homeFeedHeaderCopy}>
          <View style={styles.homeFeedBadgeRow}>
            <View style={[styles.homeFeedBadge, item.is_sponsored ? styles.homeFeedBadgeSponsored : null]}>
              <Text style={[styles.homeFeedBadgeText, item.is_sponsored ? styles.homeFeedBadgeTextSponsored : null]}>{badgeLabel}</Text>
            </View>
            <Text numberOfLines={1} style={styles.homeFeedBusinessName}>{item.business_name}</Text>
          </View>
          <Text style={styles.homeFeedMetaText}>{item.city_label || '805'} • {dateLabel}</Text>
        </View>
      </View>

      {hasImage ? (
        <Image source={{ uri: item.hero_image_url }} style={styles.homeFeedHeroImage} />
      ) : (
        <View style={styles.homeFeedImagePlaceholder}>
          <Text style={styles.homeFeedImagePlaceholderText}>{item.venue_type_label || 'Local business update'}</Text>
        </View>
      )}

      <Text style={styles.homeFeedCardTitle}>{item.title}</Text>

      {item.summary ? (
        <Text numberOfLines={2} style={styles.homeFeedCardSummary}>{item.summary}</Text>
      ) : null}

      {item.body ? (
        <Text numberOfLines={3} style={styles.homeFeedBodyPreview}>{item.body}</Text>
      ) : null}

      {hasAction ? (
        <View style={styles.homeFeedActionRow}>
          <Text style={styles.homeFeedActionText}>{item.cta_label}</Text>
          <Text style={styles.homeFeedActionArrow}>→</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SpecialFeedCard(props: HomeFeedCardProps) {
  return <BaseHomeFeedCard {...props} accentStyle={styles.homeFeedCardSpecial} badgeLabel="Special" />;
}

export function AnnouncementFeedCard(props: HomeFeedCardProps) {
  return <BaseHomeFeedCard {...props} accentStyle={styles.homeFeedCardAnnouncement} badgeLabel="Announcement" />;
}

export function EventFeedCard(props: HomeFeedCardProps) {
  return <BaseHomeFeedCard {...props} accentStyle={styles.homeFeedCardEvent} badgeLabel="Event" />;
}

export function BlogFeedCard(props: HomeFeedCardProps) {
  return <BaseHomeFeedCard {...props} accentStyle={styles.homeFeedCardBlog} badgeLabel="Blog" />;
}

export function SponsoredFeedCard(props: HomeFeedCardProps) {
  return <BaseHomeFeedCard {...props} accentStyle={styles.homeFeedCardSponsorAccent} badgeLabel="Boosted" />;
}

export function HomeFeedCard({ item, isLandscape, onPress }: HomeFeedCardProps) {
  switch (item.item_type) {
    case 'special':
      return <SpecialFeedCard isLandscape={isLandscape} item={item} onPress={onPress} />;
    case 'announcement':
      return <AnnouncementFeedCard isLandscape={isLandscape} item={item} onPress={onPress} />;
    case 'event':
      return <EventFeedCard isLandscape={isLandscape} item={item} onPress={onPress} />;
    case 'blog':
      return <BlogFeedCard isLandscape={isLandscape} item={item} onPress={onPress} />;
    case 'sponsored':
      return <SponsoredFeedCard isLandscape={isLandscape} item={item} onPress={onPress} />;
    default:
      return <AnnouncementFeedCard isLandscape={isLandscape} item={item} onPress={onPress} />;
  }
}