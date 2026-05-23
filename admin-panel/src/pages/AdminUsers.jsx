import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff, ShieldCheck, UserCog, UserPlus } from 'lucide-react'
import api from '../api/axios'

const blankForm = {
  name: '',
  phone: '',
  email: '',
  password: '',
  role: 'Security Staff',
  status: 'Active',
}

function AdminUsers() {
  const [admins, setAdmins] = useState([])
  const [form, setForm] = useState(blankForm)
  const [editingId, setEditingId] = useState(null)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadAdmins = async () => {
    try {
      const response = await api.get('/auth/admins')
      setAdmins(response.data)
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load admin users.')
    }
  }

  useEffect(() => {
    loadAdmins()
  }, [])

  const saveAdmin = async (event) => {
    event.preventDefault()
    setLoading(true)

    try {
      if (editingId) {
        await api.put(`/auth/admins/${editingId}`, form)
        toast.success('Admin user updated.')
      } else {
        await api.post('/auth/admins', form)
        toast.success('Admin user created.')
      }

      setForm(blankForm)
      setEditingId(null)
      setPasswordVisible(false)
      loadAdmins()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save admin user.')
    } finally {
      setLoading(false)
    }
  }

  const editAdmin = (admin) => {
    setEditingId(admin.id)
    setForm({
      name: admin.name || '',
      phone: admin.phone || '',
      email: admin.email || '',
      password: '',
      role: admin.role || 'Admin',
      status: admin.status || 'Active',
    })
    setPasswordVisible(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setForm(blankForm)
    setPasswordVisible(false)
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">Admin Users</h2>
        <p className="mt-1 text-sm text-slate-500">Create role based users for admin, operations, and gate security staff.</p>
      </div>

      <form onSubmit={saveAdmin} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus size={20} className="text-slate-700" />
            <h3 className="font-semibold text-slate-950">{editingId ? 'Update User' : 'Create User'}</h3>
          </div>
          {editingId && (
            <button type="button" onClick={cancelEdit} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Cancel</button>
          )}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <Field label="Mobile Number" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
          <Field label="Email (Optional)" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <PasswordField
            label={editingId ? 'New Password' : 'Password'}
            value={form.password}
            onChange={(value) => setForm({ ...form, password: value })}
            required={!editingId}
            placeholder={editingId ? 'Leave blank to keep old' : ''}
            visible={passwordVisible}
            onToggle={() => setPasswordVisible((value) => !value)}
          />
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Role
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
              <option>Super Admin</option>
              <option>Admin</option>
              <option>Security Staff</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Status
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm">
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </label>
        </div>

        <button type="submit" disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-70">
          <ShieldCheck size={16} /> {loading ? 'Saving...' : editingId ? 'Update User' : 'Create User'}
        </button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-950">Users</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Mobile</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((admin) => (
                <tr key={admin.id}>
                  <td className="px-5 py-4 font-medium text-slate-950">{admin.name}</td>
                  <td className="px-5 py-4 text-slate-600">{admin.phone || '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{admin.email || '-'}</td>
                  <td className="px-5 py-4"><Badge>{admin.role}</Badge></td>
                  <td className="px-5 py-4"><Badge tone={admin.status === 'Active' ? 'green' : 'red'}>{admin.status || 'Active'}</Badge></td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" onClick={() => editAdmin(admin)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50">
                      <UserCog size={15} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!admins.length && <tr><td colSpan="6" className="px-5 py-8 text-center text-slate-500">No admin users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function Field({ label, value, onChange, required = false, type = 'text', placeholder = '' }) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} placeholder={placeholder} className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm" />
    </label>
  )
}

function PasswordField({ label, value, onChange, required, placeholder, visible, onToggle }) {
  return (
    <label className="space-y-1 text-sm font-medium text-slate-700">
      {label}
      <div className="flex rounded-md border border-slate-300 focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-l-md px-3 py-2.5 text-sm outline-none"
        />
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  )
}

function Badge({ children, tone = 'slate' }) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    red: 'bg-red-50 text-red-700 ring-red-600/20',
  }

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[tone]}`}>{children}</span>
}

export default AdminUsers
