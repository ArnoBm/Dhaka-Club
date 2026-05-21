import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Clock, Edit, Eye, Plus, X } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  title: '',
  description: '',
  starting_price: '',
  auction_start: '',
  auction_end: '',
  status: 'Draft',
}

const statuses = ['Draft', 'Active', 'Sold', 'Unsold']
const filters = ['All', ...statuses]

function Auctions() {
  const [items, setItems] = useState([])
  const [statusFilter, setStatusFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalMode, setModalMode] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [bidsOpen, setBidsOpen] = useState(false)
  const [bids, setBids] = useState([])
  const [bidsLoading, setBidsLoading] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const fetchItems = useCallback(async () => {
    setLoading(true)

    try {
      const response = await api.get('/auctions', {
        params: statusFilter === 'All' ? {} : { status: statusFilter },
      })
      setItems(response.data || [])
    } catch (error) {
      toast.error('Failed to load auctions.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const openAddModal = () => {
    setSelectedItem(null)
    setForm(emptyForm)
    setModalMode('add')
  }

  const openEditModal = (item) => {
    setSelectedItem(item)
    setForm(itemToForm(item))
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedItem(null)
    setForm(emptyForm)
  }

  const openBids = async (item) => {
    setSelectedItem(item)
    setBidsOpen(true)
    setBidsLoading(true)

    try {
      const response = await api.get(`/auctions/${item.id}/bids`)
      setBids(response.data || [])
    } catch (error) {
      toast.error('Failed to load bids.')
    } finally {
      setBidsLoading(false)
    }
  }

  const closeBids = () => {
    setBidsOpen(false)
    setSelectedItem(null)
    setBids([])
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      const payload = normalizePayload(form)

      if (modalMode === 'edit') {
        await api.put(`/auctions/${selectedItem.id}`, payload)
        toast.success('Auction item updated successfully.')
      } else {
        await api.post('/auctions', payload)
        toast.success('Auction item created successfully.')
      }

      closeModal()
      fetchItems()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to save auction item.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Auctions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage auction items and review bidding activity.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
        >
          <Plus size={18} />
          Add Item
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={[
              'rounded-md px-3 py-2 text-sm font-medium',
              statusFilter === filter
                ? 'bg-[#1e2a45] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <AuctionSkeleton />
        ) : items.length ? (
          items.map((item) => (
            <AuctionCard
              key={item.id}
              item={item}
              now={now}
              onEdit={() => openEditModal(item)}
              onViewBids={() => openBids(item)}
            />
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">
            No auction items found.
          </div>
        )}
      </div>

      {modalMode && (
        <AuctionModal
          form={form}
          setForm={setForm}
          mode={modalMode}
          saving={saving}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {bidsOpen && (
        <BidsModal
          item={selectedItem}
          bids={bids}
          loading={bidsLoading}
          onClose={closeBids}
        />
      )}
    </section>
  )
}

function AuctionCard({ item, now, onEdit, onViewBids }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p>Starting price: ৳{item.starting_price || 0}</p>
        <p>
          Current highest bid:{' '}
          <span className="font-semibold text-slate-950">
            ৳{item.highest_bid || item.current_bid || 0}
          </span>
        </p>
        <p>Ends: {formatDateTime(item.auction_end)}</p>
      </div>

      {item.status === 'Active' && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
          <Clock size={16} />
          {formatCountdown(item.auction_end, now)}
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Edit size={16} />
          Edit
        </button>
        <button
          type="button"
          onClick={onViewBids}
          className="inline-flex items-center gap-2 rounded-md bg-[#1e2a45] px-3 py-2 text-sm font-medium text-white hover:bg-[#263657]"
        >
          <Eye size={16} />
          View Bids
        </button>
      </div>
    </article>
  )
}

function AuctionModal({ form, setForm, mode, saving, onClose, onSubmit }) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="max-h-full w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">
            {mode === 'edit' ? 'Edit Item' : 'Add Item'}
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
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Title" value={form.title} onChange={(value) => updateField('title', value)} required />
            <TextField label="Starting Price" type="number" value={form.starting_price} onChange={(value) => updateField('starting_price', value)} min="0" step="0.01" required />
            <TextField label="Auction Start" type="datetime-local" value={form.auction_start} onChange={(value) => updateField('auction_start', value)} required />
            <TextField label="Auction End" type="datetime-local" value={form.auction_end} onChange={(value) => updateField('auction_end', value)} required />
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField('status', event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-slate-700">Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-md bg-[#1e2a45] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263657] disabled:cursor-not-allowed disabled:opacity-70">
              {saving ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BidsModal({ item, bids, loading, onClose }) {
  const highestBid = bids[0]?.bid_amount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="max-h-full w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Bids</h3>
            <p className="text-sm text-slate-500">{item?.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[calc(100vh-9rem)] overflow-auto p-6">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <Th>Bidder Name</Th>
                <Th>Member ID</Th>
                <Th>Bid Amount</Th>
                <Th>Bid Time</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">Loading bids...</td></tr>
              ) : bids.length ? (
                bids.map((bid) => (
                  <tr
                    key={bid.id}
                    className={Number(bid.bid_amount) === Number(highestBid) ? 'bg-green-50' : ''}
                  >
                    <Td>{bid.bidder_full_name}</Td>
                    <Td>{bid.bidder_member_id}</Td>
                    <Td>৳{bid.bid_amount}</Td>
                    <Td>{formatDateTime(bid.bid_time)}</Td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">No bids found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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

function StatusBadge({ status }) {
  const classes = {
    Draft: 'bg-slate-100 text-slate-700 ring-slate-600/20',
    Active: 'bg-green-50 text-green-700 ring-green-600/20',
    Sold: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    Unsold: 'bg-red-50 text-red-700 ring-red-600/20',
  }

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${classes[status] || classes.Draft}`}>
      {status}
    </span>
  )
}

function AuctionSkeleton() {
  return [1, 2, 3, 4, 5, 6].map((item) => (
    <div key={item} className="h-56 animate-pulse rounded-lg border border-slate-200 bg-white p-5">
      <div className="h-5 w-2/3 rounded bg-slate-200" />
      <div className="mt-5 h-4 w-36 rounded bg-slate-100" />
      <div className="mt-3 h-4 w-44 rounded bg-slate-100" />
      <div className="mt-8 h-9 w-48 rounded bg-slate-100" />
    </div>
  ))
}

function Th({ children }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>
}

function Td({ children }) {
  return <td className="whitespace-nowrap px-4 py-3 text-slate-700">{children}</td>
}

function itemToForm(item) {
  return {
    title: item.title || '',
    description: item.description || '',
    starting_price: item.starting_price || '',
    auction_start: toDateTimeInput(item.auction_start),
    auction_end: toDateTimeInput(item.auction_end),
    status: item.status || 'Draft',
  }
}

function normalizePayload(form) {
  return {
    title: form.title,
    description: form.description || null,
    starting_price: Number(form.starting_price || 0),
    auction_start: toSqlDateTime(form.auction_start),
    auction_end: toSqlDateTime(form.auction_end),
    status: form.status,
  }
}

function toSqlDateTime(value) {
  return value ? value.replace('T', ' ') : value
}

function toDateTimeInput(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(value) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCountdown(endDate, now) {
  const remaining = new Date(endDate).getTime() - now

  if (remaining <= 0) {
    return 'Ended'
  }

  const seconds = Math.floor(remaining / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`
  }

  return `${hours}h ${minutes}m ${secs}s`
}

export default Auctions
