import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  DeviceEventEmitter,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import api, { getApiBaseURL } from '../api/axios';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme/colors';

function UpdateDetailsScreen({ navigation, route }) {
  const [update, setUpdate] = useState(route.params?.update || {});
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);

  const toggleRead = async () => {
    const nextRead = !update.is_read;
    setUpdate((current) => ({ ...current, is_read: nextRead }));
    await api.put(`/member/updates/read/${update.id}`, { is_read: nextRead }).catch(() => {});
    DeviceEventEmitter.emit('updatesBadgeShouldRefresh');
  };

  const toggleSave = async () => {
    const nextSaved = !update.is_saved;
    setUpdate((current) => ({ ...current, is_saved: nextSaved }));
    await api.put(`/member/updates/save/${update.id}`, { is_saved: nextSaved }).catch(() => {});
  };

  const deleteLocalCopy = async () => {
    await api.put(`/member/updates/delete/${update.id}`).catch(() => {});
    DeviceEventEmitter.emit('updatesBadgeShouldRefresh');
    navigation.goBack();
  };

  const openRelated = () => {
    const screen = relatedScreen(update.related_type || update.category);
    if (screen) {
      navigation.getParent()?.navigate(screen);
    }
  };

  const hasImageAttachment = isImageAttachment(update.attachment_url);

  return (
    <ScreenContainer style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.midnight, colors.navy, '#304a73']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color="#ffffff" />
          </Pressable>
          <Text style={styles.category}>{update.category || 'General'}</Text>
          <Text style={styles.title}>{update.title}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatDate(update.sent_at)}</Text>
            <PriorityBadge priority={update.priority} />
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.senderRow}>
            <View style={styles.senderIcon}>
              <Ionicons name="person" size={18} color={colors.midnight} />
            </View>
            <View>
              <Text style={styles.senderLabel}>Admin Sender</Text>
              <Text style={styles.senderName}>{update.sender_name || 'Dhaka Club Admin'}</Text>
            </View>
          </View>

          <Text style={styles.body}>{update.body || 'No message body available.'}</Text>

          {hasImageAttachment ? (
            <Pressable onPress={() => setImagePreviewOpen(true)}>
              <Image
                source={{ uri: buildFileUrl(update.attachment_url) }}
                style={styles.attachmentImage}
              />
            </Pressable>
          ) : null}

          <Info label="Related Section" value={update.related_type || update.category || 'General'} />
          {update.attachment_url && !hasImageAttachment ? (
            <Pressable onPress={() => openAttachment(update.attachment_url)} style={styles.attachmentButton}>
              <Ionicons name="attach" size={18} color={colors.midnight} />
              <Text style={styles.attachmentText}>Open Attachment</Text>
            </Pressable>
          ) : !update.attachment_url ? (
            <Info label="Attachment" value="No attachment" />
          ) : null}

          {relatedScreen(update.related_type || update.category) ? (
            <Pressable onPress={openRelated} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Open Related Page</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actionGrid}>
          <ActionButton
            icon={update.is_saved ? 'bookmark' : 'bookmark-outline'}
            label={update.is_saved ? 'Saved' : 'Save Message'}
            onPress={toggleSave}
          />
          <ActionButton
            icon={update.is_read ? 'mail-unread-outline' : 'mail-open-outline'}
            label={update.is_read ? 'Mark Unread' : 'Mark Read'}
            onPress={toggleRead}
          />
          <ActionButton
            danger
            icon="trash-outline"
            label="Delete Local Copy"
            onPress={deleteLocalCopy}
          />
        </View>
      </ScrollView>
      <ImagePreviewModal
        visible={imagePreviewOpen}
        imageUrl={hasImageAttachment ? buildFileUrl(update.attachment_url) : ''}
        onClose={() => setImagePreviewOpen(false)}
      />
    </ScreenContainer>
  );
}

function ImagePreviewModal({ visible, imageUrl, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.imagePreviewOverlay}>
        <Pressable onPress={onClose} style={styles.imagePreviewClose}>
          <Ionicons name="close" size={24} color="#ffffff" />
        </Pressable>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            resizeMode="contain"
            style={styles.imagePreview}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function Info({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ icon, label, onPress, danger }) {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, danger && styles.dangerAction]}>
      <Ionicons name={icon} size={19} color={danger ? '#b91c1c' : colors.midnight} />
      <Text style={[styles.actionText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

function PriorityBadge({ priority }) {
  const normalized = priority === 'Critical' ? 'Critical' : priority === 'Important' ? 'Important' : 'Normal';
  return (
    <Text style={[styles.priorityBadge, normalized === 'Critical' ? styles.criticalBadge : normalized === 'Important' ? styles.importantBadge : styles.normalBadge]}>
      {normalized === 'Critical' ? 'Urgent' : normalized}
    </Text>
  );
}

function relatedScreen(value) {
  const key = String(value || '').toLowerCase();
  if (key.includes('event')) return 'Events';
  if (key.includes('booking') || key.includes('venue')) return null;
  if (key.includes('membership') || key.includes('renewal')) return 'Profile';
  if (key.includes('community')) return 'Community';
  if (key.includes('notice')) return 'Notices';
  return null;
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

function isImageAttachment(path) {
  return /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i.test(String(path || '').split('?')[0]);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 78,
    justifyContent: 'center',
    padding: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionText: {
    color: colors.midnight,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    marginBottom: 18,
    width: 42,
  },
  body: {
    color: '#334155',
    fontSize: 16,
    lineHeight: 25,
    marginTop: 22,
  },
  attachmentButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 13,
  },
  attachmentText: {
    color: colors.midnight,
    fontSize: 15,
    fontWeight: '900',
  },
  attachmentImage: {
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    height: 220,
    marginTop: 16,
    width: '100%',
  },
  imagePreview: {
    height: '82%',
    width: '100%',
  },
  imagePreviewClose: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    marginBottom: 14,
    width: 44,
  },
  imagePreviewOverlay: {
    backgroundColor: 'rgba(0,0,0,0.92)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    marginTop: 16,
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  category: {
    color: colors.champagne,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  content: {
    padding: 18,
    paddingBottom: 92,
  },
  criticalBadge: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  dangerAction: {
    backgroundColor: '#fff7f7',
    borderColor: '#fecaca',
  },
  dangerText: {
    color: '#b91c1c',
  },
  header: {
    borderRadius: 28,
    overflow: 'hidden',
    padding: 20,
  },
  importantBadge: {
    backgroundColor: '#fff7ed',
    color: '#c2410c',
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoRow: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginTop: 12,
    padding: 13,
  },
  infoValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  meta: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  normalBadge: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.midnight,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    padding: 15,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
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
  senderIcon: {
    alignItems: 'center',
    backgroundColor: '#fff1c2',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  senderLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  senderName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  senderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
    marginTop: 8,
  },
});

export default UpdateDetailsScreen;
