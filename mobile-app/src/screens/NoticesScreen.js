import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { getApiBaseURL } from '../api/axios';
import ScreenContainer from '../components/ScreenContainer';

function NoticesScreen() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchNotices = useCallback(async () => {
    setError('');

    try {
      const response = await api.get('/notices');
      setNotices(response.data || []);
    } catch (fetchError) {
      setError('Unable to load notices. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotices();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1e2a45" />
      </View>
    );
  }

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="notifications" size={24} color="#b45309" />
          </View>
          <Text style={styles.title}>Notices</Text>
          <Text style={styles.subtitle}>Latest announcements from Dhaka Club</Text>
        </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.list}>
        {notices.length ? (
          notices.map((notice) => (
            <View key={notice.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.noticeIcon}>
                  <Ionicons name="megaphone" size={19} color="#1d4ed8" />
                </View>
                <View style={styles.cardTitleBlock}>
                  <Text style={styles.cardTitle}>{notice.title}</Text>
                  <Text style={styles.meta}>{formatDate(notice.created_at)}</Text>
                </View>
                <Text style={styles.badge}>
                  {notice.target_group || 'All Members'}
                </Text>
              </View>
              <Text style={styles.body}>{notice.body}</Text>
              {notice.attachment_url ? (
                <Pressable onPress={() => openAttachment(notice.attachment_url)} style={styles.attachmentButton}>
                  <Ionicons name="attach" size={17} color="#1d4ed8" />
                  <Text style={styles.attachmentText}>Open Attachment</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No notices found.</Text>
        )}
      </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function openAttachment(path) {
  Linking.openURL(buildFileUrl(path)).catch(() => {});
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

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  body: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  attachmentButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  attachmentText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
  },
  content: {
    padding: 18,
    paddingBottom: 84,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 15,
    textAlign: 'center',
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
  list: {
    gap: 14,
    marginTop: 18,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    flex: 1,
    justifyContent: 'center',
  },
  meta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 14,
  },
  screen: {
    backgroundColor: '#f5f7fb',
    flex: 1,
  },
  hero: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    marginBottom: 12,
    width: 48,
  },
  noticeIcon: {
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 15,
    marginTop: 6,
  },
  title: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
});

export default NoticesScreen;
