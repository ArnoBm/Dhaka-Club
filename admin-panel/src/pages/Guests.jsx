import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Plus, X } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  guest_name: '',
  phone: '',
  member_id: '',
  visit_purpose: '',
  vehicle_number: '',
  visit_date: new Date().toISOString().slice(0, 10),
}

function Guests() {
  const [guests, setGuests] = useState([])
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('Pending')
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)

  const loadGuests = useCallback(async () => {
    try {
      const response = await api.get('/guests', { params: { status: status || undefined } })
      setGuests(response.data || [])
    } catch (error) {
      toast.error('Failed to load guest requests.')
    }
  }, [status])

  useEffect(() => {
    loadGuests()
  }, [loadGuests])

  useEffect(() => {
    api.get('/members').then((response) => setMembers(response.data || [])).catch(() => {})
  }, [])

  const createGuest = async (event) => {
    event.preventDefault()
    try {
      await api.post('/guests', form)
      toast.success('Guest request created.')
      setForm(emptyForm)
      setShowForm(false)
      loadGuests()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create guest request.')
    }
  }

  const updateStatus = async (id, action) => {
    try {
      await api.put(`/guests/${id}/${action}`)
      toast.success(action === 'approve' ? 'Guest approved.' : 'Guest rejected.')
      loadGuests()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update guest.')
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Guest Approval Panel</h2>
          <p className="mt-1 text-sm text-slate-500">Approve guests, generate QR passes, and track visit purpose and vehicle logs.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white">
          <Plus size={18} /> New Guest
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {['Pending', 'Approved', 'Rejected', ''].map((item) => (
          <button key={item || 'All'} onClick={() => setStatus(item)} className={`rounded-md px-3 py-2 text-sm font-medium ${status === item ? 'bg-[#1e2a45] text-white' : 'bg-slate-100 text-slate-700'}`}>
            {item || 'All'}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {guests.map((guest) => (
          <article key={guest.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-950">{guest.guest_name}</h3>
                <p className="mt-1 text-sm text-slate-500">Host: {guest.host_member_name || 'Not assigned'}</p>
              </div>
              <Badge status={guest.status} />
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
              <Info label="Visit Purpose" value={guest.visit_purpose} />
              <Info label="Visit Date" value={guest.visit_date} />
              <Info label="Vehicle Log" value={guest.vehicle_number || '-'} />
              <Info label="Guest QR" value={guest.qr_code || 'Not generated'} />
            </div>
            {guest.status === 'Pending' && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => updateStatus(guest.id, 'approve')} className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white">
                  <Check size={16} /> Approve
                </button>
                <button onClick={() => updateStatus(guest.id, 'reject')} className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white">
                  <X size={16} /> Reject
                </button>
              </div>
            )}
          </article>
        ))}
        {!guests.length && <p className="text-sm text-slate-500">No guest requests found.</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form onSubmit={createGuest} className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-950">New Guest Request</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input label="Guest Name" value={form.guest_name} onChange={(value) => setForm({ ...form, guest_name: value })} required />
              <Input label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
              <Select label="Host Member" value={form.member_id} onChange={(value) => setForm({ ...form, member_id: value })} options={['', ...members.map((member) => ({ label: `${member.full_name} (${member.member_id})`, value: member.id }))]} />
              <Input label="Visit Date" type="date" value={form.visit_date} onChange={(value) => setForm({ ...form, visit_date: value })} required />
              <Input label="Vehicle Log" value={form.vehicle_number} onChange={(value) => setForm({ ...form, vehicle_number: value })} />
              <Input label="Visit Purpose" value={form.visit_purpose} onChange={(value) => setForm({ ...form, visit_purpose: value })} required />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button>
              <button className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white">Save</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function Input({ label, value, onChange, type = 'text', required }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]" /></label>
}

function Select({ label, value, onChange, options }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]">{options.map((option) => { const item = typeof option === 'string' ? { label: option || 'Select', value: option } : option; return <option key={item.value || 'empty'} value={item.value}>{item.label}</option> })}</select></label>
}

function Info({ label, value }) {
  return <div><p className="text-xs uppercase text-slate-400">{label}</p><p className="font-medium text-slate-800">{value}</p></div>
}

function Badge({ status }) {
  const colors = { Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20', Approved: 'bg-green-50 text-green-700 ring-green-600/20', Rejected: 'bg-red-50 text-red-700 ring-red-600/20' }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors[status]}`}>{status}</span>
}

export default Guests
