import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Eye, Pencil, Plus, Search, Upload, X } from 'lucide-react'
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
const sortOptions = [
  { label: 'Newest', value: 'newest' },
  { label: 'Member ID', value: 'member_id' },
  { label: 'Member Type', value: 'member_type' },
  { label: 'Group', value: 'membership_group' },
  { label: 'Membership Expired', value: 'membership_expired' },
]

function Members() {
  const [members, setMembers] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 1 })
  const [groups, setGroups] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    group: '',
    member_type: '',
    status: '',
    sort_by: 'member_id',
    expired_window: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [selectedMember, setSelectedMember] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkUpdating, setBulkUpdating] = useState(false)

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

    if (filters.member_type) {
      params.member_type = filters.member_type
    }

    if (filters.status) {
      params.status = filters.status
    }

    if (filters.sort_by) {
      params.sort_by = filters.sort_by
    }

    if (filters.sort_by === 'membership_expired') {
      params.membership_expired = '1'

      if (filters.expired_window) {
        params.expired_window = filters.expired_window
      }
    }

    params.page = pagination.page
    params.limit = pagination.limit

    return params
  }, [filters, pagination.limit, pagination.page])

  const fetchMembers = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.get('/members', { params: queryParams })
      const payload = response.data
      const memberRows = Array.isArray(payload) ? payload : payload.data || []
      setMembers(memberRows)
      setSelectedIds((current) => current.filter((id) => memberRows.some((member) => member.id === id)))
      setPagination((current) => ({
        ...current,
        ...(Array.isArray(payload) ? {} : payload.pagination || {}),
      }))
    } catch (error) {
      toast.error('Failed to load members.')
    } finally {
      setLoading(false)
    }
  }, [queryParams])

  const updateFilter = (changes) => {
    setPagination((current) => ({ ...current, page: 1 }))
    setSelectedIds([])
    setFilters((current) => ({ ...current, ...changes }))
  }

  const updateSort = (sortBy) => {
    setPagination((current) => ({ ...current, page: 1 }))
    setSelectedIds([])
    setFilters((current) => ({
      ...current,
      sort_by: sortBy,
      group: sortBy === 'membership_group' ? current.group : '',
      member_type: sortBy === 'member_type' ? current.member_type : '',
      expired_window: sortBy === 'membership_expired' ? current.expired_window : '',
    }))
  }

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

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/members/import-template', { responseType: 'blob' })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'dhaka-club-members-template.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error('Failed to download CSV template.')
    }
  }

  const importCsv = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file.')
      return
    }

    const payload = new FormData()
    payload.append('file', file)
    setImporting(true)

    try {
      const response = await api.post('/members/import-csv', payload)
      setImportResult(response.data)
      toast.success(`Imported ${response.data.imported || 0} members. Skipped ${response.data.skipped || 0}.`)
      fetchGroups()
      fetchMembers()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to import CSV.')
    } finally {
      setImporting(false)
    }
  }

  const toggleMemberSelection = (id) => {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ))
  }

  const togglePageSelection = () => {
    const pageIds = members.map((member) => member.id)
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id))

    setSelectedIds(allSelected ? [] : pageIds)
  }

  const bulkUpdateStatus = async (status) => {
    if (!selectedIds.length) {
      toast.error('Select at least one member.')
      return
    }

    setBulkUpdating(true)

    try {
      const response = await api.put('/members/bulk/status', {
        member_ids: selectedIds,
        status,
      })
      toast.success(response.data?.message || 'Member statuses updated.')
      setSelectedIds([])
      fetchMembers()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update selected members.')
    } finally {
      setBulkUpdating(false)
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download size={18} />
            CSV Template
          </button>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Upload size={18} />
            {importing ? 'Importing...' : 'Import CSV'}
            <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={importing} className="hidden" />
          </label>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
          >
            <Plus size={18} />
            Add Member
          </button>
        </div>
      </div>

      {importResult && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-slate-950">CSV Import Result</h3>
              <p className="mt-1 text-sm text-slate-600">
                Rows: {importResult.total_rows || 0} | Imported: {importResult.imported || 0} | Skipped: {importResult.skipped || 0} | Default password: {importResult.default_password || '123456'}
              </p>
            </div>
            <button type="button" onClick={() => setImportResult(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
          {Boolean(importResult.errors?.length) && (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-md bg-red-50 p-3 text-sm text-red-800">
              {importResult.errors.slice(0, 50).map((error, index) => (
                <p key={`${error.row}-${index}`}>Row {error.row}: {error.message}</p>
              ))}
              {importResult.errors.length > 50 && <p>And {importResult.errors.length - 50} more errors.</p>}
            </div>
          )}
        </section>
      )}

      <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_180px_220px_220px]">
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
              updateFilter({ search: event.target.value })
            }
            placeholder="Search by name, phone, or member ID"
            className="w-full rounded-md border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
          />
        </label>

        <select
          value={filters.status}
          onChange={(event) =>
            updateFilter({ status: event.target.value })
          }
          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
        >
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Suspended">Suspended</option>
        </select>

        <select
          value={filters.sort_by}
          onChange={(event) =>
            updateSort(event.target.value)
          }
          className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </select>

        {filters.sort_by === 'membership_group' && (
          <select
            value={filters.group}
            onChange={(event) =>
              updateFilter({ group: event.target.value })
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
        )}

        {filters.sort_by === 'member_type' && (
          <select
            value={filters.member_type}
            onChange={(event) =>
              updateFilter({ member_type: event.target.value })
            }
            className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
          >
            <option value="">All Member Types</option>
            {memberTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        )}

        {filters.sort_by === 'membership_expired' && (
          <select
            value={filters.expired_window}
            onChange={(event) =>
              updateFilter({ expired_window: event.target.value })
            }
            className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
          >
            <option value="">All Expired</option>
            <option value="2_months">Expired within last 2 months</option>
          </select>
        )}

      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-600">
          {selectedIds.length} member{selectedIds.length === 1 ? '' : 's'} selected
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!selectedIds.length || bulkUpdating}
            onClick={() => bulkUpdateStatus('Active')}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark Active
          </button>
          <button
            type="button"
            disabled={!selectedIds.length || bulkUpdating}
            onClick={() => bulkUpdateStatus('Inactive')}
            className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark Inactive
          </button>
          <button
            type="button"
            disabled={!selectedIds.length || bulkUpdating}
            onClick={() => bulkUpdateStatus('Suspended')}
            className="rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Suspend
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[640px] overflow-auto">
          <table className="min-w-[1160px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm">
              <tr>
                <Th>
                  <input
                    type="checkbox"
                    checked={members.length > 0 && members.every((member) => selectedIds.includes(member.id))}
                    onChange={togglePageSelection}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </Th>
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
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(member.id)}
                        onChange={() => toggleMemberSelection(member.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </Td>
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
                  <td colSpan="10" className="px-4 py-10 text-center text-slate-500">
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {members.length ? (pagination.page - 1) * pagination.limit + 1 : 0}
            {' '}to {Math.min(pagination.page * pagination.limit, pagination.total)}
            {' '}of {pagination.total} members
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPagination((current) => ({ ...current, page: Math.max(current.page - 1, 1) }))}
              className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-slate-700">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => setPagination((current) => ({ ...current, page: Math.min(current.page + 1, current.total_pages) }))}
              className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
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
              readOnly={readOnly || mode === 'edit'}
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
      <td colSpan="10" className="px-4 py-3">
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
