import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Edit, ImageIcon, Ticket, Users, X } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  title: '',
  description: '',
  event_date: '',
  venue: '',
  ticket_price: 0,
  total_seats: '',
  requires_ticket: false,
  status: 'Upcoming',
  cover_image: '',
  cover_image_file: null,
  ticket_variants: [],
}

const emptyVariant = {
  name: '',
  description: '',
  price: '',
  seat_count: 1,
  max_quantity_per_order: '',
  is_active: true,
}

const statuses = ['Upcoming', 'Ongoing', 'Completed', 'Cancelled']
const filters = ['All', ...statuses]
const venueOptions = [
  'Royal Bengal Dining',
  'Royal Bengal Lounge',
  'Cigar Lounge',
  'Banquet & Dining Spaces',
  'Seminar / Meeting Halls',
  'Outdoor Lawn Areas',
  'Executive Lounge-style Seating Areas',
]

function Events() {
  const [events, setEvents] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [registrationsOpen, setRegistrationsOpen] = useState(false)
  const [registrations, setRegistrations] = useState([])
  const [registrationsLoading, setRegistrationsLoading] = useState(false)

  const fetchEvents = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.get('/events', {
        params: statusFilter === 'All' ? {} : { status: statusFilter },
      })
      setEvents(response.data || [])
    } catch (error) {
      toast.error('Failed to load events.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const openAddModal = () => {
    setSelectedEvent(null)
    setForm(emptyForm)
    setModalMode('add')
  }

  const openEditModal = (event) => {
    setSelectedEvent(event)
    setForm(eventToForm(event))
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedEvent(null)
    setForm(emptyForm)
  }

  const openRegistrations = async (event) => {
    setSelectedEvent(event)
    setRegistrationsOpen(true)
    setRegistrationsLoading(true)

    try {
      const response = await api.get(`/events/${event.id}/registrations`)
      setRegistrations(response.data || [])
    } catch (error) {
      toast.error('Failed to load registrations.')
    } finally {
      setRegistrationsLoading(false)
    }
  }

  const closeRegistrations = () => {
    setRegistrationsOpen(false)
    setSelectedEvent(null)
    setRegistrations([])
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      const payload = toFormData(normalizePayload(form, selectedEvent), form.cover_image_file)

      if (modalMode === 'edit') {
        await api.put(`/events/${selectedEvent.id}`, payload)
        toast.success('Event updated successfully.')
      } else {
        await api.post('/events', payload)
        toast.success('Event created successfully.')
      }

      closeModal()
      fetchEvents()
    } catch (error) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to save event. Please try again.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Events</h2>
          <p className="mt-1 text-sm text-slate-500">
            Create events, track capacity, and review registrations.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
        >
          <CalendarDays size={18} />
          Add Event
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={[
              'rounded-md px-3 py-2 text-sm font-medium',
              statusFilter === filter
                ? 'bg-[#1e2a45] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <EventSkeleton />
        ) : events.length ? (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={() => openEditModal(event)}
              onRegistrations={() => openRegistrations(event)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            No events found.
          </div>
        )}
      </div>

      {modalMode && (
        <EventModal
          form={form}
          setForm={setForm}
          saving={saving}
          mode={modalMode}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {registrationsOpen && (
        <RegistrationsModal
          event={selectedEvent}
          registrations={registrations}
          loading={registrationsLoading}
          onClose={closeRegistrations}
          onRefresh={() => {
            openRegistrations(selectedEvent)
            fetchEvents()
          }}
        />
      )}
    </section>
  )
}

function EventCard({ event, onEdit, onRegistrations }) {
  const totalSeats = Number(event.total_seats || 0)
  const availableSeats = Number(event.available_seats || 0)
  const soldSeats = Math.max(totalSeats - availableSeats, 0)

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {event.cover_image && (
        <img
          src={buildAssetUrl(event.cover_image)}
          alt=""
          className="h-40 w-full object-cover"
        />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">{event.title}</h3>
        <StatusBadge status={event.status} />
      </div>

        <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>{formatDateTime(event.event_date)}</p>
        <p>{event.venue}</p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">
            <span className="block text-xs font-medium">Sold</span>
            <span className="text-base font-semibold">{soldSeats}</span>
          </div>
          <div className="rounded-md bg-blue-50 px-3 py-2 text-blue-700">
            <span className="block text-xs font-medium">Available</span>
            <span className="text-base font-semibold">{availableSeats}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
        <Ticket size={16} />
        {formatEventPrice(event)}
      </div>

        <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Edit size={16} />
          Edit
        </button>
        <button
          type="button"
          onClick={onRegistrations}
          className="inline-flex items-center gap-2 rounded-md bg-[#1e2a45] px-3 py-2 text-sm font-medium text-white hover:bg-[#263657]"
        >
          <Users size={16} />
          Registrations
        </button>
      </div>
      </div>
    </article>
  )
}

function EventModal({ form, setForm, saving, mode, onClose, onSubmit }) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateVariant = (index, field, value) => {
    setForm((current) => ({
      ...current,
      ticket_variants: current.ticket_variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [field]: value } : variant
      ),
    }))
  }

  const addVariant = () => {
    setForm((current) => ({
      ...current,
      ticket_variants: [...current.ticket_variants, { ...emptyVariant }],
    }))
  }

  const removeVariant = (index) => {
    setForm((current) => ({
      ...current,
      ticket_variants: current.ticket_variants.filter((_, variantIndex) => variantIndex !== index),
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">
            {mode === 'edit' ? 'Edit Event' : 'Add Event'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="max-h-[calc(100vh-9rem)] overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Title" value={form.title} onChange={(value) => updateField('title', value)} required />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Venue</span>
              <select
                value={form.venue}
                onChange={(event) => updateField('venue', event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                <option value="">Select venue</option>
                {venueOptions.map((venue) => (
                  <option key={venue} value={venue}>
                    {venue}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Date & Time" type="datetime-local" value={form.event_date} onChange={(value) => updateField('event_date', value)} required />
            <TextField label="Ticket Price" type="number" value={form.ticket_price} onChange={(value) => updateField('ticket_price', value)} min="0" step="0.01" />
            <TextField label="Total Seats" type="number" value={form.total_seats} onChange={(value) => updateField('total_seats', value)} min="0" required />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 md:col-span-2">
              <input
                type="checkbox"
                checked={form.requires_ticket}
                onChange={(event) => updateField('requires_ticket', event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#1e2a45] focus:ring-[#1e2a45]"
              />
              <span className="text-sm font-medium text-slate-700">Requires Ticket</span>
            </label>
            <div className="md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Cover Picture</span>
              <div className="mt-2 rounded-md border border-dashed border-slate-300 p-3">
                {(form.cover_image_file || form.cover_image) && (
                  <img
                    src={form.cover_image_file ? URL.createObjectURL(form.cover_image_file) : buildAssetUrl(form.cover_image)}
                    alt=""
                    className="mb-3 h-40 w-full rounded-md object-cover"
                  />
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <ImageIcon size={16} />
                    Choose picture
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(event) => updateField('cover_image_file', event.target.files?.[0] || null)}
                    />
                  </label>
                  {form.cover_image_file ? (
                    <span className="text-sm text-slate-600">{form.cover_image_file.name}</span>
                  ) : form.cover_image ? (
                    <span className="text-sm text-slate-600">Current cover picture</span>
                  ) : (
                    <span className="text-sm text-slate-400">No picture selected</span>
                  )}
                  {(form.cover_image_file || form.cover_image) && (
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, cover_image: '', cover_image_file: null }))}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>
            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Ticket / Price Variants</span>
                <button
                  type="button"
                  onClick={addVariant}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Add Variant
                </button>
              </div>
              <div className="mt-2 space-y-3">
                {form.ticket_variants.length ? (
                  form.ticket_variants.map((variant, index) => (
                    <div key={index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_auto]">
                        <input
                          type="text"
                          value={variant.name}
                          onChange={(event) => updateVariant(index, 'name', event.target.value)}
                          placeholder="Variant name"
                          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
                        />
                        <input
                          type="number"
                          value={variant.price}
                          onChange={(event) => updateVariant(index, 'price', event.target.value)}
                          placeholder="Price"
                          min="0"
                          step="0.01"
                          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
                        />
                        <input
                          type="number"
                          value={variant.seat_count}
                          onChange={(event) => updateVariant(index, 'seat_count', event.target.value)}
                          placeholder="Seats"
                          min="0"
                          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
                        />
                        <input
                          type="number"
                          value={variant.max_quantity_per_order}
                          onChange={(event) => updateVariant(index, 'max_quantity_per_order', event.target.value)}
                          placeholder="Max/order"
                          min="1"
                          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
                        />
                        <button
                          type="button"
                          onClick={() => removeVariant(index)}
                          className="rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                      <input
                        type="text"
                        value={variant.description}
                        onChange={(event) => updateVariant(index, 'description', event.target.value)}
                        placeholder="Description"
                        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
                      />
                      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={variant.is_active}
                          onChange={(event) => updateVariant(index, 'is_active', event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#1e2a45] focus:ring-[#1e2a45]"
                        />
                        Active
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                    No variants added. The event will use the single ticket price.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263657] disabled:cursor-not-allowed disabled:opacity-70">
              {saving ? 'Saving...' : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RegistrationsModal({ event, registrations, loading, onClose, onRefresh }) {
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [cancellingId, setCancellingId] = useState(null)

  const handleVerify = async () => {
    const entryCode = extractEntryCode(verifyCode)

    if (!entryCode) {
      toast.error('Entry code is required.')
      return
    }

    setVerifying(true)

    try {
      const response = await api.post('/events/entry/verify', { entry_code: entryCode })
      toast.success(response.data?.message || 'Entry verified successfully.')
      setVerifyCode('')
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to verify entry pass.')
    } finally {
      setVerifying(false)
    }
  }

  const handleCancelPurchase = async (registration) => {
    const confirmed = window.confirm(
      `Cancel ${registration.full_name}'s purchase and restore ${registration.ticket_count || 1} seat(s)?`
    )

    if (!confirmed) {
      return
    }

    setCancellingId(registration.id)

    try {
      const response = await api.put(`/events/registrations/${registration.id}/cancel`)
      toast.success(response.data?.message || 'Purchase cancelled successfully.')
      onRefresh()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel purchase.')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="max-h-full w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Registrations</h3>
            <p className="text-sm text-slate-500">{event?.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-9rem)] overflow-auto p-6">
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="text-sm font-medium text-slate-700">Verify QR / Entry Code</span>
              <input
                type="text"
                value={verifyCode}
                onChange={(inputEvent) => setVerifyCode(inputEvent.target.value)}
                placeholder="Paste scanned QR code or entry code"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {verifying ? 'Verifying...' : 'Verify Entry'}
            </button>
          </div>
          <table className="min-w-[850px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Member Name</Th>
                <Th>Member ID</Th>
                <Th>Phone</Th>
                <Th>Tickets</Th>
                <Th>Total Amount</Th>
                <Th>Entry Status</Th>
                <Th>RSVP Status</Th>
                <Th>Payment Status</Th>
                <Th>Entry Code</Th>
                <Th>Registration Date</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="11" className="px-4 py-8 text-center text-slate-500">Loading registrations...</td></tr>
              ) : registrations.length ? (
                registrations.map((registration, index) => (
                  <tr key={`${registration.member_id}-${index}`}>
                    <Td>{registration.full_name}</Td>
                    <Td>{registration.member_id}</Td>
                    <Td>{registration.phone}</Td>
                    <Td>{registration.ticket_count || 1}</Td>
                    <Td>{formatMoney(registration.total_amount)}</Td>
                    <Td>{registration.entry_status || 'Valid'}</Td>
                    <Td>{registration.rsvp_status}</Td>
                    <Td>{registration.payment_status}</Td>
                    <Td>{registration.entry_code || '-'}</Td>
                    <Td>{formatDateTime(registration.registered_at)}</Td>
                    <Td>
                      {registration.entry_status === 'Valid' ? (
                        <button
                          type="button"
                          onClick={() => handleCancelPurchase(registration)}
                          disabled={cancellingId === registration.id}
                          className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {cancellingId === registration.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </Td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="11" className="px-4 py-8 text-center text-slate-500">No registrations found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, type = 'text', required, min, step }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        min={min}
        step={step}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
      />
    </label>
  )
}

function StatusBadge({ status }) {
  const classes = {
    Upcoming: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    Ongoing: 'bg-green-50 text-green-700 ring-green-600/20',
    Completed: 'bg-slate-100 text-slate-700 ring-slate-600/20',
    Cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
  }

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${classes[status] || classes.Upcoming}`}>
      {status}
    </span>
  )
}

function EventSkeleton() {
  return [1, 2, 3, 4, 5, 6].map((item) => (
    <div key={item} className="h-56 animate-pulse rounded-lg border border-slate-200 bg-white p-5">
      <div className="h-5 w-2/3 rounded bg-slate-200" />
      <div className="mt-5 h-4 w-40 rounded bg-slate-100" />
      <div className="mt-3 h-4 w-32 rounded bg-slate-100" />
      <div className="mt-8 h-9 w-48 rounded bg-slate-100" />
    </div>
  ))
}

function Th({ children }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>
}

function Td({ children }) {
  return <td className="whitespace-nowrap px-4 py-3 text-slate-700">{children}</td>
}

function eventToForm(event) {
  return {
    title: event.title || '',
    description: event.description || '',
    event_date: toDateTimeInput(event.event_date),
    venue: event.venue || '',
    ticket_price: event.ticket_price || 0,
    total_seats: event.total_seats || '',
    requires_ticket: Boolean(event.requires_ticket),
    status: event.status || 'Upcoming',
    cover_image: event.cover_image || '',
    cover_image_file: null,
    ticket_variants: (event.ticket_variants || []).map((variant) => ({
      name: variant.name || '',
      description: variant.description || '',
      price: variant.price ?? '',
      seat_count: variant.seat_count ?? 1,
      max_quantity_per_order: variant.max_quantity_per_order || '',
      is_active: variant.is_active !== false,
    })),
  }
}

function normalizePayload(form, selectedEvent) {
  const totalSeats = Number(form.total_seats || 0)

  return {
    title: form.title,
    description: form.description || null,
    event_date: toSqlDateTime(form.event_date),
    venue: form.venue,
    ticket_price: Number(form.ticket_price || 0),
    total_seats: totalSeats,
    available_seats: Math.min(selectedEvent?.available_seats ?? totalSeats, totalSeats),
    requires_ticket: Boolean(form.requires_ticket),
    status: form.status,
    cover_image: form.cover_image || null,
    ticket_variants: normalizeVariants(form.ticket_variants),
  }
}

function normalizeVariants(variants) {
  return variants
    .map((variant, index) => ({
      name: String(variant.name || '').trim(),
      description: String(variant.description || '').trim(),
      price: Number(variant.price || 0),
      seat_count: Math.max(Number(variant.seat_count || 0), 0),
      max_quantity_per_order: variant.max_quantity_per_order ? Number(variant.max_quantity_per_order) : null,
      sort_order: index,
      is_active: variant.is_active !== false,
    }))
    .filter((variant) => variant.name)
}

function toFormData(data, coverImageFile) {
  const payload = new FormData()

  Object.entries(data).forEach(([key, value]) => {
    payload.append(key, key === 'ticket_variants' ? JSON.stringify(value || []) : value === null || value === undefined ? '' : value)
  })

  if (coverImageFile) {
    payload.append('cover_image_file', coverImageFile)
  }

  return payload
}

function buildAssetUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) {
    return path || ''
  }

  const baseURL = api.defaults.baseURL || ''

  if (/^https?:\/\//i.test(baseURL)) {
    return `${baseURL.replace(/\/api\/?$/, '')}${path}`
  }

  return path
}

function toSqlDateTime(value) {
  return value ? value.replace('T', ' ') : value
}

function toDateTimeInput(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMoney(value) {
  const amount = Number(value || 0)
  return amount > 0 ? `BDT ${amount.toFixed(2)}` : 'Free'
}

function formatEventPrice(event) {
  const variants = (event.ticket_variants || []).filter((variant) => variant.is_active !== false)

  if (!variants.length) {
    return Number(event.ticket_price) > 0 ? `BDT ${event.ticket_price}` : 'Free'
  }

  const entryPrices = variants
    .filter((variant) => Number(variant.seat_count || 0) > 0)
    .map((variant) => Number(variant.price || 0))
  const prices = entryPrices.length ? entryPrices : variants.map((variant) => Number(variant.price || 0))

  return `From BDT ${Math.min(...prices)}`
}

function extractEntryCode(value) {
  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return ''
  }

  try {
    const parsedValue = JSON.parse(trimmedValue)
    return parsedValue.entry_code || trimmedValue
  } catch (error) {
    return trimmedValue
  }
}

export default Events
