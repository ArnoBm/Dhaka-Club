import { useCallback, useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import ScreenContainer from '../components/ScreenContainer';

const requestTypes = [
  { label: 'Blood Donate Request', value: 'Blood' },
  { label: 'Fund Collection Request', value: 'Fund Collection' },
  { label: 'Medical Help', value: 'Medical Help' },
  { label: 'Other', value: 'Other' },
];

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const statusFilters = ['Open', 'Fulfilled', 'Closed', 'All'];

const initialForm = {
  request_type: 'Blood',
  blood_group_needed: '',
  description: '',
  contact_number: '',
  location: '',
};

function CommunityScreen() {
  const { member } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('Open');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    ...initialForm,
    contact_number: member?.phone || '',
  });

  const fetchRequests = useCallback(async () => {
    setError('');

    try {
      const response = await api.get('/community', {
        params: statusFilter === 'All' ? {} : { status: statusFilter },
      });
      setRequests(response.data || []);
    } catch (fetchError) {
      setError('Unable to load community requests. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const openRequestModal = (type) => {
    setForm({
      ...initialForm,
      request_type: type,
      contact_number: member?.phone || '',
    });
    setModalOpen(true);
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitRequest = async () => {
    if (!form.description.trim()) {
      Alert.alert('Required', 'Please write a short description.');
      return;
    }

    if (!form.contact_number.trim()) {
      Alert.alert('Required', 'Please add a contact number.');
      return;
    }

    if (!form.location.trim()) {
      Alert.alert('Required', 'Please add a location.');
      return;
    }

    if (form.request_type === 'Blood' && !form.blood_group_needed) {
      Alert.alert('Required', 'Please select the blood group needed.');
      return;
    }

    setSaving(true);

    try {
      await api.post('/community', {
        member_id: member?.id,
        request_type: form.request_type,
        blood_group_needed:
          form.request_type === 'Blood' ? form.blood_group_needed : null,
        description: form.description.trim(),
        contact_number: form.contact_number.trim(),
        location: form.location.trim(),
      });

      setModalOpen(false);
      setStatusFilter('Open');
      Alert.alert('Success', 'Your community request has been posted.');
      fetchRequests();
    } catch (submitError) {
      Alert.alert(
        'Failed',
        submitError.response?.data?.message ||
          'Unable to submit request. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

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
          colors={[colors.midnight, colors.navy, '#214c61']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pageHero}
        >
          <Text style={styles.heroEyebrow}>Member Network</Text>
          <Text style={styles.heroTitle}>Community</Text>
          <Text style={styles.heroSubtitle}>
            Trusted support from Dhaka Club members, when it matters.
          </Text>
        </LinearGradient>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actionGrid}>
          <Pressable
            onPress={() => openRequestModal('Blood')}
            style={[styles.actionCard, styles.bloodAction]}
          >
            <Text style={styles.actionTitle}>Blood Donate Request</Text>
            <Text style={styles.actionText}>Find donors by blood group.</Text>
          </Pressable>
          <Pressable
            onPress={() => openRequestModal('Fund Collection')}
            style={[styles.actionCard, styles.fundAction]}
          >
            <Text style={styles.actionTitle}>Fund Collection Request</Text>
            <Text style={styles.actionText}>Ask members for financial support.</Text>
          </Pressable>
        </View>

        <View style={styles.statusTabs}>
          {statusFilters.map((status) => (
            <Pressable
              key={status}
              onPress={() => setStatusFilter(status)}
              style={[
                styles.statusTab,
                statusFilter === status && styles.statusTabActive,
              ]}
            >
              <Text
                style={[
                  styles.statusTabText,
                  statusFilter === status && styles.statusTabTextActive,
                ]}
              >
                {status}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          {statusFilter === 'All' ? 'Community Requests' : `${statusFilter} Requests`}
        </Text>
        <View style={styles.list}>
          {loading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator size="small" color="#1e2a45" />
              <Text style={styles.inlineLoadingText}>Loading requests...</Text>
            </View>
          ) : requests.length ? (
            requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))
          ) : (
            <Text style={styles.emptyText}>
              No {statusFilter === 'All' ? '' : statusFilter.toLowerCase()} community requests.
            </Text>
          )}
        </View>
      </ScrollView>

      <RequestModal
        visible={modalOpen}
        form={form}
        saving={saving}
        onChange={updateForm}
        onClose={() => setModalOpen(false)}
        onSubmit={submitRequest}
      />
    </ScreenContainer>
  );
}

function RequestModal({ visible, form, saving, onChange, onClose, onSubmit }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>Create Request</Text>

              <Text style={styles.inputLabel}>Request Type</Text>
              <View style={styles.optionWrap}>
                {requestTypes.map((type) => (
                  <Pressable
                    key={type.value}
                    onPress={() => onChange('request_type', type.value)}
                    style={[
                      styles.optionButton,
                      form.request_type === type.value && styles.optionButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        form.request_type === type.value && styles.optionTextActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {form.request_type === 'Blood' ? (
                <>
                  <Text style={styles.inputLabel}>Blood Group Needed</Text>
                  <View style={styles.optionWrap}>
                    {bloodGroups.map((group) => (
                      <Pressable
                        key={group}
                        onPress={() => onChange('blood_group_needed', group)}
                        style={[
                          styles.bloodOption,
                          form.blood_group_needed === group && styles.bloodOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bloodOptionText,
                            form.blood_group_needed === group &&
                              styles.bloodOptionTextActive,
                          ]}
                        >
                          {group}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <TextInputField
                label="Description"
                value={form.description}
                onChangeText={(value) => onChange('description', value)}
                placeholder={
                  form.request_type === 'Fund Collection'
                    ? 'Mention reason, needed amount, and deadline'
                    : 'Write the details'
                }
                multiline
              />
              <TextInputField
                label="Contact Number"
                value={form.contact_number}
                onChangeText={(value) => onChange('contact_number', value)}
                keyboardType="phone-pad"
              />
              <TextInputField
                label="Location"
                value={form.location}
                onChangeText={(value) => onChange('location', value)}
                placeholder="Area / hospital / meeting point"
              />

              <View style={styles.modalActions}>
                <Pressable disabled={saving} onPress={onClose} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable disabled={saving} onPress={onSubmit} style={styles.primaryButton}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Post Request</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TextInputField({ label, multiline, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.textArea]}
        placeholderTextColor="#94a3b8"
      />
    </View>
  );
}

function RequestCard({ request }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{request.requester_full_name}</Text>
          <Text style={styles.cardMeta}>
            {request.requester_member_id || `Member #${request.member_id}`}
          </Text>
        </View>
        <Text style={[styles.typeBadge, getTypeStyle(request.request_type)]}>
          {request.request_type}
        </Text>
      </View>
      <Text style={[styles.requestStatusBadge, getStatusStyle(request.status)]}>
        {request.status}
      </Text>

      {request.request_type === 'Blood' && request.blood_group_needed ? (
        <View style={styles.bloodBox}>
          <Text style={styles.bloodLabel}>Blood Group Needed</Text>
          <Text style={styles.bloodValue}>{request.blood_group_needed}</Text>
        </View>
      ) : null}

      <Text style={styles.description}>{request.description}</Text>

      <View style={styles.metaBox}>
        <Text style={styles.metaLine}>Phone: {request.contact_number}</Text>
        <Text style={styles.metaLine}>Location: {request.location}</Text>
      </View>
    </View>
  );
}

function getTypeStyle(type) {
  const stylesByType = {
    Blood: styles.bloodBadge,
    'Medical Help': styles.medicalBadge,
    'Fund Collection': styles.fundBadge,
    Other: styles.otherBadge,
  };

  return stylesByType[type] || styles.otherBadge;
}

function getStatusStyle(status) {
  const stylesByStatus = {
    Open: styles.openStatus,
    Fulfilled: styles.fulfilledStatus,
    Closed: styles.closedStatus,
  };

  return stylesByStatus[status] || styles.openStatus;
}

const styles = StyleSheet.create({
  actionCard: {
    borderRadius: 16,
    flex: 1,
    minHeight: 112,
    padding: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  actionText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  actionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  bloodAction: {
    backgroundColor: '#fff1f1',
    borderColor: '#fecaca',
    borderWidth: 1,
  },
  bloodBadge: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  bloodBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    marginTop: 14,
    padding: 14,
  },
  bloodLabel: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
  },
  bloodOption: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  bloodOptionActive: {
    backgroundColor: '#b91c1c',
    borderColor: '#b91c1c',
  },
  bloodOptionText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  bloodOptionTextActive: {
    color: '#ffffff',
  },
  bloodValue: {
    color: '#991b1b',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 22,
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
    justifyContent: 'space-between',
  },
  cardMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  cardTitleBlock: {
    flex: 1,
  },
  content: {
    padding: 18,
    paddingBottom: 86,
  },
  description: {
    color: '#334155',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 15,
    paddingVertical: 14,
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
  field: {
    marginTop: 14,
  },
  closedStatus: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
  fulfilledStatus: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  fundAction: {
    backgroundColor: '#eefaf4',
    borderColor: '#b9ead5',
    borderWidth: 1,
  },
  fundBadge: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  input: {
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 15,
    marginTop: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 14,
  },
  inlineLoading: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    elevation: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 18,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  inlineLoadingText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    gap: 14,
    marginTop: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    flex: 1,
    justifyContent: 'center',
  },
  medicalBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  metaBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    gap: 6,
    marginTop: 14,
    padding: 12,
  },
  metaLine: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '86%',
    padding: 20,
    width: '92%',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  modalTitle: {
    color: '#1e2a45',
    fontSize: 22,
    fontWeight: '900',
  },
  modalScrollContent: {
    paddingBottom: 14,
  },
  optionButton: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionButtonActive: {
    backgroundColor: '#1e2a45',
    borderColor: '#1e2a45',
  },
  optionText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#ffffff',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  openStatus: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  otherBadge: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1e2a45',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  requestStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  screen: {
    backgroundColor: colors.porcelain,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 22,
  },
  statusTab: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusTabActive: {
    backgroundColor: '#1e2a45',
    borderColor: '#1e2a45',
  },
  statusTabText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  statusTabTextActive: {
    color: '#ffffff',
  },
  statusTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
  },
  heroEyebrow: {
    color: colors.champagne,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: '#d9e7ff',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 6,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 5,
  },
  pageHero: {
    borderRadius: 28,
    padding: 20,
  },
  textArea: {
    minHeight: 94,
  },
  title: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
  typeBadge: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});

export default CommunityScreen;
