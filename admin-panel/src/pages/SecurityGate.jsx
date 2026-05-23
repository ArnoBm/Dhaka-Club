import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  BadgeCheck,
  BadgeX,
  CreditCard,
  DoorOpen,
  IdCard,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import api from '../api/axios'

const blankCard = {
  card_uid: '',
  card_label: '',
  status: 'Available',
  notes: '',
}

const blankVisitor = {
  visitor_name: '',
  phone: '',
  id_number: '',
  visitor_type: 'Walk-in',
  visit_purpose: '',
  host_name: '',
  host_phone: '',
  host_department: '',
  vehicle_number: '',
  rfid_card_id: '',
  security_note: '',
}

function SecurityGate() {
  const [data, setData] = useState(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [cards, setCards] = useState([])
  const [visitors, setVisitors] = useState([])
  const [filters, setFilters] = useState({ search: '', status: '', date: new Date().toISOString().slice(0, 10) })
  const [cardForm, setCardForm] = useState(blankCard)
  const [editingCardId, setEditingCardId] = useState(null)
  const [visitorForm, setVisitorForm] = useState(blankVisitor)
  const [scanUid, setScanUid] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const availableCards = useMemo(() => cards.filter((card) => card.status === 'Available'), [cards])
  const insideVisitors = useMemo(() => visitors.filter((visitor) => visitor.entry_status === 'Inside'), [visitors])

  const loadAll = async () => {
    setLoading(true)

    try {
      const [dashboardResponse, cardResponse, visitorResponse] = await Promise.all([
        api.get('/security/dashboard', { params: { date } }),
        api.get('/security/rfid-cards'),
        api.get('/security/visitors', { params: filters }),
      ])

      setData(dashboardResponse.data)
      setCards(cardResponse.data)
      setVisitors(visitorResponse.data)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load security data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, filters.date, filters.status])

  const cardsSummary = [
    { label: "Today's Entries", value: data?.todays_entries || 0, icon: Users, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Visitors Inside', value: data?.currently_inside || 0, icon: IdCard, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Available RFID Cards', value: data?.available_cards || 0, icon: CreditCard, tone: 'bg-slate-100 text-slate-700' },
    { label: 'Blocked Alerts', value: data?.blocked_entries || 0, icon: ShieldAlert, tone: 'bg-red-50 text-red-700' },
  ]

  const saveCard = async (event) => {
    event.preventDefault()

    try {
      if (editingCardId) {
        await api.put(`/security/rfid-cards/${editingCardId}`, cardForm)
        toast.success('RFID card updated.')
      } else {
        await api.post('/security/rfid-cards', cardForm)
        toast.success('RFID card added.')
      }

      setCardForm(blankCard)
      setEditingCardId(null)
      loadAll()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save RFID card.')
    }
  }

  const editCard = (card) => {
    setEditingCardId(card.id)
    setCardForm({
      card_uid: card.card_uid || '',
      card_label: card.card_label || '',
      status: card.status || 'Available',
      notes: card.notes || '',
    })
  }

  const assignVisitor = async (event) => {
    event.preventDefault()

    try {
      await api.post('/security/visitors', visitorForm)
      toast.success('Visitor pass assigned.')
      setVisitorForm(blankVisitor)
      loadAll()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to assign visitor pass.')
    }
  }

  const markExit = async (visitorId) => {
    try {
      await api.put(`/security/visitors/${visitorId}/exit`)
      toast.success('Visitor exit recorded.')
      loadAll()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to record visitor exit.')
    }
  }

  const scanCard = async (event) => {
    event.preventDefault()
    setScanResult(null)

    try {
      const response = await api.post('/security/rfid-scan', { card_uid: scanUid })
      setScanResult(response.data)
      toast.success(response.data.message || 'RFID scan processed.')
      setScanUid('')
      loadAll()
    } catch (error) {
      setScanResult(error.response?.data || { entry_allowed: false, message: 'RFID scan failed.' })
      toast.error(error.response?.data?.message || 'RFID scan failed.')
    }
  }

  const applySearch = (event) => {
    event.preventDefault()
    loadAll()
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Security Gate</h2>
          <p className="mt-1 text-sm text-slate-500">RFID visitor passes, gate entry, exit release, and security activity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
          <button type="button" onClick={loadAll} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cardsSummary.map((card) => <StatCard key={card.label} card={card} />)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={assignVisitor} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <UserRoundPlus size={20} className="text-slate-700" />
            <h3 className="font-semibold text-slate-950">Assign Visitor RFID Pass</h3>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Visitor Name" value={visitorForm.visitor_name} onChange={(value) => setVisitorForm({ ...visitorForm, visitor_name: value })} required />
            <Field label="Phone" value={visitorForm.phone} onChange={(value) => setVisitorForm({ ...visitorForm, phone: value })} />
            <Field label="ID / Reference" value={visitorForm.id_number} onChange={(value) => setVisitorForm({ ...visitorForm, id_number: value })} />
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Visitor Type
              <select value={visitorForm.visitor_type} onChange={(event) => setVisitorForm({ ...visitorForm, visitor_type: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                {['Walk-in', 'Vendor', 'Delivery', 'Contractor', 'Service Provider', 'Interview / Meeting', 'Other'].map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <Field label="Called By / Host" value={visitorForm.host_name} onChange={(value) => setVisitorForm({ ...visitorForm, host_name: value })} />
            <Field label="Host Phone" value={visitorForm.host_phone} onChange={(value) => setVisitorForm({ ...visitorForm, host_phone: value })} />
            <Field label="Department / Desk" value={visitorForm.host_department} onChange={(value) => setVisitorForm({ ...visitorForm, host_department: value })} />
            <Field label="Vehicle Number" value={visitorForm.vehicle_number} onChange={(value) => setVisitorForm({ ...visitorForm, vehicle_number: value })} />
            <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              Purpose
              <textarea value={visitorForm.visit_purpose} onChange={(event) => setVisitorForm({ ...visitorForm, visit_purpose: event.target.value })} required rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              RFID Card
              <select value={visitorForm.rfid_card_id} onChange={(event) => setVisitorForm({ ...visitorForm, rfid_card_id: event.target.value })} required className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                <option value="">Select available card</option>
                {availableCards.map((card) => (
                  <option key={card.id} value={card.id}>{card.card_label || card.card_uid} ({card.card_uid})</option>
                ))}
              </select>
            </label>
            <Field label="Security Note" value={visitorForm.security_note} onChange={(value) => setVisitorForm({ ...visitorForm, security_note: value })} />
          </div>

          <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            <BadgeCheck size={16} /> Assign & Mark Entry
          </button>
        </form>

        <div className="space-y-6">
          <form onSubmit={scanCard} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-slate-700" />
              <h3 className="font-semibold text-slate-950">RFID Scan</h3>
            </div>
            <div className="mt-4 flex gap-2">
              <input value={scanUid} onChange={(event) => setScanUid(event.target.value)} placeholder="Scan or type RFID UID" required className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
              <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Scan</button>
            </div>
            {scanResult && (
              <div className={`mt-4 rounded-md border px-3 py-3 text-sm ${scanResult.entry_allowed ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                <p className="font-semibold">{scanResult.action || (scanResult.entry_allowed ? 'Allowed' : 'Denied')}</p>
                <p className="mt-1">{scanResult.message}</p>
              </div>
            )}
          </form>

          <form onSubmit={saveCard} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard size={20} className="text-slate-700" />
                <h3 className="font-semibold text-slate-950">{editingCardId ? 'Update RFID Card' : 'Add RFID Card'}</h3>
              </div>
              {editingCardId && (
                <button type="button" onClick={() => { setEditingCardId(null); setCardForm(blankCard) }} className="text-sm font-medium text-slate-500 hover:text-slate-900">Cancel</button>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Card UID" value={cardForm.card_uid} onChange={(value) => setCardForm({ ...cardForm, card_uid: value })} required />
              <Field label="Card Label" value={cardForm.card_label} onChange={(value) => setCardForm({ ...cardForm, card_label: value })} />
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Status
                <select value={cardForm.status} onChange={(event) => setCardForm({ ...cardForm, status: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
                  {['Available', 'Assigned', 'Lost', 'Blocked'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <Field label="Notes" value={cardForm.notes} onChange={(value) => setCardForm({ ...cardForm, notes: value })} />
            </div>
            <button type="submit" className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <Plus size={16} /> {editingCardId ? 'Update Card' : 'Add Card'}
            </button>
          </form>
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-slate-950">Visitor Entries</h3>
            <p className="text-sm text-slate-500">{insideVisitors.length} visitor currently inside.</p>
          </div>
          <form onSubmit={applySearch} className="flex flex-wrap gap-2">
            <input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">All Status</option>
              {['Inside', 'Exited', 'Denied', 'Overdue'].map((status) => <option key={status}>{status}</option>)}
            </select>
            <div className="flex rounded-md border border-slate-300">
              <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search visitor, host, card" className="min-w-0 rounded-l-md px-3 py-2 text-sm outline-none" />
              <button type="submit" className="px-3 text-slate-600 hover:text-slate-950"><Search size={16} /></button>
            </div>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Visitor</th>
                <th className="px-5 py-3">Host</th>
                <th className="px-5 py-3">RFID</th>
                <th className="px-5 py-3">Purpose</th>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visitors.map((visitor) => (
                <tr key={visitor.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-950">{visitor.visitor_name}</p>
                    <p className="text-slate-500">{visitor.phone || '-'} {visitor.vehicle_number ? `| ${visitor.vehicle_number}` : ''}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{visitor.host_name || '-'}<br />{visitor.host_department || ''}</td>
                  <td className="px-5 py-4 text-slate-600">{visitor.card_label || visitor.card_uid || '-'}</td>
                  <td className="max-w-xs px-5 py-4 text-slate-600">{visitor.visit_purpose}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDateTime(visitor.entry_time)}<br />{visitor.exit_time ? formatDateTime(visitor.exit_time) : ''}</td>
                  <td className="px-5 py-4"><StatusBadge status={visitor.entry_status} /></td>
                  <td className="px-5 py-4 text-right">
                    {visitor.entry_status === 'Inside' && (
                      <button type="button" onClick={() => markExit(visitor.id)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                        <DoorOpen size={15} /> Exit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!visitors.length && (
                <tr><td colSpan="7" className="px-5 py-8 text-center text-slate-500">{loading ? 'Loading security data...' : 'No visitor entries found.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">RFID Cards</h3>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <article key={card.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{card.card_label || card.card_uid}</p>
                  <p className="mt-1 text-sm text-slate-500">{card.card_uid}</p>
                </div>
                <StatusBadge status={card.status} />
              </div>
              {card.active_visitor_name && <p className="mt-3 text-sm text-slate-600">Assigned to {card.active_visitor_name}</p>}
              {card.notes && <p className="mt-2 text-sm text-slate-500">{card.notes}</p>}
              <button type="button" onClick={() => editCard(card)} className="mt-4 text-sm font-semibold text-slate-700 hover:text-slate-950">Edit</button>
            </article>
          ))}
          {!cards.length && <p className="text-sm text-slate-500">No RFID cards added yet.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">Recent Entry Activity</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.recent || []).map((entry) => (
            <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div>
                <h4 className="font-medium text-slate-950">{entry.name || 'Unknown'}</h4>
                <p className="text-sm text-slate-500">{entry.qr_type} | {entry.membership_group || '-'} | {formatDateTime(entry.scanned_at)}</p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${entry.entry_allowed ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-red-50 text-red-700 ring-red-600/20'}`}>
                {entry.entry_allowed ? <BadgeCheck size={13} /> : <BadgeX size={13} />}
                {entry.entry_allowed ? 'Allowed' : 'Blocked'}
              </span>
            </article>
          ))}
          {!(data?.recent || []).length && <p className="px-5 py-8 text-sm text-slate-500">No entry activity found.</p>}
        </div>
      </section>
    </section>
  )
}

function Field({ label, value, onChange, required = false }) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
    </label>
  )
}

function StatCard({ card }) {
  const Icon = card.icon

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</p>
        </div>
        <div className={`rounded-lg p-3 ${card.tone}`}><Icon size={24} /></div>
      </div>
    </article>
  )
}

function StatusBadge({ status }) {
  const styles = {
    Available: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    Assigned: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    Inside: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    Exited: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    Lost: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Blocked: 'bg-red-50 text-red-700 ring-red-600/20',
    Denied: 'bg-red-50 text-red-700 ring-red-600/20',
    Overdue: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  }

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[status] || styles.Exited}`}>{status}</span>
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

export default SecurityGate
