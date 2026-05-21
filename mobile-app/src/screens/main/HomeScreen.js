import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

function HomeScreen() {
  const { member } = useAuth();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState({
    notices: [],
    events: [],
    auctions: [],
    communityRequests: [],
  });

  const fetchDashboard = useCallback(async () => {
    setError('');

    try {
      const [noticesResponse, eventsResponse, auctionsResponse, communityResponse] =
        await Promise.all([
          api.get('/notices'),
          api.get('/events', { params: { status: 'Upcoming' } }),
          api.get('/auctions', { params: { status: 'Active' } }),
          api.get('/community', { params: { status: 'Open' } }),
        ]);

      setDashboard({
        notices: noticesResponse.data || [],
        events: eventsResponse.data || [],
        auctions: auctionsResponse.data || [],
        communityRequests: communityResponse.data || [],
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>Welcome, {member?.full_name || 'Member'}</Text>
        <Text style={styles.memberId}>{member?.member_id || ''}</Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Section title="Latest Notices">
        {dashboard.notices.slice(0, 3).length ? (
          dashboard.notices.slice(0, 3).map((notice) => (
            <MiniCard
              key={notice.id}
              title={notice.title}
              meta={formatDate(notice.created_at)}
            />
          ))
        ) : (
          <EmptyText>No notices available.</EmptyText>
        )}
      </Section>

      <Section title="Upcoming Events">
        {dashboard.events.slice(0, 3).length ? (
          dashboard.events.slice(0, 3).map((event) => (
            <MiniCard
              key={event.id}
              title={event.title}
              meta={`${formatDateTime(event.event_date)} - ${event.venue}`}
            />
          ))
        ) : (
          <EmptyText>No upcoming events.</EmptyText>
        )}
      </Section>

      <Pressable style={styles.auctionBanner}>
        <Text style={styles.auctionText}>
          {dashboard.auctions.length} items up for auction
        </Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('Community')}
        style={styles.communityButton}
      >
        <Text style={styles.communityText}>
          Community Requests: {dashboard.communityRequests.length} Open
        </Text>
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

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function MiniCard({ title, meta }) {
  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniCardTitle}>{title}</Text>
      <Text style={styles.miniCardMeta}>{meta}</Text>
    </View>
  );
}

function EmptyText({ children }) {
  return <Text style={styles.emptyText}>{children}</Text>;
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
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  auctionBanner: {
    backgroundColor: '#1e2a45',
    borderRadius: 16,
    marginTop: 16,
    padding: 18,
  },
  auctionText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  communityButton: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    padding: 16,
  },
  communityText: {
    color: '#1e40af',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    padding: 18,
    paddingBottom: 34,
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
  greeting: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '900',
  },
  header: {
    backgroundColor: '#1e2a45',
    borderRadius: 22,
    padding: 22,
  },
  infoGrid: {
    gap: 12,
    marginTop: 18,
  },
  infoItem: {
    backgroundColor: '#f8fafc',
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
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
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
    backgroundColor: '#ffffff',
    borderRadius: 14,
    elevation: 1,
    padding: 15,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
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
  screen: {
    backgroundColor: '#f8fafc',
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
    fontSize: 18,
    fontWeight: '900',
  },
});

export default HomeScreen;
