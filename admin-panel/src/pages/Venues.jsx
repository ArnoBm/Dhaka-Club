import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react'
import api from '../api/axios'

const bookingStatuses = ['All', 'Pending', 'Confirmed', 'Cancelled']
const venueShifts = [
  { value: 'Morning', label: 'Morning Shift', time: '11:00 AM - 5:00 PM' },
  { value: 'Evening', label: 'Evening Shift', time: '6:00 PM - 12:00 AM' },
]

function Venues() {
  const [activeTab, setActiveTab] = useState('Availability')
  const [selectedDate, setSelectedDate] = useState(today())
  const [availability, setAvailability] = useState([])
  const [bookings, setBookings] = useState([])
  const [confirmedBookings, setConfirmedBookings] = useState([])
  const [bookingStatus, setBookingStatus] = useState('All')
  const [availabilityLoading, setAvailabilityLoading] = useState(true)
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)

  const fetchAvailability = useCallback(async () => {
    setAvailabilityLoading(true)

    try {
      const response = await api.get('/venues/availability', {
        params: { date: selectedDate },
      })
      setAvailability(response.data || [])
    } catch (error) {
      toast.error('Failed to load venue availability.')
    } finally {
      setAvailabilityLoading(false)
    }
  }, [selectedDate])

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true)

    try {
      const response = await api.get('/venues/bookings', {
        params: bookingStatus === 'All' ? {} : { status: bookingStatus },
      })
      setBookings(response.data || [])
    } catch (error) {
      toast.error('Failed to load venue bookings.')
    } finally {
      setBookingsLoading(false)
    }
  }, [bookingStatus])

  const fetchConfirmedBookings = useCallback(async () => {
    try {
      const response = await api.get('/venues/bookings', {
        params: { status: 'Confirmed' },
      })
      setConfirmedBookings(response.data || [])
    } catch (error) {
      toast.error('Failed to load occupied venue dates.')
    }
  }, [])

  useEffect(() => {
    fetchAvailability()
  }, [fetchAvailability])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  useEffect(() => {
    fetchConfirmedBookings()
  }, [fetchConfirmedBookings])

  const updateBookingStatus = async (booking, status) => {
    setUpdatingId(booking.id)

    try {
      await api.put(`/venues/bookings/${booking.id}`, { status })
      toast.success(`Booking ${status.toLowerCase()} successfully.`)
      fetchBookings()
      fetchAvailability()
      fetchConfirmedBookings()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to update booking status.'
      toast.error(message)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section>
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Venues</h2>
        <p className="mt-1 text-sm text-slate-500">
          Check venue availability and manage booking approvals.
        </p>
      </div>

      <div className="mt-6 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {['Availability', 'Bookings'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'rounded-md px-4 py-2 text-sm font-medium',
              activeTab === tab
                ? 'bg-[#1e2a45] text-white'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Availability' ? (
        <AvailabilityTab
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          venues={availability}
          confirmedBookings={confirmedBookings}
          loading={availabilityLoading}
        />
      ) : (
        <BookingsTab
          bookings={bookings}
          venues={availability}
          status={bookingStatus}
          setStatus={setBookingStatus}
          loading={bookingsLoading}
          updatingId={updatingId}
          onUpdateStatus={updateBookingStatus}
          onBookingCreated={() => {
            fetchBookings()
            fetchAvailability()
            fetchConfirmedBookings()
          }}
        />
      )}
    </section>
  )
}

function AvailabilityTab({
  selectedDate,
  setSelectedDate,
  venues,
  confirmedBookings,
  loading,
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(selectedDate))
  const [selectedVenueId, setSelectedVenueId] = useState('all')
  const selectedVenue =
    selectedVenueId === 'all'
      ? null
      : venues.find((venue) => String(venue.id) === String(selectedVenueId))
  const visibleVenues =
    selectedVenueId === 'all'
      ? venues
      : venues.filter((venue) => String(venue.id) === String(selectedVenueId))
  const calendarDays = getCalendarDays(calendarMonth)

  const isDateBooked = (date) => {
    const key = toDateKey(date)

    const shiftCount = new Set()

    confirmedBookings.forEach((booking) => {
      if (toDateKey(booking.booking_date) !== key) {
        return
      }

      if (
        selectedVenueId === 'all' ||
        String(booking.venue_id) === String(selectedVenueId)
      ) {
        shiftCount.add(`${booking.venue_id}-${booking.booking_shift || booking.start_time}`)
      }
    })

    return selectedVenueId === 'all' ? shiftCount.size > 0 : shiftCount.size >= 2
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="font-semibold text-slate-950">Venue Availability Calendar</h3>
          <p className="text-sm text-slate-500">
            Each venue has two daily shifts. Fully occupied venue dates are red; partially booked dates show slot details.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px]">
          <label className="block text-sm font-medium text-slate-700">
            Venue Filter
            <select
              value={selectedVenueId}
              onChange={(event) => setSelectedVenueId(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
            >
              <option value="all">All Venue</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Date
            <div className="relative mt-2">
              <CalendarDays
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  setSelectedDate(event.target.value)
                  setCalendarMonth(startOfMonth(event.target.value))
                }}
                className="w-full rounded-md border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-semibold text-slate-950">
                {formatMonth(calendarMonth)}
              </h4>
              <p className="text-sm text-slate-500">
                {selectedVenue ? selectedVenue.name : 'All venues'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
                className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentDate = today()
                  setSelectedDate(currentDate)
                  setCalendarMonth(startOfMonth(currentDate))
                }}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-slate-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((date) => {
              const key = toDateKey(date)
              const inCurrentMonth = isSameMonth(date, calendarMonth)
              const selected = key === selectedDate
              const booked = isDateBooked(date)

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={[
                    'aspect-square rounded-lg border p-1 text-sm font-medium transition sm:p-2',
                    !inCurrentMonth
                      ? 'border-slate-100 bg-slate-50 text-slate-300'
                      : booked
                        ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        : 'border-green-100 bg-green-50 text-green-700 hover:bg-green-100',
                    selected ? 'ring-2 ring-[#1e2a45]' : '',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-red-100 ring-1 ring-red-200" />
              Occupied
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-green-100 ring-1 ring-green-200" />
              Available
            </span>
          </div>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h4 className="font-semibold text-slate-950">{formatDate(selectedDate)}</h4>
            <p className="text-sm text-slate-500">
              Use the filter above or click a venue to highlight its booked and available dates.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSelectedVenueId('all')}
            className={[
              'mt-4 w-full rounded-md border px-3 py-2 text-left text-sm font-medium',
              selectedVenueId === 'all'
                ? 'border-[#1e2a45] bg-[#1e2a45] text-white'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            All venues
          </button>

          <div className="mt-3 space-y-3">
            {loading ? (
              <VenueListSkeleton />
            ) : visibleVenues.length ? (
              visibleVenues.map((venue) => (
                <button
                  key={venue.id}
                  type="button"
                  onClick={() => setSelectedVenueId(String(venue.id))}
                  className={[
                    'w-full rounded-lg border p-4 text-left transition',
                    String(selectedVenueId) === String(venue.id)
                      ? 'border-[#1e2a45] bg-slate-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="font-semibold text-slate-950">{venue.name}</h5>
                      <p className="mt-1 text-sm text-slate-500">
                        Capacity: {venue.capacity}
                      </p>
                    </div>
                    <AvailabilityBadge status={venue.availability} />
                  </div>
                  <div className="mt-3 grid gap-2">
                    {venueShifts.map((shift) => (
                      <div
                        key={shift.value}
                        className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-xs"
                      >
                        <span className="font-semibold text-slate-700">{shift.label}</span>
                        <span className={shiftStatusClass(venue[`${shift.value.toLowerCase()}_status`])}>
                          {venue[`${shift.value.toLowerCase()}_status`] || 'Available'} · {shift.time}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                    <Building2 size={16} />
                    ৳{venue.per_day_charge || 0} per day
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                No venues found.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function BookingsTab({
  bookings,
  venues,
  status,
  setStatus,
  loading,
  updatingId,
  onUpdateStatus,
  onBookingCreated,
}) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="font-semibold text-slate-950">Bookings</h3>
          <p className="text-sm text-slate-500">
            Review user requests or create a manual venue booking.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
          >
            {bookingStatuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
          >
            <Plus size={18} />
            Add Booking
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Venue Name</Th>
                <Th>Member Name</Th>
                <Th>Date</Th>
                <Th>Shift</Th>
                <Th>Time</Th>
                <Th>Purpose</Th>
                <Th>Charge</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <BookingSkeleton />
              ) : bookings.length ? (
                bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50/70">
                    <Td>{booking.venue_name}</Td>
                    <Td>{booking.member_full_name}</Td>
                    <Td>{formatDate(booking.booking_date)}</Td>
                    <Td>{formatShift(booking.booking_shift)}</Td>
                    <Td>{formatTimeRange(booking)}</Td>
                    <Td>{booking.purpose}</Td>
                    <Td>৳{booking.total_charge || 0}</Td>
                    <Td>
                      <BookingStatusBadge status={booking.status} />
                    </Td>
                    <Td>
                      {booking.status === 'Pending' ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={updatingId === booking.id}
                            onClick={() => onUpdateStatus(booking, 'Confirmed')}
                            className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            <Check size={14} />
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={updatingId === booking.id}
                            onClick={() => onUpdateStatus(booking, 'Cancelled')}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            <X size={14} />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No actions</span>
                      )}
                    </Td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="px-4 py-10 text-center text-slate-500">
                    No bookings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <BookingModal
          venues={venues}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false)
            onBookingCreated()
          }}
        />
      )}
    </div>
  )
}

function BookingModal({ venues, onClose, onCreated }) {
  const [form, setForm] = useState({
    venue_id: '',
    member_id: '',
    booking_date: today(),
    booking_shift: 'Morning',
    purpose: '',
    total_charge: '',
  })
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [searchingMembers, setSearchingMembers] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (memberSearch.trim().length < 2 || selectedMember) {
      setMemberResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      setSearchingMembers(true)

      try {
        const response = await api.get('/members', {
          params: { search: memberSearch.trim(), status: 'Active' },
        })
        setMemberResults(Array.isArray(response.data) ? response.data : response.data?.data || [])
      } catch (error) {
        toast.error('Failed to search members.')
      } finally {
        setSearchingMembers(false)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [memberSearch, selectedMember])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const selectMember = (member) => {
    setSelectedMember(member)
    updateField('member_id', member.id)
    setMemberSearch(`${member.full_name} (${member.member_id})`)
    setMemberResults([])
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.member_id) {
      toast.error('Please select a member.')
      return
    }

    setSaving(true)

    try {
      await api.post('/venues/bookings', {
        venue_id: form.venue_id,
        member_id: form.member_id,
        booking_date: form.booking_date,
        booking_shift: form.booking_shift,
        purpose: form.purpose,
        total_charge: Number(form.total_charge || 0),
      })
      toast.success('Venue booking created successfully.')
      onCreated()
    } catch (error) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to create venue booking.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-4 sm:py-8">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:max-h-[calc(100vh-4rem)]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">Add Venue Booking</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Venue</span>
              <select
                value={form.venue_id}
                onChange={(event) => {
                  const venueId = event.target.value
                  const venue = venues.find((item) => String(item.id) === venueId)
                  updateField('venue_id', venueId)

                  if (venue && !form.total_charge) {
                    updateField('total_charge', venue.per_day_charge || 0)
                  }
                }}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                <option value="">Select Venue</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative">
              <label className="block text-sm font-medium text-slate-700">
                Member
              </label>
              <div className="relative mt-2">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => {
                    setSelectedMember(null)
                    updateField('member_id', '')
                    setMemberSearch(event.target.value)
                  }}
                  placeholder="Search member"
                  className="w-full rounded-md border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
                />
              </div>

              {(memberResults.length > 0 || searchingMembers) && (
                <div className="absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                  {searchingMembers ? (
                    <div className="px-3 py-3 text-sm text-slate-500">
                      Searching members...
                    </div>
                  ) : (
                    memberResults.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => selectMember(member)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-950">
                          {member.full_name}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {member.member_id} - {member.phone}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <BookingField
              label="Booking Date"
              type="date"
              value={form.booking_date}
              onChange={(value) => updateField('booking_date', value)}
              required
            />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Shift</span>
              <select
                value={form.booking_shift}
                onChange={(event) => updateField('booking_shift', event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                {venueShifts.map((shift) => (
                  <option key={shift.value} value={shift.value}>
                    {shift.label} ({shift.time})
                  </option>
                ))}
              </select>
            </label>
            <BookingField
              label="Total Charge"
              type="number"
              value={form.total_charge}
              onChange={(value) => updateField('total_charge', value)}
              min="0"
              step="0.01"
            />
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Purpose</span>
              <input
                type="text"
                value={form.purpose}
                onChange={(event) => updateField('purpose', event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>
          </div>

          <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 pt-5 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263657] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saving...' : 'Save Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BookingField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  min,
  step,
}) {
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

function AvailabilityBadge({ status }) {
  const available = status === 'Available'
  const partial = status === 'Partially Booked'

  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        available
          ? 'bg-green-50 text-green-700 ring-green-600/20'
          : partial
            ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
            : 'bg-red-50 text-red-700 ring-red-600/20',
      ].join(' ')}
    >
      {status}
    </span>
  )
}

function shiftStatusClass(status) {
  const booked = ['Pending', 'Confirmed'].includes(status)

  return [
    'font-semibold',
    booked ? 'text-red-700' : 'text-green-700',
  ].join(' ')
}

function BookingStatusBadge({ status }) {
  const classes = {
    Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Confirmed: 'bg-green-50 text-green-700 ring-green-600/20',
    Cancelled: 'bg-red-50 text-red-700 ring-red-600/20',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        classes[status] || 'bg-slate-50 text-slate-700 ring-slate-600/20'
      }`}
    >
      {status}
    </span>
  )
}

function VenueListSkeleton() {
  return [1, 2, 3, 4].map((item) => (
    <div
      key={item}
      className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="h-4 w-2/3 rounded bg-slate-200" />
      <div className="mt-3 h-3 w-24 rounded bg-slate-100" />
      <div className="mt-5 h-7 w-32 rounded bg-slate-100" />
    </div>
  ))
}

function BookingSkeleton() {
  return [1, 2, 3, 4, 5].map((item) => (
    <tr key={item}>
      <td colSpan="9" className="px-4 py-3">
        <div className="h-8 animate-pulse rounded bg-slate-100" />
      </td>
    </tr>
  ))
}

function Th({ children }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>
}

function Td({ children }) {
  return <td className="whitespace-nowrap px-4 py-3 text-slate-700">{children}</td>
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function startOfMonth(value) {
  const date = new Date(`${toDateKey(value)}T00:00:00`)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(value, amount) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function getCalendarDays(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const firstDay = start.getDay()
  const calendarStart = new Date(start)
  calendarStart.setDate(start.getDate() - firstDay)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart)
    date.setDate(calendarStart.getDate() + index)
    return date
  })
}

function isSameMonth(date, monthDate) {
  return (
    date.getFullYear() === monthDate.getFullYear() &&
    date.getMonth() === monthDate.getMonth()
  )
}

function toDateKey(value) {
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return String(value || '').slice(0, 10)
}

function formatMonth(value) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
  }).format(value)
}

function formatDate(value) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

function formatTime(value) {
  if (!value) {
    return '-'
  }

  return String(value).slice(0, 5)
}

function formatShift(value) {
  return venueShifts.find((shift) => shift.value === value)?.label || value || '-'
}

function formatTimeRange(booking) {
  const shift = venueShifts.find((item) => item.value === booking.booking_shift)

  if (shift) {
    return shift.time
  }

  return `${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`
}

export default Venues
