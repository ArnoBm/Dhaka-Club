import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Paperclip, Plus, Trash2, X } from 'lucide-react'
import api from '../api/axios'

const emptyForm = {
  title: '',
  body: '',
  target_group: '',
  attachment: null,
}

function Notices() {
  const [notices, setNotices] = useState([])
  const [groups, setGroups] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const fetchNotices = async () => {
    setLoading(true)

    try {
      const response = await api.get('/notices')
      setNotices(response.data || [])
    } catch (error) {
      toast.error('Failed to load notices.')
    } finally {
      setLoading(false)
    }
  }

  const fetchGroups = async () => {
    try {
      const response = await api.get('/members/groups')
      setGroups(response.data || [])
    } catch (error) {
      toast.error('Failed to load member groups.')
    }
  }

  useEffect(() => {
    fetchNotices()
    fetchGroups()
  }, [])

  const openModal = () => {
    setForm(emptyForm)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(emptyForm)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)

    try {
      const payload = new FormData()
      payload.append('title', form.title)
      payload.append('body', form.body)
      payload.append('target_group', form.target_group || '')

      if (form.attachment) {
        payload.append('attachment', form.attachment)
      }

      await api.post('/notices', payload)

      toast.success('Notice created successfully.')
      closeModal()
      fetchNotices()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to create notice. Please try again.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (notice) => {
    const confirmed = window.confirm(`Delete notice "${notice.title}"?`)

    if (!confirmed) {
      return
    }

    try {
      await api.delete(`/notices/${notice.id}`)
      toast.success('Notice deleted successfully.')
      fetchNotices()
    } catch (error) {
      const message =
        error.response?.data?.message || 'Failed to delete notice. Please try again.'
      toast.error(message)
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Notices</h2>
          <p className="mt-1 text-sm text-slate-500">
            Publish announcements for all members or selected groups.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#263657]"
        >
          <Plus size={18} />
          New Notice
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <NoticeSkeleton />
        ) : notices.length ? (
          notices.map((notice) => (
            <article
              key={notice.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-slate-950">
                    {notice.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {truncate(notice.body, 150)}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <AudienceBadge label={notice.target_group || 'All Members'} />
                    <span>Created by {notice.created_by_name || 'Admin'}</span>
                    <span>{formatDate(notice.created_at)}</span>
                    {notice.attachment_url && (
                      <a
                        href={buildAttachmentUrl(notice.attachment_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                      >
                        <Paperclip size={14} />
                        Attachment
                      </a>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(notice)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No notices found.
          </div>
        )}
      </div>

      {modalOpen && (
        <NoticeModal
          form={form}
          setForm={setForm}
          groups={groups}
          saving={saving}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </section>
  )
}

function NoticeModal({ form, setForm, groups, saving, onClose, onSubmit }) {
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-950">New Notice</h3>
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
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                required
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Body</span>
              <textarea
                value={form.body}
                onChange={(event) => updateField('body', event.target.value)}
                required
                rows={4}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Target Group
              </span>
              <select
                value={form.target_group}
                onChange={(event) => updateField('target_group', event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1e2a45] focus:ring-2 focus:ring-[#1e2a45]/10"
              >
                <option value="">All Members</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
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
                      onChange={(event) => updateField('attachment', event.target.files?.[0] || null)}
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
                      onClick={() => updateField('attachment', null)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </label>
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
              {saving ? 'Publishing...' : 'Publish Notice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AudienceBadge({ label }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
      {label}
    </span>
  )
}

function NoticeSkeleton() {
  return [1, 2, 3].map((item) => (
    <div
      key={item}
      className="h-36 animate-pulse rounded-lg border border-slate-200 bg-white p-5"
    >
      <div className="h-5 w-64 rounded bg-slate-200" />
      <div className="mt-4 h-4 w-full rounded bg-slate-100" />
      <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
    </div>
  ))
}

function truncate(value, limit) {
  if (!value || value.length <= limit) {
    return value || ''
  }

  return `${value.slice(0, limit)}...`
}

function formatDate(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
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

export default Notices
