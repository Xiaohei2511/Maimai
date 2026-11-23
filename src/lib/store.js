const KEY = 'maimai_journal_v2'
const oldKey = 'maimai_journal_v1'
const today = () => new Date().toISOString().slice(0, 10)
const seed = {
  pets: [
    { id: 'p1', name: '麦麦', species: '狗狗', breed: '柯基', birthday: '2023-05-18', avatar: '' },
    { id: 'p2', name: '米粒', species: '猫咪', breed: '英短', birthday: '2024-02-03', avatar: '' }
  ],
  moments: [
    { id: 'm1', petIds: ['p1', 'p2'], date: '2025-10-18', text: '第一次一起去海边！追着浪花跑了一整个下午。', media: [], likes: 2, liked: false, comments: [{ id: 'c1', text: '太可爱了！' }], createdAt: '2025-10-18T12:00:00.000Z' },
    { id: 'm2', petIds: ['p1'], date: '2025-05-18', text: '两岁啦，永远是家里最快乐的小朋友 🎂', media: [], likes: 0, liked: false, comments: [], createdAt: '2025-05-18T12:00:00.000Z' },
    { id: 'm3', petIds: ['p1'], date: '2023-05-18', text: '欢迎来到这个世界，麦麦。', media: [], likes: 0, liked: false, comments: [], createdAt: '2023-05-18T12:00:00.000Z' }
  ],
  events: [
    { id: 'e1', petId: 'p1', type: 'vaccine', title: '狂犬疫苗', date: '2025-08-12', note: '' },
    { id: 'e2', petId: 'p1', type: 'deworm', title: '体外驱虫', date: '2025-10-05', note: '' }
  ]
}
const copy = value => JSON.parse(JSON.stringify(value))
export function loadJournal() {
  try {
    const stored = uni.getStorageSync(KEY) || uni.getStorageSync(oldKey)
    if (!stored) return copy(seed)
    const data = JSON.parse(stored)
    if (!data.pets) { data.pets = [{ id: 'p1', ...data.pet }]; delete data.pet }
    data.moments = (data.moments || []).map(m => ({ ...m, petIds: m.petIds || ['p1'], media: m.media || (m.mediaType && m.media ? [{ type: m.mediaType, url: m.media }] : []) }))
    data.events = (data.events || []).map(e => ({ ...e, petId: e.petId || 'p1' }))
    return data
  } catch { return copy(seed) }
}
export function saveJournal(data) { uni.setStorageSync(KEY, JSON.stringify(data)) }
export function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
export { today }
