import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api, { getApiBaseURL } from '../api/axios';
import { getMemberSocket } from '../api/socket';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme/colors';

const categories = ['All', 'Notices', 'Events', 'Bookings', 'Membership', 'Community', 'Emergency', 'General'];

const categoryIcons = {
  Notices: 'megaphone',
  Events: 'calendar',
  Bookings: 'business',
  Membership: 'card',
  Community: 'people',
  Emergency: 'warning',
  General: 'notifications',
};

function UpdatesScreen({ navigation }) {
  const [updates, setUpdates] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchUpdates = useCallback(async () => {
    setError('');
    try {
      const response = await api.get('/member/updates');
      setUpdates(response.data || []);
    } catch (fetchError) {
      setError('Unable to load club updates right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUpdates();
      let socketRef;

      getMemberSocket().then((socket) => {
        if (!socket) {
          return;
        }

        socketRef = socket;
        socket.on('updates:new', fetchUpdates);
        socket.on('updates:changed', fetchUpdates);
      });

      return () => {
        socketRef?.off('updates:new', fetchUpdates);
        socketRef?.off('updates:changed', fetchUpdates);
      };
    }, [fetchUpdates]),
  );

  const unreadCount = updates.filter((update) => !update.is_read).length;
  const visibleUpdates = useMemo(() => {
    const query = search.trim().toLowerCase();

    return updates.filter((update) => {
      const categoryMatch = activeCategory === 'All' || update.category === activeCategory;
      const searchMatch =
        !query ||
        `${update.title} ${update.body} ${update.category} ${update.priority}`
          .toLowerCase()
          .includes(query);

      return categoryMatch && searchMatch;
    });
  }, [activeCategory, search, updates]);

  const markAllRead = async () => {
    try {
      await api.put('/member/updates/read-all');
      setUpdates((current) => current.map((update) => ({ ...update, is_read: true })));
      DeviceEventEmitter.emit('updatesBadgeShouldRefresh');
    } catch (markError) {
      setError('Unable to mark all updates as read.');
    }
  };

  const openUpdate = async (update) => {
    if (!update.is_read) {
      setUpdates((current) =>
        current.map((item) => (item.id === update.id ? { ...item, is_read: true } : item)),
      );
      api.put(`/member/updates/read/${update.id}`).catch(() => {});
      DeviceEventEmitter.emit('updatesBadgeShouldRefresh');
    }

    navigation.navigate('UpdateDetails', { update: { ...update, is_read: true } });
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchUpdates();
  };

  if (loading) {
    return (
      <ScreenContainer style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.midnight} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[colors.midnight, colors.navy, '#304a73']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.goldLine} />
          <Text style={styles.eyebrow}>Private Communications</Text>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.headerTitle}>Club Updates</Text>
              <Text style={styles.headerSubtitle}>
                {unreadCount ? `${unreadCount} New` : 'All caught up'}
              </Text>
            </View>
            <View style={styles.bellCircle}>
              <Ionicons name="notifications" size={28} color={colors.champagne} />
              {unreadCount ? <View style={styles.headerBadge} /> : null}
            </View>
          </View>
        </LinearGradient>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#64748b" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search updates"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {categories.map((category) => (
            <Pressable
              key={category}
              onPress={() => setActiveCategory(category)}
              style={[
                styles.categoryPill,
                activeCategory === category && styles.categoryPillActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  activeCategory === category && styles.categoryTextActive,
                ]}
              >
                {category}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Messages</Text>
          {unreadCount ? (
            <Pressable onPress={markAllRead}>
              <Text style={styles.markReadText}>Mark all read</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.list}>
          {visibleUpdates.length ? (
            visibleUpdates.map((update) => (
              <UpdateCard key={update.id} update={update} onPress={() => openUpdate(update)} />
            ))
          ) : (
            <EmptyState />
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function UpdateCard({ update, onPress }) {
  const priority = normalizePriority(update.priority);
  const isCritical = priority === 'Critical';
  const icon = categoryIcons[update.category] || 'notifications';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isCritical && styles.criticalCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.cardIcon, isCritical && styles.criticalIcon]}>
        <Ionicons name={icon} size={21} color={isCritical ? '#b91c1c' : colors.midnight} />
      </View>
      {isImageAttachment(update.attachment_url) ? (
        <Image
          source={{ uri: buildFileUrl(update.attachment_url) }}
          style={styles.cardThumbnail}
        />
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.categoryLabel}>[{update.category || 'General'}]</Text>
          <PriorityBadge priority={priority} />
        </View>
        <Text style={styles.cardTitle}>{update.title}</Text>
        <Text style={styles.preview} numberOfLines={2}>
          {update.preview || update.body}
        </Text>
        <Text style={styles.dateText}>{timeAgo(update.sent_at)}</Text>
      </View>
      {!update.is_read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

function PriorityBadge({ priority }) {
  const styleMap = {
    Normal: styles.normalBadge,
    Important: styles.importantBadge,
    Critical: styles.urgentBadge,
  };

  return (
    <Text style={[styles.priorityBadge, styleMap[priority]]}>
      {priority === 'Critical' ? 'Urgent' : priority}
    </Text>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name="notifications-outline" size={34} color={colors.champagne} />
      </View>
      <Text style={styles.emptyTitle}>No Updates Available</Text>
      <Text style={styles.emptyText}>Club communication will appear here.</Text>
    </View>
  );
}

function normalizePriority(value) {
  return value === 'Critical' ? 'Critical' : value === 'Important' ? 'Important' : 'Normal';
}

function timeAgo(value) {
  if (!value) {
    return '';
  }

  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(Math.floor(diff / 60000), 0);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} Minutes Ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} Hours Ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} Days Ago`;

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function buildFileUrl(path) {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${getApiBaseURL().replace(/\/api\/?$/, '')}${path}`;
}

function isImageAttachment(path) {
  return /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(String(path || '').split('?')[0]);
}

const styles = StyleSheet.create({
  bellCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(248,213,126,0.38)',
    borderRadius: 18,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 13,
    padding: 15,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  cardBody: {
    flex: 1,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: '#fff1c2',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  cardThumbnail: {
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    height: 64,
    width: 64,
  },
  cardPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 5,
  },
  cardTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryLabel: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '900',
  },
  categoryPill: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  categoryPillActive: {
    backgroundColor: colors.midnight,
    borderColor: colors.midnight,
  },
  categoryRow: {
    gap: 9,
    paddingVertical: 16,
  },
  categoryText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#ffffff',
  },
  content: {
    padding: 18,
    paddingBottom: 92,
  },
  criticalCard: {
    backgroundColor: '#fff7f7',
    borderColor: '#fecaca',
  },
  criticalIcon: {
    backgroundColor: '#fee2e2',
  },
  dateText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 9,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    padding: 28,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.midnight,
    borderRadius: 20,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 16,
  },
  errorText: {
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    color: '#b91c1c',
    fontSize: 14,
    marginTop: 14,
    padding: 12,
  },
  eyebrow: {
    color: colors.champagne,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  goldLine: {
    backgroundColor: colors.champagne,
    borderRadius: 999,
    height: 5,
    opacity: 0.9,
    position: 'absolute',
    right: 24,
    top: 20,
    width: 86,
  },
  header: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: 20,
  },
  headerBadge: {
    backgroundColor: '#dc2626',
    borderColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 2,
    height: 13,
    position: 'absolute',
    right: 11,
    top: 11,
    width: 13,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  headerSubtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 5,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
  },
  importantBadge: {
    backgroundColor: '#fff7ed',
    color: '#c2410c',
  },
  list: {
    gap: 13,
    marginTop: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: colors.porcelain,
    flex: 1,
    justifyContent: 'center',
  },
  markReadText: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '900',
  },
  normalBadge: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },
  preview: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  priorityBadge: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  screen: {
    backgroundColor: colors.porcelain,
    flex: 1,
  },
  searchInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
  },
  unreadDot: {
    backgroundColor: '#dc2626',
    borderRadius: 999,
    height: 10,
    position: 'absolute',
    right: 14,
    top: 14,
    width: 10,
  },
  urgentBadge: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
});

export default UpdatesScreen;
