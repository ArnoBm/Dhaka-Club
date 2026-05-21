import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
import api, { getApiBaseURL } from '../api/axios';
import { colors } from '../theme/colors';
import ScreenContainer from '../components/ScreenContainer';

function AuctionsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const fetchAuctions = useCallback(async () => {
    setError('');

    try {
      const response = await api.get('/auctions', { params: { status: 'Active' } });
      setItems(response.data || []);
    } catch (fetchError) {
      setError('Unable to load auction items. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAuctions();
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#1e2a45" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Member Auctions</Text>
            <Text style={styles.title}>Auctions</Text>
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.list}>
          {items.length ? (
            items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setSelectedItem(item)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                {item.item_image ? (
                  <Image source={{ uri: buildAssetUrl(item.item_image) }} style={styles.cover} />
                ) : (
                  <View style={styles.coverPlaceholder}>
                    <Ionicons name="image-outline" size={30} color="#94a3b8" />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.status}>{item.status}</Text>
                  </View>
                  <Text style={styles.meta}>Ends {formatDateTime(item.auction_end)}</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Highest Bid</Text>
                    <Text style={styles.price}>BDT {item.highest_bid || item.current_bid || item.starting_price || 0}</Text>
                  </View>
                </View>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>No active auction items found.</Text>
          )}
        </View>
      </ScrollView>

      <AuctionDetailsModal item={selectedItem} onClose={() => setSelectedItem(null)} />
    </ScreenContainer>
  );
}

function AuctionDetailsModal({ item, onClose }) {
  if (!item) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalType}>Auction Item</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#475569" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            {item.item_image ? (
              <Image source={{ uri: buildAssetUrl(item.item_image) }} style={styles.modalCover} />
            ) : null}
            <Text style={styles.modalTitle}>{item.title}</Text>
            <View style={styles.infoBox}>
              <SummaryRow label="Starting Price" value={`BDT ${item.starting_price || 0}`} />
              <SummaryRow label="Highest Bid" value={`BDT ${item.highest_bid || item.current_bid || 0}`} />
              <SummaryRow label="Starts" value={formatDateTime(item.auction_start)} />
              <SummaryRow label="Ends" value={formatDateTime(item.auction_end)} />
            </View>
            <Text style={styles.description}>{item.description || 'No item details available.'}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
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

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 2,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  cardBody: {
    padding: 16,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  cardTitle: {
    color: '#0f172a',
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  content: {
    padding: 18,
    paddingBottom: 86,
  },
  cover: {
    backgroundColor: '#e2e8f0',
    height: 190,
    width: '100%',
  },
  coverPlaceholder: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    height: 190,
    justifyContent: 'center',
    width: '100%',
  },
  description: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 16,
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
  eyebrow: {
    color: '#b45309',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    gap: 10,
    marginTop: 16,
    padding: 14,
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
    marginTop: 8,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '84%',
    padding: 20,
    width: '92%',
  },
  modalCover: {
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    height: 210,
    marginTop: 12,
    width: '100%',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    marginTop: 14,
  },
  modalType: {
    color: '#1e2a45',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  price: {
    color: '#8a5a00',
    fontSize: 17,
    fontWeight: '900',
  },
  priceLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  priceRow: {
    backgroundColor: '#fff1c2',
    borderRadius: 12,
    marginTop: 14,
    padding: 12,
  },
  screen: {
    backgroundColor: colors.porcelain,
    flex: 1,
  },
  status: {
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: '#0f172a',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
});

export default AuctionsScreen;
