import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle, CreditCard, Search, X } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  member_id: '',
  renewal_date: today(),
  expiry_date: '',
  amount: '',
}

function Renewals() {
  const [renewals, setRenewals] = useState([])
  const [expiring, setExpiring] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberResults, setMemberResults] = useState([])
  const [selectedMember, setSelectedMember] = useState(null)
  const [searchingMembers, setSearchingMembers] = useState(false)

  const fetchRenewals = async () => {
    setLoading(true)

    try {
      const [renewalsResponse, expiringResponse] = await Promise.all([
        api.get('/renewals'),
        api.get('/renewals/expiring'),
      ])
      setRenewals(renewalsResponse.data || [])
      setExpiring(expiringResponse.data || [])
    } catch (error) {
      toast.error('Failed to load renewals.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRenewals()
  }, [])

  useEffect(() => {
    if (!modalOpen || memberSearch.trim().length < 2) {
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
  }, [memberSearch, modalOpen])

  const openModal = () => {
    setForm(emptyForm)
    setMemberSearch('')
    setSelectedMember(null)
    setMemberResults([])
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(emptyForm)
    setMemberSearch('')
    setSelectedMember(null)
    setMemberResults([])
  }

  const selectMember = (member) => {
    setSelectedMember(member)
    setForm((current) => ({ ...current, member_id: member.id }))
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
      await api.post('/renewals', {
        member_id: form.member_id,
        renewal_date: form.renewal_date,
        expiry_date: form.expiry_date,
        amount: Number(form.amount || 0),
      })
      toast.success('Renewal created successfully.')
      closeModal()
      fetchRenewals()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to create renewal. Please try again.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const markAsPaid = async (renewal) => {
    setUpdatingId(renewal.id)

    try {
      await api.put(`/renewals/${renewal.id}`, { payment_status: 'Paid' })
      toast.success('Renewal marked as paid.')
      fetchRenewals()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to update renewal.'
      toast.error(message)
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section>
      {expiring.length > 0 && (
        <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
          Warning: {expiring.length} memberships are expiring within the next 30 days.
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Card Renewals</h2>
          <p className="mt-1 text-sm text-slate-500">
            Process membership card renewals and payment status.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
        >
          <CreditCard size={18} />
          Add Renewal
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Member Name</Th>
                <Th>Phone</Th>
                <Th>Renewal Date</Th>
                <Th>New Expiry Date</Th>
                <Th>Amount</Th>
                <Th>Payment Status</Th>
                <Th>Processed By</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton />
              ) : renewals.length ? (
                renewals.map((renewal) => (
                  <tr key={renewal.id} className="hover:bg-slate-50/70">
                    <Td>{renewal.full_name}</Td>
                    <Td>{renewal.phone}</Td>
                    <Td>{formatDate(renewal.renewal_date)}</Td>
                    <Td>{formatDate(renewal.expiry_date)}</Td>
                    <Td>৳{renewal.amount || 0}</Td>
                    <Td>
                      <PaymentBadge status={renewal.payment_status} />
                    </Td>
                    <Td>{renewal.processed_by_name || renewal.processed_by || '-'}</Td>
                    <Td>
                      {renewal.payment_status === 'Pending' ? (
                        <button
                          type="button"
                          disabled={updatingId === renewal.id}
                          onClick={() => markAsPaid(renewal)}
                          className="inline-flex items-center gap-2 rounded-md border border-green-200 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
                        >
                          <CheckCircle size={15} />
                          Mark as Paid
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">No actions</span>
                      )}
                    </Td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-slate-500">
                    No renewals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <RenewalModal
          form={form}
          setForm={setForm}
          memberSearch={memberSearch}
          setMemberSearch={setMemberSearch}
          memberResults={memberResults}
          selectedMember={selectedMember}
          searchingMembers={searchingMembers}
          saving={saving}
          onSelectMember={selectMember}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  )
}

function RenewalModal({
  form,
  setForm,
  memberSearch,
  setMemberSearch,
  memberResults,
  selectedMember,
  searchingMembers,
  saving,
  onSelectMember,
  onClose,
  onSubmit,
}) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">Add Renewal</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-6 py-5">
          <div className="space-y-4">
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
                    setMemberSearch(event.target.value)
                    updateField('member_id', '')
                  }}
                  placeholder="Search by name, phone, or member ID"
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
                        onClick={() => onSelectMember(member)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-950">
                          {member.full_name}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {member.member_id} · {member.phone}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {selectedMember && (
                <p className="mt-2 text-sm text-green-700">
                  Selected: {selectedMember.full_name} ({selectedMember.member_id})
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Renewal Date"
                type="date"
                value={form.renewal_date}
                onChange={(value) => updateField('renewal_date', value)}
                required
              />
              <TextField
                label="New Expiry Date"
                type="date"
                value={form.expiry_date}
                onChange={(value) => updateField('expiry_date', value)}
                required
              />
              <TextField
                label="Amount"
                type="number"
                value={form.amount}
                onChange={(value) => updateField('amount', value)}
                min="0"
                step="0.01"
                required
              />
            </div>
          </div>

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
              {saving ? 'Saving...' : 'Save Renewal'}
            </button>
          </div>
        </form>
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

function PaymentBadge({ status }) {
  const classes = {
    Pending: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    Paid: 'bg-green-50 text-green-700 ring-green-600/20',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        classes[status] || classes.Pending
      }`}
    >
      {status}
    </span>
  )
}

function TableSkeleton() {
  return [1, 2, 3, 4, 5].map((item) => (
    <tr key={item}>
      <td colSpan="8" className="px-4 py-3">
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

export default Renewals
