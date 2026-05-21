import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Plus } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  member_id: '',
  amount: '',
  provider: 'Manual',
  purpose: '',
  reference_no: '',
  payment_date: new Date().toISOString().slice(0, 10),
  status: 'Paid',
}

function Payments() {
  const [payments, setPayments] = useState([])
  const [members, setMembers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const loadPayments = useCallback(async () => {
    try {
      const response = await api.get('/payments')
      setPayments(response.data || [])
    } catch (error) {
      toast.error('Failed to load payments.')
    }
  }, [])

  useEffect(() => {
    loadPayments()
    api.get('/members').then((response) => setMembers(response.data || [])).catch(() => {})
  }, [loadPayments])

  const savePayment = async (event) => {
    event.preventDefault()
    try {
      await api.post('/payments', form)
      toast.success('Payment recorded.')
      setForm(emptyForm)
      setShowForm(false)
      loadPayments()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record payment.')
    }
  }

  const exportInvoices = () => {
    const header = ['Invoice', 'Member', 'Amount', 'Provider', 'Purpose', 'Status', 'Date']
    const rows = payments.map((payment) => [payment.invoice_no, payment.full_name || '', payment.amount, payment.provider, payment.purpose, payment.status, payment.payment_date])
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'dhaka-club-payments.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Payment Management</h2>
          <p className="mt-1 text-sm text-slate-500">Manual payment entry, future provider tracking, reconciliation, and invoice export.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportInvoices} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"><Download size={18} /> Export</button>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={18} /> Manual Payment</button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><Th>Invoice</Th><Th>Member</Th><Th>Amount</Th><Th>Provider</Th><Th>Purpose</Th><Th>Status</Th><Th>Date</Th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => <tr key={payment.id}><Td>{payment.invoice_no}</Td><Td>{payment.full_name || '-'}</Td><Td>৳{Number(payment.amount || 0).toFixed(2)}</Td><Td>{payment.provider}</Td><Td>{payment.purpose}</Td><Td><Badge status={payment.status} /></Td><Td>{payment.payment_date}</Td></tr>)}
              {!payments.length && <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No payments found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={savePayment} className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">Manual Payment Entry</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Select label="Member" value={form.member_id} onChange={(value) => setForm({ ...form, member_id: value })} options={['', ...members.map((member) => ({ label: `${member.full_name} (${member.member_id})`, value: member.id }))]} />
              <Input label="Amount" type="number" value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} required />
              <Select label="Provider" value={form.provider} onChange={(value) => setForm({ ...form, provider: value })} options={['Manual', 'bKash', 'Nagad', 'Card']} />
              <Input label="Purpose" value={form.purpose} onChange={(value) => setForm({ ...form, purpose: value })} required />
              <Input label="Reference No" value={form.reference_no} onChange={(value) => setForm({ ...form, reference_no: value })} />
              <Input label="Payment Date" type="date" value={form.payment_date} onChange={(value) => setForm({ ...form, payment_date: value })} required />
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

function Input({ label, value, onChange, type = 'text', required }) { return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]" /></label> }
function Select({ label, value, onChange, options }) { return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]">{options.map((option) => { const item = typeof option === 'string' ? { label: option || 'Select', value: option } : option; return <option key={item.value || 'empty'} value={item.value}>{item.label}</option> })}</select></label> }
function Badge({ status }) { const colors = { Paid: 'bg-green-50 text-green-700 ring-green-600/20', Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20', Failed: 'bg-red-50 text-red-700 ring-red-600/20', Refunded: 'bg-slate-100 text-slate-700 ring-slate-600/20' }; return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors[status]}`}>{status}</span> }
function Th({ children }) { return <th className="px-4 py-3 font-semibold">{children}</th> }
function Td({ children }) { return <td className="whitespace-nowrap px-4 py-3 text-slate-700">{children}</td> }

export default Payments
