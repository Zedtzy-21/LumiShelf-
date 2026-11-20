import { supabase } from './Services/supabaseClient'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// Guests have no account, so each browser gets a permanent random ID.
export function getDeviceId() {
  let id = localStorage.getItem('lumishelf_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('lumishelf_device_id', id)
  }
  return id
}

// Registered users send their login token; guests send only the device ID.
async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'x-device-id': getDeviceId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(await authHeaders()), ...options.headers },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, ...body, _data: body }
}

export async function getCategories() {
  const r = await request('/api/categories')
  if (!r.ok) throw new Error('Could not load categories')
  return r._data
}

export async function getBooks({ category, q, offset = 0, limit = 24 } = {}) {
  const params = new URLSearchParams({ offset, limit })
  if (category) params.set('category', category)
  if (q) params.set('q', q)
  const r = await request(`/api/books?${params}`)
  if (!r.ok) throw new Error('Could not load books')
  return r._data
}

export async function getUsage() {
  const r = await request('/api/usage')
  return r._data
}

export const downloadBook = (id) => request(`/api/books/${id}/download`, { method: 'POST' })

export async function getFavorites() {
  const r = await request('/api/favorites')
  return r.ok ? r._data : []
}
export const addFavorite = (id) => request(`/api/favorites/${id}`, { method: 'POST' })
export const removeFavorite = (id) => request(`/api/favorites/${id}`, { method: 'DELETE' })
export async function getPreview(id) {
  const r = await request(`/api/books/${id}/preview`)
  if (!r.ok) throw new Error(r.error || 'Preview unavailable')
  return r._data
}

async function sendJson(path, method, body) {
  const r = await request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(r.error || 'Request failed')
  return r._data
}

export async function getAnalytics() {
  const r = await request('/api/admin/analytics')
  if (!r.ok) throw new Error(r.error || 'Could not load analytics')
  return r._data
}

export async function getAdminBooks() {
  const r = await request('/api/admin/books')
  if (!r.ok) throw new Error(r.error || 'Could not load books')
  return r._data
}

export const saveBook = (payload, id) =>
  sendJson(id ? `/api/admin/books/${id}` : '/api/admin/books', id ? 'PUT' : 'POST', payload)

export const removeBook = (id) => sendJson(`/api/admin/books/${id}`, 'DELETE')