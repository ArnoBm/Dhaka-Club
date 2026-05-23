import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle, MapPin, Phone, Plus, X, XCircle } from 'lucide-react'
import api from '../api/axios'

const filters = [
  { label: 'All', value: '' },
  { label: 'Blood Request', value: 'Blood' },
  { label: 'Medical Help', value: 'Medical Help' },
  { label: 'Fund Collection', value: 'Fund Collection' },
  { label: 'Other', value: 'Other' },
]

const requestTypes = [
  { label: 'Blood Donate Request', value: 'Blood' },
  { label: 'Fund Collection Request', value: 'Fund Collection' },
  { label: 'Medical Help', value: 'Medical Help' },
  { label: 'Other', value: 'Other' },
]

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const emptyForm = {
  member_id: '',
  request_type: 'Blood',
  blood_group_needed: '',
  description: '',
  contact_number: '',
  location: '',
}

function Community() {
  const [requests, setRequests] = useState([])
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberOptions, setMemberOptions] = useState([])
  const [form, setForm] = useState(emptyForm)

  const fetchRequests = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.get('/community', {
        params: typeFilter ? { type: typeFilter } : {},
      })
      setRequests(response.data || [])
    } catch (error) {
      toast.error('Failed to load community requests.')
    } finally {
      setLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const updateStatus = async (request, status) => {
    setUpdatingId(request.id)

    try {
      await api.put(`/community/${request.id}/status`, { status })
      toast.success(`Request marked as ${status.toLowerCase()}.`)
      fetchRequests()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to update request status.'
      toast.error(message)
    } finally {
      setUpdatingId(null)
    }
  }

  const searchMembers = async (value) => {
    setMemberSearch(value)

    if (!value.trim()) {
      setMemberOptions([])
      return
    }

    try {
      const response = await api.get('/members', { params: { search: value } })
      const members = Array.isArray(response.data) ? response.data : response.data?.data || []
      setMemberOptions(members.slice(0, 6))
    } catch (error) {
      toast.error('Failed to search members.')
    }
  }

  const selectMember = (member) => {
    setForm((current) => ({
      ...current,
      member_id: member.id,
      contact_number: member.phone || current.contact_number,
    }))
    setMemberSearch(`${member.full_name} (${member.member_id})`)
    setMemberOptions([])
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(emptyForm)
    setMemberSearch('')
    setMemberOptions([])
  }

  const submitRequest = async (event) => {
    event.preventDefault()

    if (!form.member_id) {
      toast.error('Please select a member.')
      return
    }

    if (form.request_type === 'Blood' && !form.blood_group_needed) {
      toast.error('Please select the blood group needed.')
      return
    }

    setSaving(true)

    try {
      await api.post('/community', {
        ...form,
        blood_group_needed:
          form.request_type === 'Blood' ? form.blood_group_needed : null,
      })
      toast.success('Community request created successfully.')
      closeModal()
      fetchRequests()
    } catch (error) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to create request.'
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">
            Community Requests
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Track blood donation, fund collection, medical help, and other support.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
        >
          <Plus size={18} />
          New Request
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setTypeFilter(filter.value)}
            className={[
              'rounded-md px-3 py-2 text-sm font-medium',
              typeFilter === filter.value
                ? 'bg-[#1e2a45] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {loading ? (
          <RequestSkeleton />
        ) : requests.length ? (
          requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              updating={updatingId === request.id}
              onUpdateStatus={updateStatus}
            />
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 lg:col-span-2">
            No community requests found.
          </div>
        )}
      </div>

      {modalOpen && (
        <RequestModal
          form={form}
          setForm={setForm}
          saving={saving}
          memberSearch={memberSearch}
          memberOptions={memberOptions}
          onMemberSearch={searchMembers}
          onSelectMember={selectMember}
          onClose={closeModal}
          onSubmit={submitRequest}
        />
      )}
    </section>
  )
}

function RequestModal({
  form,
  setForm,
  saving,
  memberSearch,
  memberOptions,
  onMemberSearch,
  onSelectMember,
  onClose,
  onSubmit,
}) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="max-h-full w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">
            New Community Request
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
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Member</span>
            <input
              value={memberSearch}
              onChange={(event) => onMemberSearch(event.target.value)}
              required
              placeholder="Search by name, phone, or member ID"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
            />
          </label>

          {memberOptions.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
              {memberOptions.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onSelectMember(member)}
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">{member.full_name}</span>
                  <span className="text-slate-500">{member.member_id}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Request Type</span>
              <select
                value={form.request_type}
                onChange={(event) => updateField('request_type', event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                {requestTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            {form.request_type === 'Blood' && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Blood Group Needed</span>
                <select
                  value={form.blood_group_needed}
                  onChange={(event) => updateField('blood_group_needed', event.target.value)}
                  required
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
                >
                  <option value="">Select blood group</option>
                  {bloodGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Contact Number</span>
              <input
                value={form.contact_number}
                onChange={(event) => updateField('contact_number', event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Location</span>
              <input
                value={form.location}
                onChange={(event) => updateField('location', event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <textarea
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              required
              rows={4}
              placeholder={form.request_type === 'Fund Collection' ? 'Mention reason, needed amount, and deadline' : 'Write request details'}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
            />
          </label>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
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
              {saving ? 'Saving...' : 'Post Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RequestCard({ request, updating, onUpdateStatus }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            {request.requester_full_name}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {request.requester_member_id || `Member #${request.member_id}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TypeBadge type={request.request_type} />
          <StatusBadge status={request.status} />
        </div>
      </div>

      {request.request_type === 'Blood' && request.blood_group_needed && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-xs font-medium uppercase text-red-600">
            Blood Group Needed
          </p>
          <p className="mt-1 text-2xl font-semibold text-red-700">
            {request.blood_group_needed}
          </p>
        </div>
      )}

      <p className="mt-4 text-sm leading-6 text-slate-600">
        {request.description}
      </p>

      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <span className="inline-flex items-center gap-2">
          <Phone size={16} className="text-slate-400" />
          {request.contact_number}
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin size={16} className="text-slate-400" />
          {request.location}
        </span>
      </div>

      <div className="mt-4 text-sm text-slate-500">
        Created {formatDate(request.created_at)}
      </div>

      {request.status === 'Open' && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={updating}
            onClick={() => onUpdateStatus(request, 'Fulfilled')}
            className="inline-flex items-center gap-2 rounded-md border border-green-200 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
          >
            <CheckCircle size={16} />
            Mark as Fulfilled
          </button>
          <button
            type="button"
            disabled={updating}
            onClick={() => onUpdateStatus(request, 'Closed')}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <XCircle size={16} />
            Close Request
          </button>
        </div>
      )}
    </article>
  )
}

function TypeBadge({ type }) {
  const classes = {
    Blood: 'bg-red-50 text-red-700 ring-red-600/20',
    'Medical Help': 'bg-blue-50 text-blue-700 ring-blue-600/20',
    'Fund Collection': 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    Other: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        classes[type] || classes.Other
      }`}
    >
      {type}
    </span>
  )
}

function StatusBadge({ status }) {
  const classes = {
    Open: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20',
    Fulfilled: 'bg-green-50 text-green-700 ring-green-600/20',
    Closed: 'bg-slate-100 text-slate-700 ring-slate-600/20',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        classes[status] || classes.Open
      }`}
    >
      {status}
    </span>
  )
}

function RequestSkeleton() {
  return [1, 2, 3, 4].map((item) => (
    <div
      key={item}
      className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="h-5 w-52 rounded bg-slate-200" />
      <div className="mt-3 h-4 w-32 rounded bg-slate-100" />
      <div className="mt-8 h-4 w-full rounded bg-slate-100" />
      <div className="mt-2 h-4 w-3/4 rounded bg-slate-100" />
    </div>
  ))
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

export default Community
