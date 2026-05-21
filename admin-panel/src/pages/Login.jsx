import { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)

    try {
      const response = await api.post('/auth/login', { email, password })
      const { token, admin } = response.data

      localStorage.setItem('token', token)
      localStorage.setItem('admin', JSON.stringify(admin))
      navigate('/', { replace: true })
    } catch (error) {
      const message =
        error.response?.data?.message || 'Unable to sign in. Please try again.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-slate-950">Dhaka Club</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Admin Portal</p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="admin@dhakaclub.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#1e2a45] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263657] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default Login
