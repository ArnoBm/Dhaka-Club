import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api, { getApiBaseURL } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import ScreenContainer from '../components/ScreenContainer';

function HomeScreen() {
  const { member } = useAuth();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [dashboard, setDashboard] = useState({
    notices: [],
    events: [],
    eventSectionTitle: 'Upcoming Events',
    auctions: [],
    communityRequests: [],
    updates: [],
  });

  const fetchDashboard = useCallback(async () => {
    setError('');

    try {
      const [
        noticesResponse,
        eventsResponse,
        auctionsResponse,
        communityResponse,
        updatesResponse,
      ] =
        await Promise.all([
          api.get('/notices'),
          api.get('/events'),
          api.get('/auctions', { params: { status: 'Active' } }),
          api.get('/community', { params: { status: 'Open' } }),
          api.get('/member/updates').catch(() => ({ data: [] })),
        ]);
      const allEvents = eventsResponse.data || [];
      const ongoingEvents = allEvents.filter(
        (event) => normalizeStatus(event.status) === 'ongoing'
      );
      const upcomingEvents = allEvents.filter(
        (event) => normalizeStatus(event.status) === 'upcoming'
      );
      const shouldShowOngoing = ongoingEvents.length > 0;

      setDashboard({
        notices: noticesResponse.data || [],
        events: shouldShowOngoing ? ongoingEvents : upcomingEvents,
        eventSectionTitle: shouldShowOngoing ? 'Current Events' : 'Upcoming Events',
        auctions: auctionsResponse.data || [],
        communityRequests: communityResponse.data || [],
        updates: updatesResponse.data || [],
      });
    } catch (fetchError) {
      setError('Unable to load dashboard right now. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [fetchDashboard])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e2a45" />
      </View>
    );
  }

  const expiryInfo = getExpiryInfo(member?.membership_expiry);

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.midnight, colors.navy, '#263f68']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.goldCornerStrip} />
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.eyebrow}>Dhaka Club</Text>
              <Text style={styles.greeting}>Welcome, {member?.full_name || 'Member'}</Text>
              <Text style={styles.memberId}>{member?.member_id || ''}</Text>
            </View>
          </View>
          <View style={styles.heroStats}>
            <HeroStat
              icon="notifications"
              label="Notices"
              value={dashboard.notices.length}
              tone="amber"
            />
            <HeroStat
              icon="calendar"
              label={dashboard.eventSectionTitle === 'Current Events' ? 'Current' : 'Upcoming'}
              value={dashboard.events.length}
              tone="blue"
            />
            <HeroStat
              icon="people"
              label="Support"
              value={dashboard.communityRequests.length}
              tone="green"
            />
          </View>
        </LinearGradient>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Latest Club Updates</Text>
        <Pressable onPress={() => navigation.navigate('Updates')}>
          <Text style={styles.seeAllText}>See All</Text>
        </Pressable>
      </View>
      <View style={styles.sectionBody}>
        {dashboard.updates.slice(0, 3).length ? (
          dashboard.updates.slice(0, 3).map((update) => (
            <MiniCard
              key={update.id}
              icon={update.priority === 'Critical' ? 'warning' : 'notifications'}
              accent={update.priority === 'Critical' ? 'urgent' : 'notice'}
              title={update.title}
              meta={`${update.category || 'General'} - ${formatDate(update.sent_at)}`}
              onPress={() => navigation.navigate('Updates')}
            />
          ))
        ) : (
          <EmptyText>No club updates available.</EmptyText>
        )}
      </View>

      <Section title="Latest Notices">
        {dashboard.notices.slice(0, 3).length ? (
          dashboard.notices.slice(0, 3).map((notice) => (
            <MiniCard
              key={notice.id}
              icon="notifications"
              accent="notice"
              title={notice.title}
              meta={formatDate(notice.created_at)}
              onPress={() =>
                setSelectedItem({
                  type: 'Notice',
                  title: notice.title,
                  meta: formatDate(notice.created_at),
                  body: notice.body || 'No details available.',
                })
              }
            />
          ))
        ) : (
          <EmptyText>No notices available.</EmptyText>
        )}
      </Section>

      <Section title={dashboard.eventSectionTitle}>
        {getVisibleHomeEvents(dashboard).length ? (
          getVisibleHomeEvents(dashboard).map((event) => (
            <MiniCard
              key={event.id}
              icon="calendar"
              accent="event"
              title={event.title}
              meta={`${formatDateTime(event.event_date)} - ${event.venue}`}
              onPress={() =>
                setSelectedItem({
                  type: 'Event',
                  title: event.title,
                  meta: `${formatDateTime(event.event_date)} - ${event.venue}`,
                  body: event.description || 'No event details available.',
                  cover_image: event.cover_image,
                  extra: getEventPriceText(event),
                })
              }
            />
          ))
        ) : (
          <EmptyText>No upcoming events.</EmptyText>
        )}
      </Section>

      <Pressable
        onPress={() => navigation.navigate('Auctions')}
        style={({ pressed }) => [styles.auctionBanner, pressed && styles.tilePressed]}
      >
        <View style={styles.bannerIcon}>
          <Ionicons name="pricetag" size={22} color="#ffffff" />
        </View>
        <Text style={styles.auctionText}>
          {dashboard.auctions.length} items up for auction
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#ffffff" />
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('Community')}
        style={({ pressed }) => [styles.communityButton, pressed && styles.tilePressed]}
      >
        <View style={styles.communityIcon}>
          <Ionicons name="heart" size={21} color="#047857" />
        </View>
        <Text style={styles.communityText}>
          Community Requests: {dashboard.communityRequests.length} Open
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#047857" />
      </Pressable>

      <View style={[styles.membershipCard, expiryInfo.expiring && styles.expiringCard]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.sectionTitle}>Membership Status</Text>
          {expiryInfo.expiring ? (
            <Text style={styles.expiringBadge}>Expiring Soon</Text>
          ) : (
            <Text style={styles.activeBadge}>Active</Text>
          )}
        </View>
        <View style={styles.infoGrid}>
          <InfoItem label="Type" value={member?.member_type || '-'} />
          <InfoItem label="Group" value={member?.membership_group || '-'} />
          <InfoItem
            label="Expiry"
            value={formatDate(member?.membership_expiry)}
            danger={expiryInfo.expiring}
          />
        </View>
      </View>
      </ScrollView>

      <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </ScreenContainer>
  );
}

function InfoItem({ label, value, danger }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, danger && styles.dangerText]}>{value}</Text>
    </View>
  );
}

function HeroStat({ icon, label, value, tone }) {
  return (
    <View style={styles.heroStat}>
      <View style={[styles.heroStatIcon, styles[`${tone}StatIcon`]]}>
        <Ionicons
          name={icon}
          size={17}
          color={tone === 'amber' ? '#b45309' : tone === 'green' ? '#047857' : '#1d4ed8'}
        />
      </View>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function MiniCard({ title, meta, icon, accent, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniCard,
        pressed ? styles.miniCardPressed : null,
      ]}
    >
      <View style={[styles.miniIcon, accent === 'event' ? styles.eventIcon : accent === 'urgent' ? styles.urgentIcon : styles.noticeIcon]}>
        <Ionicons
          name={icon}
          size={20}
          color={accent === 'event' ? '#1d4ed8' : accent === 'urgent' ? '#b91c1c' : '#b45309'}
        />
      </View>
      <View style={styles.miniCardContent}>
        <Text style={styles.miniCardTitle}>{title}</Text>
        <Text style={styles.miniCardMeta}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}

function DetailModal({ item, onClose }) {
  if (!item) {
    return null;
  }

  const isEvent = item.type === 'Event';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={[styles.miniIcon, isEvent ? styles.eventIcon : styles.noticeIcon]}>
              <Ionicons
                name={isEvent ? 'calendar' : 'notifications'}
                size={22}
                color={isEvent ? '#1d4ed8' : '#b45309'}
              />
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#475569" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {item.cover_image ? (
              <Image
                source={{ uri: buildAssetUrl(item.cover_image) }}
                style={styles.modalCover}
              />
            ) : null}
            <Text style={styles.modalType}>{item.type}</Text>
            <Text style={styles.modalTitle}>{item.title}</Text>
            <Text style={styles.modalMeta}>{item.meta}</Text>
            {item.extra ? <Text style={styles.modalExtra}>{item.extra}</Text> : null}
            <Text style={styles.modalBody}>{item.body}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EmptyText({ children }) {
  return <Text style={styles.emptyText}>{children}</Text>;
}

function buildAssetUrl(path) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${getApiBaseURL().replace(/\/api\/?$/, '')}${path}`;
}

function getEventPriceText(event) {
  const variants = (event?.ticket_variants || []).filter((variant) => variant.is_active !== false);

  if (!variants.length) {
    return Number(event?.ticket_price || 0) > 0
      ? `Ticket Price: BDT ${event.ticket_price}`
      : 'Ticket Price: Free';
  }

  const variantText = variants
    .map((variant) => `${variant.name}: BDT ${Number(variant.price || 0)}`)
    .join('\n');

  return `Ticket Options:\n${variantText}`;
}

function getExpiryInfo(value) {
  if (!value) {
    return { expiring: false };
  }

  const today = new Date();
  const expiryDate = new Date(value);
  const difference = expiryDate.getTime() - today.getTime();
  const days = Math.ceil(difference / (1000 * 60 * 60 * 24));

  return {
    expiring: days >= 0 && days <= 30,
  };
}

function getVisibleHomeEvents(dashboard) {
  if (dashboard.eventSectionTitle === 'Current Events') {
    return dashboard.events.slice(0, 1);
  }

  return dashboard.events.slice(0, 3);
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  activeBadge: {
    backgroundColor: colors.emeraldSoft,
    borderRadius: 999,
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  auctionBanner: {
    alignItems: 'center',
    backgroundColor: '#51308f',
    borderRadius: 20,
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    padding: 16,
  },
  auctionText: {
    color: '#ffffff',
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  amberStatIcon: {
    backgroundColor: '#fff1c2',
  },
  bannerIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  blueStatIcon: {
    backgroundColor: colors.blueSoft,
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  communityButton: {
    alignItems: 'center',
    backgroundColor: '#eefaf4',
    borderColor: '#b9ead5',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    padding: 16,
  },
  communityIcon: {
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  communityText: {
    color: '#047857',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  content: {
    padding: 18,
    paddingBottom: 86,
  },
  dangerText: {
    color: '#b91c1c',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    paddingVertical: 10,
  },
  errorText: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    padding: 12,
  },
  expiringBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  expiringCard: {
    borderColor: '#fecaca',
  },
  eyebrow: {
    color: colors.champagne,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  greeting: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 6,
  },
  greenStatIcon: {
    backgroundColor: colors.emeraldSoft,
  },
  header: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: 20,
  },
  headerTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroStat: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(248, 213, 126, 0.34)',
    borderWidth: 1,
    borderRadius: 16,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 11,
  },
  heroStatIcon: {
    alignItems: 'center',
    borderRadius: 10,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  heroStatLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    includeFontPadding: false,
    marginTop: 2,
    width: '100%',
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  heroStatValue: {
    color: '#0f172a',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 9,
  },
  infoGrid: {
    gap: 12,
    marginTop: 18,
  },
  infoItem: {
    backgroundColor: colors.ivory,
    borderRadius: 12,
    padding: 12,
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    flex: 1,
    justifyContent: 'center',
  },
  memberId: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  membershipCard: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    marginTop: 22,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  miniCard: {
    alignItems: 'flex-start',
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    elevation: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 15,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  miniCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  miniCardContent: {
    flex: 1,
  },
  miniCardMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 6,
  },
  miniCardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },
  miniIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  eventIcon: {
    backgroundColor: colors.blueSoft,
  },
  noticeIcon: {
    backgroundColor: '#fff1c2',
  },
  urgentIcon: {
    backgroundColor: '#fee2e2',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  modalBody: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 18,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '82%',
    padding: 20,
    width: '90%',
  },
  modalCover: {
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    height: 180,
    marginBottom: 14,
    width: '100%',
  },
  modalExtra: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 14,
    padding: 12,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalMeta: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 6,
  },
  modalType: {
    color: '#1e2a45',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  screen: {
    backgroundColor: colors.porcelain,
    flex: 1,
  },
  section: {
    marginTop: 22,
  },
  sectionBody: {
    gap: 12,
    marginTop: 12,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  seeAllText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '900',
  },
  tilePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  goldCornerStrip: {
    backgroundColor: colors.champagne,
    height: 7,
    opacity: 0.86,
    position: 'absolute',
    right: -28,
    top: 22,
    transform: [{ rotate: '36deg' }],
    width: 128,
  },
});

export default HomeScreen;
