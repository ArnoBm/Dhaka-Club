import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Plus, Trash2, X } from 'lucide-react'
import api from '../api/axios'

const relationOptions = [
  'Spouse',
  'Son',
  'Daughter',
  'Father',
  'Mother',
  'Brother',
  'Sister',
  'Relative',
  'Friend',
  'Colleague',
  'Business Guest',
  'Client',
  'Vendor',
  'Service Provider',
  'Driver',
  'Domestic Staff',
  'Family Guest',
  'Club Guest',
  'Official Guest',
  'Other',
]

const emptyGuest = { guest_name: '', phone: '', host_relation: '' }

const emptyForm = {
  member_id: '',
  visit_purpose: '',
  vehicle_number: '',
  visit_date: new Date().toISOString().slice(0, 10),
  guests: [{ ...emptyGuest }],
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
    api.get('/members').then((response) => setMembers(Array.isArray(response.data) ? response.data : response.data?.data || [])).catch(() => {})
  }, [])

  const createGuest = async (event) => {
    event.preventDefault()
    try {
      const payload = {
        member_id: form.member_id,
        visit_purpose: form.visit_purpose,
        vehicle_number: form.vehicle_number,
        visit_date: form.visit_date,
        guests: form.guests,
      }
      const response = await api.post('/guests', payload)
      toast.success(`${response.data.count || 1} guest request${Number(response.data.count || 1) > 1 ? 's' : ''} created.`)
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

  const updateGuestRow = (index, field, value) => {
    setForm((current) => ({
      ...current,
      guests: current.guests.map((guest, guestIndex) => (
        guestIndex === index ? { ...guest, [field]: value } : guest
      )),
    }))
  }

  const addGuestRow = () => {
    setForm((current) => ({ ...current, guests: [...current.guests, { ...emptyGuest }] }))
  }

  const removeGuestRow = (index) => {
    setForm((current) => ({
      ...current,
      guests: current.guests.length === 1 ? current.guests : current.guests.filter((_, guestIndex) => guestIndex !== index),
    }))
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Guest Approval Panel</h2>
          <p className="mt-1 text-sm text-slate-500">Approve guests, generate QR passes, and track host relation, purpose, and vehicle logs.</p>
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
              <Info label="Relation" value={guest.host_relation || '-'} />
              <Info label="Phone" value={guest.phone || '-'} />
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
          <form onSubmit={createGuest} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">New Guest Request</h3>
                <p className="mt-1 text-sm text-slate-500">One host can bring multiple guests in the same request.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Select label="Host Member" value={form.member_id} onChange={(value) => setForm({ ...form, member_id: value })} options={['', ...members.map((member) => ({ label: `${member.full_name} (${member.member_id})`, value: member.id }))]} />
              <Input label="Visit Date" type="date" value={form.visit_date} onChange={(value) => setForm({ ...form, visit_date: value })} required />
              <Input label="Vehicle Log" value={form.vehicle_number} onChange={(value) => setForm({ ...form, vehicle_number: value })} />
              <Input label="Visit Purpose" value={form.visit_purpose} onChange={(value) => setForm({ ...form, visit_purpose: value })} required />
            </div>

            <div className="mt-5 rounded-lg border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <h4 className="font-semibold text-slate-950">Guests</h4>
                <button type="button" onClick={addGuestRow} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <Plus size={16} /> Add Guest
                </button>
              </div>
              <div className="space-y-3 p-4">
                {form.guests.map((guest, index) => (
                  <div key={index} className="grid gap-3 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <Input label={`Guest ${index + 1} Name`} value={guest.guest_name} onChange={(value) => updateGuestRow(index, 'guest_name', value)} required />
                    <Input label="Phone" value={guest.phone} onChange={(value) => updateGuestRow(index, 'phone', value)} />
                    <SearchableRelation value={guest.host_relation} onChange={(value) => updateGuestRow(index, 'host_relation', value)} />
                    <div className="flex items-end">
                      <button type="button" onClick={() => removeGuestRow(index)} disabled={form.guests.length === 1} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium">Cancel</button>
              <button className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white">Save Requests</button>
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

function SearchableRelation({ value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">Relation With Host</span>
      <input
        list="guest-relation-options"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search or select relation"
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]"
      />
      <datalist id="guest-relation-options">
        {relationOptions.map((relation) => <option key={relation} value={relation} />)}
      </datalist>
    </label>
  )
}

function Info({ label, value }) {
  return <div><p className="text-xs uppercase text-slate-400">{label}</p><p className="font-medium text-slate-800">{value}</p></div>
}

function Badge({ status }) {
  const colors = { Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20', Approved: 'bg-green-50 text-green-700 ring-green-600/20', Rejected: 'bg-red-50 text-red-700 ring-red-600/20' }
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${colors[status]}`}>{status}</span>
}

export default Guests
