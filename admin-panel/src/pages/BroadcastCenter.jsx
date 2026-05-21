import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Paperclip, Send } from 'lucide-react'
import api from '../api/axios'
import { getAdminSocket } from '../api/socket'

const initialForm = {
  title: '',
  body: '',
  type: 'Push Notification',
  channel: 'Push',
  target_type: 'All Members',
  target_value: '',
  attachment: null,
}

function BroadcastCenter() {
  const [broadcasts, setBroadcasts] = useState([])
  const [groups, setGroups] = useState([])
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [broadcastResponse, groupResponse, memberResponse] = await Promise.all([
        api.get('/broadcasts'),
        api.get('/members/groups'),
        api.get('/members'),
      ])
      setBroadcasts(broadcastResponse.data || [])
      setGroups(groupResponse.data || [])
      setMembers(memberResponse.data || [])
    } catch (error) {
      toast.error('Failed to load broadcast center.')
    }
  }, [])

  useEffect(() => {
    loadData()
    const socket = getAdminSocket()

    socket?.on('broadcasts:changed', loadData)

    return () => socket?.off('broadcasts:changed', loadData)
  }, [loadData])

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('body', form.body)
      payload.append('type', form.type)
      payload.append('channel', form.channel)
      payload.append('target_type', form.target_type)
      payload.append('target_value', form.target_type === 'All Members' ? '' : form.target_value)

      if (form.attachment) {
        payload.append('attachment', form.attachment)
      }

      await api.post('/broadcasts', payload)
      toast.success('Notification broadcast sent.')
      setForm(initialForm)
      loadData()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send broadcast.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h2 className="text-2xl font-semibold text-slate-950">Notification Broadcast Center</h2>
      <p className="mt-1 text-sm text-slate-500">Send push notifications, notice alerts, event reminders, and renewal reminders.</p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[#1e2a45] p-3 text-white">
              <Send size={22} />
            </div>
            <h3 className="font-semibold text-slate-950">New Broadcast</h3>
          </div>
          <div className="mt-5 space-y-4">
            <Input label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Body</span>
              <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} rows={4} required className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]" />
            </label>
            <Select label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value, channel: channelFromType(value) })} options={['Push Notification', 'Notice Alert', 'Event Reminder', 'Renewal Reminder']} />
            <Select label="Target" value={form.target_type} onChange={(value) => setForm({ ...form, target_type: value, target_value: '' })} options={['All Members', 'Membership Group', 'Specific Member']} />
            {form.target_type === 'Membership Group' && (
              <Select label="Membership Group" value={form.target_value} onChange={(value) => setForm({ ...form, target_value: value })} options={['', ...groups]} required />
            )}
            {form.target_type === 'Specific Member' && (
              <Select label="Member" value={form.target_value} onChange={(value) => setForm({ ...form, target_value: value })} options={['', ...members.map((member) => ({ label: `${member.full_name} (${member.member_id})`, value: member.id }))]} required />
            )}
            <div>
              <span className="text-sm font-medium text-slate-700">Attachment</span>
              <div className="mt-2 rounded-md border border-dashed border-slate-300 px-3 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <FileText size={16} />
                    Choose image or PDF
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={(event) => setForm({ ...form, attachment: event.target.files?.[0] || null })}
                    />
                  </label>
                  {form.attachment ? (
                    <span className="text-sm text-slate-600">{form.attachment.name}</span>
                  ) : (
                    <span className="text-sm text-slate-400">No file selected</span>
                  )}
                  {form.attachment && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, attachment: null })}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button disabled={saving} className="w-full rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Sending...' : 'Send Broadcast'}
            </button>
          </div>
        </form>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-950">Delivery Status</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {broadcasts.map((broadcast) => (
              <article key={broadcast.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-950">{broadcast.title}</h4>
                    <p className="mt-1 text-sm text-slate-500">{broadcast.type} • {broadcast.target_type}</p>
                  </div>
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-green-600/20">
                    Sent to {broadcast.recipient_count}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Sent {broadcast.sent_count || 0}</span>
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Delivered {broadcast.delivered_count || 0}</span>
                  <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-700">Read {broadcast.read_count || 0}</span>
                  {broadcast.attachment_url && (
                    <a
                      href={buildAttachmentUrl(broadcast.attachment_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"
                    >
                      <Paperclip size={14} />
                      Attachment
                    </a>
                  )}
                </div>
              </article>
            ))}
            {!broadcasts.length && <p className="px-5 py-8 text-sm text-slate-500">No broadcasts yet.</p>}
          </div>
        </div>
      </div>
    </section>
  )
}

function Input({ label, value, onChange, required }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]" />
    </label>
  )
}

function Select({ label, value, onChange, options, required }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required} className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45]">
        {options.map((option) => {
          const item = typeof option === 'string' ? { label: option || 'Select', value: option } : option
          return <option key={item.value || 'empty'} value={item.value}>{item.label}</option>
        })}
      </select>
    </label>
  )
}

function channelFromType(type) {
  if (type === 'Notice Alert') return 'Notice'
  if (type === 'Event Reminder') return 'Event'
  if (type === 'Renewal Reminder') return 'Renewal'
  return 'Push'
}

function buildAttachmentUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) {
    return path || ''
  }

  const baseURL = api.defaults.baseURL || ''

  if (/^https?:\/\//i.test(baseURL)) {
    return `${baseURL.replace(/\/api\/?$/, '')}${path}`
  }

  return path
}

export default BroadcastCenter
