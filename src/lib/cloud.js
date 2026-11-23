const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const TOKEN_KEY = 'maimai_token'
export const cloudAvailable = !!base
export const cloudToken = () => uni.getStorageSync(TOKEN_KEY) || ''
export const setCloudToken = token => token ? uni.setStorageSync(TOKEN_KEY, token) : uni.removeStorageSync(TOKEN_KEY)
export function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    uni.request({ url: `${base}${path}`, method, data, header: { Authorization: `Bearer ${cloudToken()}` },
      success: res => res.statusCode >= 200 && res.statusCode < 300 ? resolve(res.data) : reject(new Error(res.data?.error || `请求失败 (${res.statusCode})`)), fail: reject })
  })
}
export async function login(email, password, mode = 'login') { const result = await request(`/auth/${mode}`, 'POST', { email, password }); setCloudToken(result.token); return result }
export const pullJournal = () => request('/journal')
export const pushJournal = journal => request('/journal', 'PUT', journal)
export function uploadMedia(filePath, mediaType) {
  return new Promise((resolve, reject) => uni.uploadFile({ url: `${base}/media`, filePath, name: 'file', formData: { mediaType },
    header: { Authorization: `Bearer ${cloudToken()}` },
    success: res => { try { const body = JSON.parse(res.data); res.statusCode < 300 ? resolve(body.url) : reject(new Error(body.error || '上传失败')) } catch { reject(new Error('上传响应无效')) } }, fail: reject }))
}
export const socialFeed = () => request('/social')
export const sharePost = post => request('/social', 'POST', post)
export const likeSocial = id => request(`/social/${id}/like`, 'POST', {})
export const commentSocial = (id, text) => request(`/social/${id}/comment`, 'POST', { text })
