import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(root, 'data')
const mediaDir = path.join(dataDir, 'media')
await mkdir(mediaDir, { recursive: true })
const db = new DatabaseSync(path.join(dataDir, 'maimai.sqlite'))
db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, journal TEXT);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, filename TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS social_posts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pet_names TEXT NOT NULL, post_date TEXT NOT NULL, text TEXT NOT NULL, media TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS social_likes (post_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS social_comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);`)
const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 })
await app.register(cors, { origin: true })
await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 1 } })
await app.register(fastifyStatic, { root: mediaDir, prefix: '/media/' })
const token = () => randomBytes(32).toString('hex')
const validEmail = email => typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 255
const hash = (password, salt) => scryptSync(password, salt, 64).toString('hex')
function auth(req, reply) {
  const bearer = req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  const session = bearer && db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?').get(bearer, Date.now())
  if (!session) { reply.code(401).send({ error: '请先登录' }); return null }
  return session.user_id
}
app.get('/health', async () => ({ ok: true }))
app.post('/auth/register', async (req, reply) => {
  const { email, password } = req.body || {}
  if (!validEmail(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) return reply.code(400).send({ error: '请输入有效邮箱和至少 8 位密码' })
  const normalized = email.trim().toLowerCase()
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(normalized)) return reply.code(409).send({ error: '邮箱已注册' })
  const id = token(), salt = token()
  db.prepare('INSERT INTO users (id,email,salt,password_hash) VALUES (?,?,?,?)').run(id, normalized, salt, hash(password, salt))
  const session = token(); db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(session, id, Date.now() + 90 * 86400000)
  return { token: session }
})
app.post('/auth/login', async (req, reply) => {
  const { email, password } = req.body || {}
  if (!validEmail(email) || typeof password !== 'string') return reply.code(400).send({ error: '邮箱或密码错误' })
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (!user || !timingSafeEqual(Buffer.from(user.password_hash, 'hex'), Buffer.from(hash(password, user.salt), 'hex'))) return reply.code(401).send({ error: '邮箱或密码错误' })
  const session = token(); db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(session, user.id, Date.now() + 90 * 86400000)
  return { token: session }
})
app.get('/journal', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const row = db.prepare('SELECT journal FROM users WHERE id = ?').get(userId)
  return row?.journal ? JSON.parse(row.journal) : {}
})
app.put('/journal', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const journal = req.body
  if (!journal || !Array.isArray(journal.pets) || !Array.isArray(journal.moments) || !Array.isArray(journal.events)) return reply.code(400).send({ error: '成长记录格式无效' })
  if (journal.pets.length > 100 || journal.moments.length > 10000 || journal.events.length > 10000) return reply.code(413).send({ error: '记录数量超出限制' })
  db.prepare('UPDATE users SET journal = ? WHERE id = ?').run(JSON.stringify(journal), userId)
  return { ok: true }
})
app.post('/media', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const part = await req.file()
  if (!part) return reply.code(400).send({ error: '请选择文件' })
  const mime = part.mimetype
  const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/quicktime': '.mov' })[mime]
  if (!extension) return reply.code(415).send({ error: '仅支持 JPG、PNG、WebP、GIF、MP4 或 MOV' })
  const id = token(), filename = id + extension
  await writeFile(path.join(mediaDir, filename), await part.toBuffer())
  db.prepare('INSERT INTO uploads VALUES (?,?,?)').run(id, userId, filename)
  const origin = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`
  return { url: `${origin.replace(/\/$/, '')}/media/${filename}` }
})

app.get('/social', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const rows = db.prepare(`SELECT p.*, u.email AS author, (SELECT COUNT(*) FROM social_likes l WHERE l.post_id = p.id) AS likes, EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked FROM social_posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 100`).all(userId)
  return rows.map(row => ({ id: row.id, petNames: JSON.parse(row.pet_names), date: row.post_date, text: row.text, media: JSON.parse(row.media), author: row.author.split('@')[0], likes: row.likes, liked: !!row.liked, comments: db.prepare('SELECT c.id, c.text, u.email AS author FROM social_comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at LIMIT 100').all(row.id).map(c => ({ ...c, author: c.author.split('@')[0] })) }))
})
app.post('/social', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const { petNames, date, text, media } = req.body || {}
  if (!Array.isArray(petNames) || !petNames.length || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || typeof text !== 'string' || !Array.isArray(media) || text.length > 500 || media.length > 9) return reply.code(400).send({ error: '动态内容无效' })
  if (media.some(m => !['image','video'].includes(m.type) || typeof m.url !== 'string' || !m.url.startsWith((process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`).replace(/\/$/, '') + '/media/'))) return reply.code(400).send({ error: '媒体地址无效' })
  const id = token(); db.prepare('INSERT INTO social_posts VALUES (?,?,?,?,?,?,?)').run(id, userId, JSON.stringify(petNames), date, text, JSON.stringify(media), Date.now())
  return { id }
})
app.post('/social/:id/like', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const post = db.prepare('SELECT id FROM social_posts WHERE id = ?').get(req.params.id)
  if (!post) return reply.code(404).send({ error: '动态不存在' })
  const existing = db.prepare('SELECT 1 FROM social_likes WHERE post_id = ? AND user_id = ?').get(post.id, userId)
  if (existing) db.prepare('DELETE FROM social_likes WHERE post_id = ? AND user_id = ?').run(post.id, userId)
  else db.prepare('INSERT INTO social_likes VALUES (?,?)').run(post.id, userId)
  return { liked: !existing }
})
app.post('/social/:id/comment', async (req, reply) => {
  const userId = auth(req, reply); if (!userId) return
  const post = db.prepare('SELECT id FROM social_posts WHERE id = ?').get(req.params.id)
  const value = req.body?.text?.trim()
  if (!post) return reply.code(404).send({ error: '动态不存在' })
  if (!value || value.length > 300) return reply.code(400).send({ error: '评论应为 1 至 300 字' })
  const id = token(); db.prepare('INSERT INTO social_comments VALUES (?,?,?,?,?)').run(id, post.id, userId, value, Date.now())
  return { id }
})

const port = Number(process.env.PORT || 3001)
await app.listen({ port, host: '0.0.0.0' })
