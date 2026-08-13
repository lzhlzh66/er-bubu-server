/**
 * 一二布布 · 养成系小家后端
 * 功能：注册/登录 JWT、个人数据同步、圈子公共空间同步
 * 存储：JSON 文件（本地优先架构，服务端仅作为同步中转）
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'er-bubu-dev-secret-change-in-production';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DATA_DIR = path.join(__dirname, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

// 媒体存储目录
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

// 确保数据目录
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 加载数据
function loadJSON(file, defaultValue = {}) {
  try {
    if (!fs.existsSync(file)) return defaultValue;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('loadJSON error', file, e.message);
    return defaultValue;
  }
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('saveJSON error', file, e.message);
  }
}

let users = loadJSON(USERS_FILE, {});
let groups = loadJSON(GROUPS_FILE, {});

// 定时持久化（每 30 秒）
setInterval(() => {
  saveJSON(USERS_FILE, users);
  saveJSON(GROUPS_FILE, groups);
}, 30000);

// 优雅退出持久化
process.on('SIGTERM', () => {
  saveJSON(USERS_FILE, users);
  saveJSON(GROUPS_FILE, groups);
  process.exit(0);
});
process.on('SIGINT', () => {
  saveJSON(USERS_FILE, users);
  saveJSON(GROUPS_FILE, groups);
  process.exit(0);
});

// 中间件
app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 生成 6 位邀请码
function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// JWT 验证中间件
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: '缺少 token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'token 无效' });
  }
}

// 注册
app.post('/api/register', async (req, res) => {
  const { username, password, inviteCode } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度 2-20' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少 4 位' });
  if (users[username]) return res.status(409).json({ error: '用户名已存在' });

  const hash = await bcrypt.hash(password, 10);
  let groupId;
  let role = 'owner';

  if (inviteCode && groups[inviteCode]) {
    groupId = inviteCode;
    groups[groupId].members.push(username);
    role = 'member';
  } else {
    groupId = genCode();
    groups[groupId] = {
      code: groupId,
      owner: username,
      members: [username],
      sharedData: defaultSharedData(),
      createdAt: Date.now()
    };
  }

  users[username] = {
    username,
    passwordHash: hash,
    groupId,
    role,
    personalData: {},
    createdAt: Date.now()
  };

  const token = jwt.sign({ username, groupId }, JWT_SECRET, { expiresIn: '30d' });
  saveJSON(USERS_FILE, users);
  saveJSON(GROUPS_FILE, groups);

  res.json({
    token,
    username,
    groupId,
    inviteCode: groupId,
    role,
    sharedData: groups[groupId].sharedData
  });
});

// 登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  const user = users[username];
  if (!user) return res.status(401).json({ error: '用户不存在' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: '密码错误' });

  const token = jwt.sign({ username, groupId: user.groupId }, JWT_SECRET, { expiresIn: '30d' });
  const group = groups[user.groupId] || { sharedData: defaultSharedData() };
  res.json({
    token,
    username,
    groupId: user.groupId,
    inviteCode: user.groupId,
    role: user.role,
    personalData: user.personalData,
    sharedData: group.sharedData
  });
});

// 获取当前用户信息
app.get('/api/me', authMiddleware, (req, res) => {
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const group = groups[user.groupId];
  res.json({
    username: user.username,
    groupId: user.groupId,
    role: user.role,
    inviteCode: user.groupId,
    sharedData: group ? group.sharedData : defaultSharedData()
  });
});

// 个人数据：拉取
app.get('/api/data', authMiddleware, (req, res) => {
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ data: user.personalData || {}, updatedAt: user.updatedAt || 0 });
});

// 个人数据：上传（简单覆盖，客户端负责合并冲突）
app.post('/api/data', authMiddleware, (req, res) => {
  const user = users[req.user.username];
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const { data } = req.body;
  if (typeof data !== 'object') return res.status(400).json({ error: 'data 必须是对象' });
  user.personalData = data;
  user.updatedAt = Date.now();
  saveJSON(USERS_FILE, users);
  res.json({ ok: true, updatedAt: user.updatedAt });
});

// 圈子信息
app.get('/api/group', authMiddleware, (req, res) => {
  const user = users[req.user.username];
  const group = groups[user.groupId];
  if (!group) return res.status(404).json({ error: '圈子不存在' });
  res.json({
    code: group.code,
    owner: group.owner,
    members: group.members,
    createdAt: group.createdAt
  });
});

// 加入圈子
app.post('/api/group/join', authMiddleware, (req, res) => {
  const { code } = req.body;
  const user = users[req.user.username];
  if (!code) return res.status(400).json({ error: '邀请码必填' });
  const group = groups[code.toUpperCase()];
  if (!group) return res.status(404).json({ error: '邀请码不存在' });

  // 如果已在别的圈子，先退出
  const oldGroup = groups[user.groupId];
  if (oldGroup) {
    oldGroup.members = oldGroup.members.filter(m => m !== user.username);
  }

  user.groupId = group.code;
  user.role = 'member';
  if (!group.members.includes(user.username)) group.members.push(user.username);
  saveJSON(USERS_FILE, users);
  saveJSON(GROUPS_FILE, groups);

  res.json({ ok: true, groupId: group.code, sharedData: group.sharedData });
});

// 公共空间：拉取
app.get('/api/share/:group', authMiddleware, (req, res) => {
  const user = users[req.user.username];
  const groupId = req.params.group.toUpperCase();
  if (user.groupId !== groupId) return res.status(403).json({ error: '无权限访问该圈子' });
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: '圈子不存在' });
  res.json({ data: group.sharedData || defaultSharedData(), updatedAt: group.updatedAt || 0 });
});

// 公共空间：上传
app.post('/api/share/:group', authMiddleware, (req, res) => {
  const user = users[req.user.username];
  const groupId = req.params.group.toUpperCase();
  if (user.groupId !== groupId) return res.status(403).json({ error: '无权限写入该圈子' });
  const group = groups[groupId];
  if (!group) return res.status(404).json({ error: '圈子不存在' });
  const { data } = req.body;
  if (typeof data !== 'object') return res.status(400).json({ error: 'data 必须是对象' });
  group.sharedData = { ...(group.sharedData || defaultSharedData()), ...data };
  group.updatedAt = Date.now();
  saveJSON(GROUPS_FILE, groups);
  res.json({ ok: true, updatedAt: group.updatedAt });
});

// 默认公共空间数据
function defaultSharedData() {
  return {
    homeLayout: { theme: 'ghibli', furniture: ['bed', 'desk', 'bookshelf', 'plant'], wallpaper: 'default' },
    fridge: { cold: {}, freeze: {} },
    todos: [],
    habitBoard: {},
    examBoard: {},
    travelWishlist: []
  };
}

// 媒体上传（照片/语音）：以原始二进制流上传，避免额外依赖
app.post('/api/media', authMiddleware, (req, res) => {
  const name = req.query.name || ('file' + Date.now());
  const ext = path.extname(name).slice(0, 12) || '.bin';
  const safe = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext;
  const ws = fs.createWriteStream(path.join(MEDIA_DIR, safe));
  req.pipe(ws);
  ws.on('finish', () => res.json({ url: '/api/media/' + safe }));
  ws.on('error', () => res.status(500).json({ error: '写入失败' }));
});
// 媒体静态访问（图片/音频以 /api/media/:file 提供）
app.use('/api/media', express.static(MEDIA_DIR));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 兜底错误
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`er-bubu server running on port ${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});
