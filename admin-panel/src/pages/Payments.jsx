import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Filter, Plus, RefreshCcw } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  member_id: '',
  amount: '',
  provider: 'Manual',
  purpose: '',
  reference_no: '',
  payment_date: new Date().toISOString().slice(0, 10),
  status: 'Paid',
  related_type: '',
  related_id: '',
}

function Payments() {
  const [payments, setPayments] = useState([])
  const [members, setMembers] = useState([])
  const [sources, setSources] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [filters, setFilters] = useState({ status: '', provider: '', source_type: '', search: '' })

  const loadPayments = useCallback(async () => {
    try {
      const response = await api.get('/payments', { params: cleanParams(filters) })
      setPayments(response.data || [])
    } catch (error) {
      toast.error('Failed to load payments.')
    }
  }, [filters])

  const loadSources = async () => {
    try {
      const response = await api.get('/payments/sources')
      setSources(response.data || [])
    } catch (error) {
      toast.error('Failed to load linked payment sources.')
    }
  }

  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  useEffect(() => {
    api.get('/members').then((response) => setMembers(Array.isArray(response.data) ? response.data : response.data?.data || [])).catch(() => {})
    loadSources()
  }, [])

  const totals = useMemo(() => {
    return payments.reduce((summary, payment) => {
      const amount = Number(payment.amount || 0)
      summary.total += amount
      if (payment.status === 'Paid') summary.paid += amount
      if (payment.status === 'Pending') summary.pending += amount
      return summary
    }, { total: 0, paid: 0, pending: 0 })
  }, [payments])

  const savePayment = async (event) => {
    event.preventDefault()
    try {
      await api.post('/payments', form)
      toast.success('Payment recorded and linked.')
      setForm(emptyForm)
      setShowForm(false)
      await Promise.all([loadPayments(), loadSources()])
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment.')
    }
  }

  const selectSource = (sourceKey) => {
    if (!sourceKey) {
      setForm({ ...form, related_type: '', related_id: '' })
      return
    }

    const source = sources.find((item) => sourceValue(item) === sourceKey)

    if (!source) return

    setForm({
      ...form,
      member_id: source.member_id || '',
      amount: source.amount || '',
      purpose: source.purpose || '',
      reference_no: source.reference_no || '',
      related_type: source.related_type,
      related_id: source.related_id,
    })
  }

  const exportInvoices = () => {
    const header = ['Invoice', 'Source', 'Member', 'Amount', 'Provider', 'Purpose', 'Status', 'Date']
    const rows = payments.map((payment) => [
      payment.invoice_no,
      payment.source_label || payment.related_type,
      payment.full_name || '',
      payment.amount,
      payment.provider,
      payment.purpose,
      payment.status,
      payment.payment_date,
    ])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'dhaka-club-payments.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const applyFilters = (event) => {
    event.preventDefault()
    loadPayments()
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Payment Management</h2>
          <p className="mt-1 text-sm text-slate-500">Unified ledger for event tickets, card renewals, venue bookings, and manual payments.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportInvoices} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"><Download size={18} /> Export</button>
          <button onClick={() => { setShowForm(true); loadSources() }} className="inline-flex items-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={18} /> Record Payment</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Summary label="Ledger Total" value={totals.total} />
        <Summary label="Paid" value={totals.paid} tone="text-emerald-700" />
        <Summary label="Pending" value={totals.pending} tone="text-amber-700" />
      </div>

      <form onSubmit={applyFilters} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-5">
          <Input label="Search" value={filters.search} onChange={(value) => setFilters({ ...filters, search: value })} />
          <Select label="Status" value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={['', 'Pending', 'Paid', 'Failed', 'Refunded']} />
          <Select label="Provider" value={filters.provider} onChange={(value) => setFilters({ ...filters, provider: value })} options={['', 'Manual', 'bKash', 'Nagad', 'Card', 'Demo Gateway']} />
          <Select label="Source" value={filters.source_type} onChange={(value) => setFilters({ ...filters, source_type: value })} options={['', 'Manual', 'Event Registration', 'Card Renewal', 'Venue Booking']} />
          <div className="flex items-end gap-2">
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"><Filter size={16} /> Filter</button>
            <button type="button" onClick={() => setFilters({ status: '', provider: '', source_type: '', search: '' })} className="rounded-md border border-slate-300 px-3 py-2.5 text-slate-600"><RefreshCcw size={16} /></button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><Th>Invoice</Th><Th>Source</Th><Th>Member</Th><Th>Amount</Th><Th>Provider</Th><Th>Purpose</Th><Th>Status</Th><Th>Date</Th><Th>Recorded By</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => (
                <tr key={`${payment.related_type}-${payment.id}`}>
                  <Td>{payment.invoice_no}</Td>
                  <Td><SourceBadge source={payment.source_label || payment.related_type} /></Td>
                  <Td>{payment.full_name || '-'}{payment.member_code ? <span className="block text-xs text-slate-400">{payment.member_code}</span> : null}</Td>
                  <Td>{formatMoney(payment.amount)}</Td>
                  <Td>{payment.provider}</Td>
                  <Td>{payment.purpose}</Td>
                  <Td><Badge status={payment.status} /></Td>
                  <Td>{formatDate(payment.payment_date)}</Td>
                  <Td>{payment.recorded_by_name || '-'}</Td>
                </tr>
              ))}
              {!payments.length && <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-500">No payments found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={savePayment} className="w-full max-w-3xl rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Record Linked Payment</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Select
                label="Link Existing Source"
                value={form.related_type && form.related_id ? `${form.related_type}:${form.related_id}` : ''}
                onChange={selectSource}
                options={[
                  { label: 'Manual payment', value: '' },
                  ...sources.map((source) => ({ label: `${source.related_type} | ${source.full_name} | ${formatMoney(source.amount)} | ${source.purpose}`, value: sourceValue(source) })),
                ]}
              />
              <Select label="Member" value={form.member_id} onChange={(value) => setForm({ ...form, member_id: value })} options={['', ...members.map((member) => ({ label: `${member.full_name} (${member.member_id})`, value: member.id }))]} />
              <Input label="Amount" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} required />
              <Select label="Provider" value={form.provider} onChange={(value) => setForm({ ...form, provider: value })} options={['Manual', 'bKash', 'Nagad', 'Card']} />
              <Input label="Purpose" value={form.purpose} onChange={(value) => setForm({ ...form, purpose: value })} required />
              <Input label="Reference No" value={form.reference_no} onChange={(value) => setForm({ ...form, reference_no: value })} />
              <Input label="Payment Date" type="date" value={form.payment_date} onChange={(value) => setForm({ ...form, payment_date: value })} required />
              <Select label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={['Paid', 'Pending', 'Failed', 'Refunded']} />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button>
              <button className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white">Save Payment</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function Summary({ label, value, tone = 'text-slate-950' }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{formatMoney(value)}</p></article>
}

function Input({ label, value, onChange, type = 'text', required }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]" /></label>
}

function Select({ label, value, onChange, options }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]">{options.map((option) => { const item = typeof option === 'string' ? { label: option || 'All', value: option } : option; return <option key={item.value || 'empty'} value={item.value}>{item.label}</option> })}</select></label>
}

function Badge({ status }) {
  const colors = { Paid: 'bg-green-50 text-green-700 ring-green-600/20', Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20', Failed: 'bg-red-50 text-red-700 ring-red-600/20', Refunded: 'bg-slate-100 text-slate-700 ring-slate-600/20' }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors[status] || colors.Pending}`}>{status}</span>
}

function SourceBadge({ source }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-500/20">{source}</span>
}

function Th({ children }) { return <th className="px-4 py-3 font-semibold">{children}</th> }
function Td({ children }) { return <td className="px-4 py-3 text-slate-700">{children}</td> }
function sourceValue(source) { return `${source.related_type}:${source.related_id}` }
function cleanParams(params) { return Object.fromEntries(Object.entries(params).filter(([, value]) => value)) }
function formatDate(value) { return value ? new Date(value).toLocaleDateString() : '-' }
function formatMoney(value) { return `BDT ${Number(value || 0).toFixed(2)}` }

export default Payments
