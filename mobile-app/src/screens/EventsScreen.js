import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import api, { getApiBaseURL } from '../api/axios';
import { colors } from '../theme/colors';
import ScreenContainer from '../components/ScreenContainer';

function EventsScreen() {
  const [events, setEvents] = useState([]);
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [purchaseEvent, setPurchaseEvent] = useState(null);
  const [ticketCount, setTicketCount] = useState('1');
  const [variantQuantities, setVariantQuantities] = useState({});
  const [paymentStep, setPaymentStep] = useState('details');
  const [paying, setPaying] = useState(false);
  const [selectedPass, setSelectedPass] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState('');

  const fetchEvents = useCallback(async () => {
    setError('');

    try {
      const [upcomingResponse, ongoingResponse, passesResponse] = await Promise.all([
        api.get('/events', { params: { status: 'Upcoming' } }),
        api.get('/events', { params: { status: 'Ongoing' } }),
        api.get('/events/my-passes'),
      ]);

      setEvents([...(ongoingResponse.data || []), ...(upcomingResponse.data || [])]);
      setPasses(passesResponse.data || []);
    } catch (fetchError) {
      setError('Unable to load events. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);


  const passesByEvent = useMemo(() => {
    return passes.reduce((mapped, pass) => {
      mapped[pass.event_id] = pass;
      return mapped;
    }, {});
  }, [passes]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const openPurchase = (event) => {
    const availableSeats = Number(event.available_seats || 0);
    const hasVariants = getActiveVariants(event).length > 0;
    const hasSeatVariant = getActiveVariants(event).some((variant) => Number(variant.seat_count || 0) > 0);

    if (event.status !== 'Ongoing') {
      Alert.alert('Not Open Yet', 'Ticket purchase is only available for ongoing events.');
      return;
    }

    if (availableSeats < 1 && (!hasVariants || hasSeatVariant)) {
      Alert.alert('Sold Out', 'No seats are available for this event.');
      return;
    }

    setTicketCount('1');
    setVariantQuantities(hasVariants ? {} : {});
    setPaymentStep('details');
    setPurchaseEvent(event);
  };

  const closePurchase = () => {
    if (paying) {
      return;
    }

    setPurchaseEvent(null);
    setPaymentStep('details');
    setTicketCount('1');
    setVariantQuantities({});
  };

  const goToPayment = () => {
    const variants = getActiveVariants(purchaseEvent);
    const purchase = calculatePurchase(purchaseEvent, variantQuantities, ticketCount);
    const availableSeats = Number(purchaseEvent?.available_seats || 0);

    if (variants.length && !purchase.items.length) {
      Alert.alert('Select Ticket', 'Please select at least one ticket option.');
      return;
    }

    if (variants.some((variant) => Number(variant.seat_count || 0) > 0) && purchase.seatCount < 1) {
      Alert.alert('Select Entry', 'Please select at least one entry ticket.');
      return;
    }

    if (purchase.items.filter((item) => Number(item.seat_count || 0) > 0).length > 1) {
      Alert.alert('Select One Entry', 'Please select either single or couple entry, not both.');
      return;
    }

    if (!variants.length && (!Number.isInteger(purchase.legacyCount) || purchase.legacyCount < 1)) {
      Alert.alert('Invalid Quantity', 'Please enter at least 1 ticket.');
      return;
    }

    if (purchase.seatCount > availableSeats) {
      Alert.alert('Not Available', `Only ${availableSeats} tickets are available.`);
      return;
    }

    setPaymentStep('payment');
  };

  const confirmPurchase = async () => {
    const purchase = calculatePurchase(purchaseEvent, variantQuantities, ticketCount);

    setPaying(true);

    try {
      const payload = purchase.items.length
        ? { ticket_items: purchase.items.map((item) => ({ ticket_variant_id: item.id, quantity: item.quantity })) }
        : { ticket_count: purchase.legacyCount };

      const response = await api.post(`/events/${purchaseEvent.id}/register`, payload);
      const purchasedEventId = purchaseEvent.id;

      setSelectedPass(response.data?.pass || null);
      setPurchaseEvent(null);
      setPaymentStep('details');
      setTicketCount('1');
      setVariantQuantities({});
      await fetchEvents();
      Alert.alert(
        'Success',
        response.data?.message || 'Your entry pass is ready.'
      );
    } catch (registerError) {
      const message =
        registerError.response?.data?.message ||
        'Unable to complete this request. Please try again.';
      Alert.alert('Failed', message);
    } finally {
      setPaying(false);
    }
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
        <LinearGradient
          colors={[colors.midnight, colors.navy, '#29476f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pageHero}
        >
          <View style={styles.pageHeroIcon}>
            <Text style={styles.pageHeroIconText}>E</Text>
          </View>
          <Text style={styles.heroEyebrow}>Member Experiences</Text>
          <Text style={styles.heroTitle}>Events</Text>
          <Text style={styles.heroSubtitle}>Curated gatherings, dining nights, and club occasions</Text>
        </LinearGradient>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {passes.length ? (
          <View style={styles.passStrip}>
            <Text style={styles.passStripTitle}>My Entry Passes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {passes.map((pass) => (
                <Pressable
                  key={pass.id}
                  onPress={() => setSelectedPass(pass)}
                  style={styles.passChip}
                >
                  <Text style={styles.passChipTitle} numberOfLines={1}>
                    {pass.title}
                  </Text>
                  <Text style={styles.passChipMeta}>
                    {pass.ticket_count} ticket{Number(pass.ticket_count) > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.list}>
          {events.length ? (
            events.map((event) => {
              const availableSeats = Number(event.available_seats || 0);
              const existingPass = passesByEvent[event.id];
              const hasRegistered = Boolean(existingPass);
              const priceLabel = getEventPriceLabel(event);
              const isPaid =
                hasPaidTickets(event) || Number(event.requires_ticket || 0) === 1;
              const activeVariants = getActiveVariants(event);
              const hasVariants = activeVariants.length > 0;
              const hasSeatVariant = activeVariants.some((variant) => Number(variant.seat_count || 0) > 0);
              const canRegister =
                event.status === 'Ongoing' && (availableSeats > 0 || (hasVariants && !hasSeatVariant));

              return (
                <Pressable
                  key={event.id}
                  onPress={() => setSelectedEvent(event)}
                  style={({ pressed }) => [
                    styles.card,
                    pressed ? styles.cardPressed : null,
                  ]}
                >
                  {event.cover_image ? (
                    <Image
                      source={{ uri: buildAssetUrl(event.cover_image) }}
                      style={styles.cardCover}
                    />
                  ) : null}
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{event.title}</Text>
                    <Text style={[styles.status, getStatusStyle(event.status)]}>
                      {event.status}
                    </Text>
                  </View>
                  <Text style={styles.date}>{formatDateTime(event.event_date)}</Text>
                  <Text style={styles.meta}>{event.venue}</Text>

                  <View style={styles.availableBox}>
                    <Text style={styles.statLabel}>Available Seats</Text>
                    <Text style={styles.availableValue}>{availableSeats}</Text>
                  </View>

                  <View style={styles.footerRow}>
                    <Text style={styles.price}>
                      {priceLabel}
                    </Text>
                    <Pressable
                      disabled={!existingPass && availableSeats < 1}
                      onPress={() =>
                        existingPass
                          ? setSelectedPass(existingPass)
                          : canRegister
                            ? openPurchase(event)
                            : setSelectedEvent(event)
                      }
                      style={({ pressed }) => [
                        styles.actionButton,
                        hasRegistered ? styles.passButton : null,
                        !hasRegistered && availableSeats < 1 && styles.actionButtonDisabled,
                        pressed && (hasRegistered || canRegister || availableSeats > 0)
                          ? styles.actionButtonPressed
                          : null,
                      ]}
                    >
                      <Text style={styles.actionButtonText}>
                        {existingPass
                          ? 'View Pass'
                          : availableSeats < 1
                            ? 'Sold Out'
                            : event.status !== 'Ongoing'
                              ? 'View Details'
                              : isPaid
                                ? 'Buy Ticket'
                                : 'Attend'}
                      </Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No running or upcoming events found.</Text>
          )}
        </View>
      </ScrollView>

      <PurchaseModal
        event={purchaseEvent}
        ticketCount={ticketCount}
        setTicketCount={setTicketCount}
        variantQuantities={variantQuantities}
        setVariantQuantities={setVariantQuantities}
        paymentStep={paymentStep}
        paying={paying}
        onClose={closePurchase}
        onNext={goToPayment}
        onBack={() => setPaymentStep('details')}
        onConfirm={confirmPurchase}
      />

      <PassModal pass={selectedPass} onClose={() => setSelectedPass(null)} />
      <EventDetailsModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onImagePress={(imageUrl) => setPreviewImageUrl(imageUrl)}
      />
      <ImagePreviewModal
        imageUrl={previewImageUrl}
        onClose={() => setPreviewImageUrl('')}
      />
    </ScreenContainer>
  );
}

function PurchaseModal({
  event,
  ticketCount,
  setTicketCount,
  variantQuantities,
  setVariantQuantities,
  paymentStep,
  paying,
  onClose,
  onNext,
  onBack,
  onConfirm,
}) {
  if (!event) {
    return null;
  }

  const variants = getActiveVariants(event);
  const purchase = calculatePurchase(event, variantQuantities, ticketCount);
  const ticketPrice = Number(event.ticket_price || 0);
  const total = purchase.totalAmount;
  const toggleVariant = (variant) => {
    const variantId = variant.id;
    const currentValue = Number(variantQuantities[variantId] || 0);
    const nextValue = currentValue > 0 ? '' : '1';
    const selectedVariant = variants.find((variant) => Number(variant.id) === Number(variantId));
    const isEntryVariant = Number(selectedVariant?.seat_count || 0) > 0;

    setVariantQuantities((current) => {
      const next = { ...current, [variantId]: nextValue };

      if (isEntryVariant && Number(nextValue || 0) > 0) {
        variants.forEach((variant) => {
          if (Number(variant.id) !== Number(variantId) && Number(variant.seat_count || 0) > 0) {
            next[variant.id] = '';
          }
        });
      }

      return next;
    });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {paymentStep === 'payment' ? 'Payment Gateway' : 'Choose Tickets'}
          </Text>
          <Text style={styles.modalEventTitle}>{event.title}</Text>
          <Text style={styles.modalMeta}>{formatDateTime(event.event_date)}</Text>

          {paymentStep === 'details' ? (
            <>
              {variants.length ? (
                <View style={styles.variantList}>
                  {variants.map((variant) => (
                    <View key={variant.id} style={styles.variantRow}>
                      <View style={styles.variantInfo}>
                        <Text style={styles.variantName}>{variant.name}</Text>
                        <Text style={styles.variantMeta}>
                          BDT {Number(variant.price || 0)} • {Number(variant.seat_count || 0)} seat{Number(variant.seat_count || 0) === 1 ? '' : 's'}
                        </Text>
                        {variant.description ? <Text style={styles.variantDescription}>{variant.description}</Text> : null}
                      </View>
                      <Pressable
                        onPress={() => toggleVariant(variant)}
                        style={[
                          styles.variantSelectButton,
                          Number(variantQuantities[variant.id] || 0) > 0 && styles.variantSelectButtonActive,
                        ]}
                      >
                        <Ionicons
                          name={Number(variantQuantities[variant.id] || 0) > 0 ? 'checkmark' : Number(variant.seat_count || 0) > 0 ? 'ellipse-outline' : 'square-outline'}
                          size={20}
                          color={Number(variantQuantities[variant.id] || 0) > 0 ? '#ffffff' : colors.midnight}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <>
                  <Text style={styles.inputLabel}>Number of tickets</Text>
                  <TextInput
                    value={ticketCount}
                    onChangeText={setTicketCount}
                    keyboardType="number-pad"
                    style={styles.input}
                    placeholder="1"
                  />
                </>
              )}
              <View style={styles.summaryBox}>
                <SummaryRow
                  label={variants.length ? 'Selected options' : 'Ticket price'}
                  value={variants.length ? `${purchase.items.length}` : ticketPrice > 0 ? `BDT ${ticketPrice}` : 'Free'}
                />
                <SummaryRow label="Seats used" value={`${purchase.seatCount}`} />
                <SummaryRow label="Available" value={`${event.available_seats} seats`} />
                <SummaryRow label="Total" value={total > 0 ? `BDT ${total}` : 'Free'} strong />
              </View>
              <View style={styles.modalActions}>
                <Pressable onPress={onClose} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable onPress={onNext} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>
                    {total > 0 ? 'Payment' : 'Continue'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.gatewayBox}>
                <Text style={styles.gatewayName}>Dhaka Club Payment Gateway</Text>
                <Text style={styles.gatewayAmount}>{total > 0 ? `BDT ${total}` : 'Free Event'}</Text>
                <Text style={styles.gatewayNote}>
                  This is a demo payment confirmation. Confirming will generate your QR entry pass.
                </Text>
              </View>
              <View style={styles.modalActions}>
                <Pressable disabled={paying} onPress={onBack} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </Pressable>
                <Pressable disabled={paying} onPress={onConfirm} style={styles.primaryButton}>
                  {paying ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Confirm Purchase</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function PassModal({ pass, onClose }) {
  if (!pass) {
    return null;
  }

  const qrValue = pass.qr_payload || pass.entry_code || String(pass.id);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.passModalCard}>
          <Text style={styles.modalTitle}>Entry Pass</Text>
          <Text style={styles.modalEventTitle}>{pass.title}</Text>
          <Text style={styles.modalMeta}>{formatDateTime(pass.event_date)}</Text>
          <Text style={styles.modalMeta}>{pass.venue}</Text>

          <View style={styles.qrBox}>
            <QRCode value={qrValue} size={190} />
          </View>

          <View style={styles.summaryBox}>
            <SummaryRow label="Tickets" value={`${pass.ticket_count}`} />
            <SummaryRow label="Payment" value={pass.payment_status} />
            <SummaryRow label="Entry Status" value={pass.entry_status || 'Valid'} strong />
            <SummaryRow label="Valid From" value={formatDateTime(pass.valid_from)} />
            <SummaryRow label="Valid Until" value={formatDateTime(pass.valid_until)} />
          </View>
          {pass.ticket_items?.length ? (
            <View style={styles.passItemsBox}>
              {pass.ticket_items.map((item) => (
                <SummaryRow
                  key={item.id}
                  label={`${item.ticket_name_snapshot} x ${item.quantity}`}
                  value={`BDT ${Number(item.line_total || 0)}`}
                />
              ))}
            </View>
          ) : null}

          <Text style={styles.entryCode}>{pass.entry_code}</Text>

          <Pressable onPress={onClose} style={[styles.primaryButton, styles.fullButton]}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function EventDetailsModal({ event, onClose, onImagePress }) {
  if (!event) {
    return null;
  }

  const ticketPrice = Number(event.ticket_price || 0);
  const variants = getActiveVariants(event);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.detailModalCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailTitleBlock}>
              <Text style={styles.detailType}>Event Details</Text>
              <Text style={styles.detailTitle}>{event.title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {event.cover_image ? (
              <Pressable onPress={() => onImagePress(buildAssetUrl(event.cover_image))}>
                <Image
                  source={{ uri: buildAssetUrl(event.cover_image) }}
                  style={styles.detailCover}
                />
              </Pressable>
            ) : null}
            <Text style={[styles.status, getStatusStyle(event.status)]}>{event.status}</Text>
            <View style={styles.detailInfoBox}>
              <SummaryRow label="Date & Time" value={formatDateTime(event.event_date)} />
              <SummaryRow label="Venue" value={event.venue || '-'} />
              <SummaryRow label="Ticket" value={variants.length ? `${variants.length} options` : ticketPrice > 0 ? `BDT ${ticketPrice}` : 'Free'} />
              <SummaryRow
                label="Capacity"
                value={`${Number(event.total_seats || event.available_seats || 0)} Seats`}
              />
            </View>
            <Text style={styles.detailDescription}>
              {event.description || 'No event details available.'}
            </Text>
            {variants.length ? (
              <View style={styles.detailVariantBox}>
                {variants.map((variant) => (
                  <View key={variant.id} style={styles.detailVariantRow}>
                    <View style={styles.variantInfo}>
                      <Text style={styles.variantName}>{variant.name}</Text>
                      <Text style={styles.variantMeta}>
                        {Number(variant.seat_count || 0)} seat{Number(variant.seat_count || 0) === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={styles.detailVariantPrice}>BDT {Number(variant.price || 0)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {event.status !== 'Ongoing' ? (
              <Text style={styles.advanceNotice}>
                Ticket purchase option will open when this event is open.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ImagePreviewModal({ imageUrl, onClose }) {
  return (
    <Modal visible={Boolean(imageUrl)} transparent animationType="fade" onRequestClose={onClose}>
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

function SummaryRow({ label, value, strong }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryValueStrong]}>{value}</Text>
    </View>
  );
}

function getActiveVariants(event) {
  return (event?.ticket_variants || []).filter((variant) => variant.is_active !== false);
}

function hasPaidTickets(event) {
  const variants = getActiveVariants(event);

  if (variants.length) {
    return variants.some((variant) => Number(variant.price || 0) > 0);
  }

  return Number(event?.ticket_price || 0) > 0;
}

function getEventPriceLabel(event) {
  const variants = getActiveVariants(event);

  if (!variants.length) {
    const ticketPrice = Number(event?.ticket_price || 0);
    return ticketPrice > 0 ? `BDT ${ticketPrice}` : 'Free';
  }

  const entryPrices = variants
    .filter((variant) => Number(variant.seat_count || 0) > 0)
    .map((variant) => Number(variant.price || 0));
  const prices = entryPrices.length ? entryPrices : variants.map((variant) => Number(variant.price || 0));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (minPrice === maxPrice) {
    return `BDT ${minPrice}`;
  }

  return `From BDT ${minPrice}`;
}

function calculatePurchase(event, variantQuantities, ticketCount) {
  const variants = getActiveVariants(event);

  if (!variants.length) {
    const legacyCount = Number(ticketCount || 0);
    const safeCount = Number.isInteger(legacyCount) && legacyCount > 0 ? legacyCount : 0;
    const unitPrice = Number(event?.ticket_price || 0);

    return {
      items: [],
      legacyCount,
      seatCount: safeCount,
      totalAmount: safeCount * unitPrice,
    };
  }

  const items = variants
    .map((variant) => ({
      ...variant,
      quantity: Number(variantQuantities[variant.id] || 0),
    }))
    .filter((variant) => Number.isInteger(variant.quantity) && variant.quantity > 0);

  return {
    items,
    legacyCount: 0,
    seatCount: items.reduce((sum, item) => sum + Number(item.seat_count || 0) * item.quantity, 0),
    totalAmount: items.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0),
  };
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

function getStatusStyle(status) {
  const stylesByStatus = {
    Upcoming: styles.statusUpcoming,
    Ongoing: styles.statusOngoing,
    Completed: styles.statusCompleted,
    Cancelled: styles.statusCancelled,
  };

  return stylesByStatus[status] || styles.statusUpcoming;
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

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#1e2a45',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 112,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  actionButtonPressed: {
    opacity: 0.86,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  availableBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  availableValue: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    elevation: 2,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  cardCover: {
    backgroundColor: '#e2e8f0',
    height: 170,
    width: '100%',
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  cardTitle: {
    color: '#0f172a',
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
  },
  content: {
    padding: 18,
    paddingBottom: 86,
  },
  advanceNotice: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    color: '#92400e',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 16,
    padding: 12,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  closeButtonText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '900',
  },
  date: {
    color: '#1e2a45',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  detailCover: {
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    height: 190,
    marginBottom: 14,
    width: '100%',
  },
  detailDescription: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 16,
  },
  detailHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailInfoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  detailModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '84%',
    padding: 20,
    width: '92%',
  },
  detailTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
    marginTop: 4,
  },
  detailTitleBlock: {
    flex: 1,
  },
  detailType: {
    color: '#1e2a45',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailVariantBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    gap: 10,
    marginTop: 16,
    padding: 14,
  },
  detailVariantPrice: {
    color: '#1e2a45',
    fontSize: 14,
    fontWeight: '900',
  },
  detailVariantRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 15,
    textAlign: 'center',
  },
  entryCode: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 12,
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
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 14,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  fullButton: {
    marginTop: 18,
    width: '100%',
  },
  gatewayAmount: {
    color: '#1e2a45',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 10,
  },
  gatewayBox: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  gatewayName: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '900',
  },
  gatewayNote: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  input: {
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 18,
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
    fontSize: 14,
    marginTop: 6,
    paddingHorizontal: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '88%',
    padding: 20,
    width: '92%',
  },
  modalEventTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 8,
  },
  modalMeta: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
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
  passButton: {
    backgroundColor: '#047857',
  },
  passItemsBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 14,
    gap: 10,
    marginTop: 12,
    padding: 14,
    width: '100%',
  },
  passChip: {
    backgroundColor: '#ffffff',
    borderColor: '#dbeafe',
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    width: 170,
  },
  passChipMeta: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  passChipTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
  passModalCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '92%',
  },
  passStrip: {
    backgroundColor: '#eaf2ff',
    borderRadius: 16,
    marginTop: 18,
    padding: 14,
  },
  passStripTitle: {
    color: '#1e2a45',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
  },
  price: {
    backgroundColor: '#fff1c2',
    borderRadius: 999,
    color: '#8a5a00',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1e2a45',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  qrBox: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
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
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
  },
  status: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusCancelled: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
  },
  statusCompleted: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
  statusOngoing: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  statusUpcoming: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  heroEyebrow: {
    color: colors.champagne,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 14,
    textTransform: 'uppercase',
  },
  heroSubtitle: {
    color: '#d9e7ff',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 4,
  },
  pageHero: {
    borderRadius: 28,
    padding: 20,
  },
  pageHeroIcon: {
    alignItems: 'center',
    backgroundColor: colors.champagne,
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  pageHeroIconText: {
    color: colors.midnight,
    fontSize: 22,
    fontWeight: '900',
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    gap: 10,
    marginTop: 16,
    padding: 14,
    width: '100%',
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
  summaryValueStrong: {
    color: '#1e2a45',
    fontSize: 15,
    fontWeight: '900',
  },
  title: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },
  variantDescription: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  variantInfo: {
    flex: 1,
  },
  variantInput: {
    display: 'none',
  },
  variantList: {
    gap: 10,
    marginTop: 18,
  },
  variantMeta: {
    color: '#1e2a45',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  variantName: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
  },
  variantRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  variantSelectButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  variantSelectButtonActive: {
    backgroundColor: colors.midnight,
    borderColor: colors.midnight,
  },
});

export default EventsScreen;
