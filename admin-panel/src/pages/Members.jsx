import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, Pencil, Plus, Search, X } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  member_id: '',
  full_name: '',
  email: '',
  phone: '',
  blood_group: '',
  date_of_birth: '',
  occupation: '',
  address: '',
  member_type: 'General Member',
  membership_group: '',
  membership_expiry: '',
}

const bloodGroups = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const memberTypes = [
  'Life Member',
  'General Member',
  'Honorary Member',
  'Special Member',
  'Officers of Defense Forces',
]
const legacyMemberTypeMap = {
  Regular: 'General Member',
  Life: 'Life Member',
  Honorary: 'Honorary Member',
  Associate: 'Special Member',
}

function Members() {
  const [members, setMembers] = useState([])
  const [groups, setGroups] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    group: '',
    status: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const isModalOpen = Boolean(modalMode)
  const isReadOnly = modalMode === 'view'
  const isEditing = modalMode === 'edit'

  const queryParams = useMemo(() => {
    const params = {}

    if (filters.search.trim()) {
      params.search = filters.search.trim()
    }

    if (filters.group) {
      params.group = filters.group
    }

    if (filters.status) {
      params.status = filters.status
    }

    return params
  }, [filters])

  const fetchMembers = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.get('/members', { params: queryParams })
      setMembers(response.data || [])
    } catch (error) {
      toast.error('Failed to load members.')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  const fetchGroups = useCallback(async () => {
    try {
      const response = await api.get('/members/groups')
      setGroups(response.data || [])
    } catch (error) {
      toast.error('Failed to load member groups.')
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const openAddModal = () => {
    setSelectedMember(null)
    setForm(emptyForm)
    setModalMode('add')
  }

  const openEditModal = (member) => {
    setSelectedMember(member)
    setForm(memberToForm(member))
    setModalMode('edit')
  }

  const openViewModal = (member) => {
    setSelectedMember(member)
    setForm(memberToForm(member))
    setModalMode('view')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedMember(null)
    setForm(emptyForm)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      const payload = normalizePayload(form)

      if (isEditing) {
        await api.put(`/members/${selectedMember.id}`, payload)
        toast.success('Member updated successfully.')
      } else {
        await api.post('/members', payload)
        toast.success('Member added successfully.')
      }

      closeModal()
      fetchGroups()
      fetchMembers()
    } catch (error) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Failed to save member. Please try again.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Members</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage member records, contact details, and membership status.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
        >
          <Plus size={18} />
          Add Member
        </button>
      </div>

      <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_180px]">
        <label className="relative">
          <span className="sr-only">Search members</span>
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(event) =>
              setFilters((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Search by name, phone, or member ID"
            className="w-full rounded-md border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
          />
        </label>

        <select
          value={filters.group}
          onChange={(event) =>
            setFilters((current) => ({ ...current, group: event.target.value }))
          }
          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
        >
          <option value="">All Groups</option>
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) =>
            setFilters((current) => ({ ...current, status: event.target.value }))
          }
          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Member ID</Th>
                <Th>Full Name</Th>
                <Th>Phone</Th>
                <Th>Blood Group</Th>
                <Th>Member Type</Th>
                <Th>Group</Th>
                <Th>Membership Expiry</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton />
              ) : members.length ? (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50/70">
                    <Td>{member.member_id}</Td>
                    <Td>
                      <div className="font-medium text-slate-950">
                        {member.full_name}
                      </div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </Td>
                    <Td>{member.phone}</Td>
                    <Td>{member.blood_group || '-'}</Td>
                    <Td>{formatMemberType(member.member_type)}</Td>
                    <Td>{member.membership_group || '-'}</Td>
                    <Td>{formatDate(member.membership_expiry)}</Td>
                    <Td>
                      <StatusBadge status={member.status} />
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openViewModal(member)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={14} />
                          View
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="px-4 py-10 text-center text-slate-500">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <MemberModal
          form={form}
          setForm={setForm}
          mode={modalMode}
          readOnly={isReadOnly}
          saving={saving}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  )
}

function MemberModal({ form, setForm, mode, readOnly, saving, onClose, onSubmit }) {
  const title =
    mode === 'add' ? 'Add Member' : mode === 'edit' ? 'Edit Member' : 'Member Details'

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-4 sm:py-8">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:max-h-[calc(100vh-4rem)]">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Member ID"
              value={form.member_id}
              onChange={(value) => updateField('member_id', value)}
              readOnly={readOnly}
              required
            />
            <TextField
              label="Full Name"
              value={form.full_name}
              onChange={(value) => updateField('full_name', value)}
              readOnly={readOnly}
              required
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => updateField('email', value)}
              readOnly={readOnly}
              required
            />
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(value) => updateField('phone', value)}
              readOnly={readOnly}
              required
            />
            <SelectField
              label="Blood Group"
              value={form.blood_group}
              onChange={(value) => updateField('blood_group', value)}
              options={bloodGroups}
              readOnly={readOnly}
            />
            <TextField
              label="Date of Birth"
              type="date"
              value={form.date_of_birth}
              onChange={(value) => updateField('date_of_birth', value)}
              readOnly={readOnly}
            />
            <TextField
              label="Occupation"
              value={form.occupation}
              onChange={(value) => updateField('occupation', value)}
              readOnly={readOnly}
            />
            <SelectField
              label="Member Type"
              value={form.member_type}
              onChange={(value) => updateField('member_type', value)}
              options={memberTypes}
              readOnly={readOnly}
            />
            <TextField
              label="Membership Group"
              value={form.membership_group}
              onChange={(value) => updateField('membership_group', value)}
              readOnly={readOnly}
            />
            <TextField
              label="Membership Expiry"
              type="date"
              value={form.membership_expiry}
              onChange={(value) => updateField('membership_expiry', value)}
              readOnly={readOnly}
            />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                Address
              </label>
              <textarea
                value={form.address}
                onChange={(event) => updateField('address', event.target.value)}
                readOnly={readOnly}
                rows={3}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10 disabled:bg-slate-50"
              />
            </div>
          </div>

          <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-3 border-t border-slate-200 bg-white px-6 pt-5 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263657] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? 'Saving...' : 'Save Member'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, type = 'text', readOnly, required }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        required={required}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10 read-only:bg-slate-50"
      />
    </label>
  )
}

function SelectField({ label, value, onChange, options, readOnly }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={readOnly}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10 disabled:bg-slate-50"
      >
        {options.map((option) => (
          <option key={option || 'none'} value={option}>
            {option || 'Select'}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatusBadge({ status }) {
  const classes = {
    Active: 'bg-green-50 text-green-700 ring-green-600/20',
    Inactive: 'bg-red-50 text-red-700 ring-red-600/20',
    Suspended: 'bg-orange-50 text-orange-700 ring-orange-600/20',
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

function TableSkeleton() {
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

function memberToForm(member) {
  return {
    member_id: member.member_id || '',
    full_name: member.full_name || '',
    email: member.email || '',
    phone: member.phone || '',
    blood_group: member.blood_group || '',
    date_of_birth: toDateInput(member.date_of_birth),
    occupation: member.occupation || '',
    address: member.address || '',
    member_type: normalizeMemberType(member.member_type),
    membership_group: member.membership_group || '',
    membership_expiry: toDateInput(member.membership_expiry),
  }
}

function normalizePayload(form) {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [
      key,
      key === 'member_type' ? normalizeMemberType(value) : value === '' ? null : value,
    ]),
  )
}

function normalizeMemberType(value) {
  if (!value) {
    return 'General Member'
  }

  return legacyMemberTypeMap[value] || value
}

function formatMemberType(value) {
  return normalizeMemberType(value)
}

function toDateInput(value) {
  if (!value) {
    return ''
  }

  return String(value).slice(0, 10)
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

export default Members
