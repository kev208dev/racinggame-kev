import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { safeNickname } from './utils/nicknameFilter.js';
import { attachMultiplayer, mpStats } from './js/net/mpServer.js';

loadEnvFile('.env.local');
loadEnvFile('.env');

const PORT = Number(process.env.PORT || 3000);
const ROOT = resolve('.');
const DATA_DIR = join(ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'leaderboard.json');
const MAX_BODY_BYTES = 32 * 1024;
const CLIENTS = new Set();
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let pgPool = null;
let pgReady = false;
let supabaseClient = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function cleanText(value, fallback, max = 40) {
  const text = String(value || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim();
  return (text || fallback).slice(0, max);
}

function cleanId(value, fallback = '') {
  const text = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').trim();
  return text.slice(0, 48) || fallback;
}

async function loadDb() {
  if (DATABASE_URL) {
    const pool = await getPgPool();
    const result = await pool.query(`
      SELECT player_id, player_name, car_id, car_name, track_id, track_name,
             player_theme_color, lap_ms, sectors, created_at, updated_at
      FROM leaderboard_records
      ORDER BY lap_ms ASC, created_at ASC
      LIMIT 1000
    `);
    return { records: result.rows.map(rowToRecord) };
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabase = await getSupabaseClient();
    let { data, error } = await supabase
      .from('leaderboard_records')
      .select('player_id, player_name, player_theme_color, car_id, car_name, track_id, track_name, lap_ms, sectors, created_at, updated_at')
      .order('lap_ms', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error && String(error.message || '').includes('player_theme_color')) {
      const legacy = await supabase
        .from('leaderboard_records')
        .select('player_id, player_name, car_id, car_name, track_id, track_name, lap_ms, sectors, created_at, updated_at')
        .order('lap_ms', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1000);
      data = legacy.data;
      error = legacy.error;
    }
    if (error) throw error;
    return { records: (data || []).map(rowToRecord) };
  }

  try {
    const raw = await readFile(DB_PATH, 'utf8');
    const db = JSON.parse(raw);
    return { records: Array.isArray(db.records) ? db.records : [] };
  } catch {
    return { records: [] };
  }
}

async function saveDb(db) {
  if (DATABASE_URL) return;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(db, null, 2) + '\n');
}

async function getPgPool() {
  if (!pgPool) {
    const { Pool } = await import('pg');
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
  }
  if (!pgReady) {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard_records (
        player_id TEXT NOT NULL,
        car_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        player_theme_color TEXT NOT NULL DEFAULT '#2ec4b6',
        car_name TEXT NOT NULL,
        track_name TEXT NOT NULL,
        lap_ms INTEGER NOT NULL,
        sectors JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        PRIMARY KEY (player_id, car_id, track_id)
      )
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS leaderboard_track_car_lap_idx
      ON leaderboard_records (track_id, car_id, lap_ms, created_at)
    `);
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS leaderboard_global_lap_idx
      ON leaderboard_records (lap_ms, created_at)
    `);
    await pgPool.query(`
      ALTER TABLE leaderboard_records
      ADD COLUMN IF NOT EXISTS player_theme_color TEXT NOT NULL DEFAULT '#2ec4b6'
    `);
    await pgPool.query('ALTER TABLE leaderboard_records ENABLE ROW LEVEL SECURITY');
    await pgPool.query('REVOKE ALL ON TABLE leaderboard_records FROM anon, authenticated');
    pgReady = true;
  }
  return pgPool;
}

function rowToRecord(row) {
  return {
    playerId: row.player_id ?? row.playerId,
    playerName: row.player_name ?? row.playerName,
    playerThemeColor: normalizeColor(row.player_theme_color ?? row.playerThemeColor) || '#2ec4b6',
    carId: row.car_id ?? row.carId,
    carName: row.car_name ?? row.carName,
    trackId: row.track_id ?? row.trackId,
    trackName: row.track_name ?? row.trackName,
    lapMs: Number(row.lap_ms ?? row.lapMs),
    sectors: Array.isArray(row.sectors) ? row.sectors : [],
    createdAt: Number(row.created_at ?? row.createdAt),
    updatedAt: Number(row.updated_at ?? row.updatedAt),
  };
}

async function getSupabaseClient() {
  if (!supabaseClient) {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseClient;
}

function getLeaderboard(db, carId, trackId, limit = 10) {
  return db.records
    .filter(r => (!carId || r.carId === carId) && (!trackId || r.trackId === trackId))
    .sort((a, b) => a.lapMs - b.lapMs || a.createdAt - b.createdAt)
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map((r, index) => ({ ...r, rank: index + 1 }));
}

function broadcast(payload) {
  const data = `event: leaderboard\nid: ${Date.now()}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of CLIENTS) res.write(data);
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handleGetLeaderboard(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = await loadDb();
  const carId = cleanId(url.searchParams.get('carId'));
  const trackId = cleanId(url.searchParams.get('trackId'));
  const limit = Number(url.searchParams.get('limit') || 10);
  sendJson(res, 200, { leaderboard: getLeaderboard(db, carId, trackId, limit) });
}

async function handlePostLeaderboard(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: '잘못된 요청입니다.' });
    return;
  }

  const lapMs = Math.round(Number(body.lapMs));
  const carId = cleanId(body.carId);
  const trackId = cleanId(body.trackId);
  const playerId = cleanId(body.playerId);

  if (!playerId || !carId || !trackId || !Number.isFinite(lapMs) || lapMs < 1000 || lapMs > 30 * 60 * 1000) {
    sendJson(res, 422, { error: '기록 데이터가 올바르지 않습니다.' });
    return;
  }

  const now = Date.now();
  const record = {
    playerId,
    playerName: safeNickname(cleanText(body.playerName, 'Driver'), 'Driver'),
    playerThemeColor: normalizeColor(body.playerThemeColor) || '#2ec4b6',
    carId,
    carName: cleanText(body.carName, carId),
    trackId,
    trackName: cleanText(body.trackName, trackId),
    lapMs,
    sectors: Array.isArray(body.sectors)
      ? body.sectors.slice(0, 3).map(v => Number.isFinite(Number(v)) ? Math.round(Number(v)) : null)
      : [],
    createdAt: now,
    updatedAt: now,
  };

  const db = await loadDb();
  const existing = db.records.find(r => r.playerId === playerId && r.carId === carId && r.trackId === trackId);
  let improved = false;

  if (DATABASE_URL) {
    improved = !existing || lapMs < existing.lapMs;
    await upsertPgRecord(record, existing);
  } else if (SUPABASE_URL && SUPABASE_KEY) {
    improved = !existing || lapMs < existing.lapMs;
    await upsertSupabaseRecord(record);
  } else {
    if (!existing) {
      db.records.push(record);
      improved = true;
    } else if (lapMs < existing.lapMs) {
      Object.assign(existing, record, { createdAt: existing.createdAt, updatedAt: now });
      improved = true;
    } else {
      existing.playerName = record.playerName;
      existing.playerThemeColor = record.playerThemeColor;
      existing.updatedAt = now;
    }

    db.records = db.records
      .sort((a, b) => a.lapMs - b.lapMs || a.createdAt - b.createdAt)
      .slice(0, 1000);
    await saveDb(db);
  }

  const nextDb = (DATABASE_URL || (SUPABASE_URL && SUPABASE_KEY)) ? await loadDb() : db;
  const leaderboard = getLeaderboard(nextDb, '', trackId, 20);
  const rank = leaderboard.find(r => r.playerId === playerId)?.rank ?? null;
  if (improved) broadcast({ carId, trackId, leaderboard });

  sendJson(res, 200, { accepted: true, improved, rank, leaderboard });
}

async function upsertPgRecord(record, existing) {
  const pool = await getPgPool();
  const createdAt = existing?.createdAt ?? record.createdAt;
  const shouldReplaceLap = !existing || record.lapMs < existing.lapMs;
  const saved = shouldReplaceLap
    ? record
    : { ...existing, playerName: record.playerName, playerThemeColor: record.playerThemeColor, updatedAt: record.updatedAt };

  await pool.query(`
    INSERT INTO leaderboard_records (
      player_id, player_name, car_id, car_name, track_id, track_name,
      player_theme_color, lap_ms, sectors, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (player_id, car_id, track_id) DO UPDATE SET
      player_name = EXCLUDED.player_name,
      player_theme_color = EXCLUDED.player_theme_color,
      car_name = CASE
        WHEN EXCLUDED.lap_ms < leaderboard_records.lap_ms THEN EXCLUDED.car_name
        ELSE leaderboard_records.car_name
      END,
      track_name = CASE
        WHEN EXCLUDED.lap_ms < leaderboard_records.lap_ms THEN EXCLUDED.track_name
        ELSE leaderboard_records.track_name
      END,
      lap_ms = LEAST(leaderboard_records.lap_ms, EXCLUDED.lap_ms),
      sectors = CASE
        WHEN EXCLUDED.lap_ms < leaderboard_records.lap_ms THEN EXCLUDED.sectors
        ELSE leaderboard_records.sectors
      END,
      updated_at = EXCLUDED.updated_at
  `, [
    saved.playerId,
    saved.playerName,
    saved.carId,
    saved.carName,
    saved.trackId,
    saved.trackName,
    saved.playerThemeColor,
    saved.lapMs,
    JSON.stringify(saved.sectors || []),
    createdAt,
    record.updatedAt,
  ]);
}

async function upsertSupabaseRecord(record) {
  const supabase = await getSupabaseClient();
  const payload = {
    player_id: record.playerId,
    player_name: record.playerName,
    player_theme_color: record.playerThemeColor,
    car_id: record.carId,
    car_name: record.carName,
    track_id: record.trackId,
    track_name: record.trackName,
    lap_ms: record.lapMs,
    sectors: record.sectors || [],
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
  let { error } = await supabase
    .from('leaderboard_records')
    .upsert(payload, { onConflict: 'player_id,car_id,track_id' });
  if (error && String(error.message || '').includes('player_theme_color')) {
    const { player_theme_color, ...legacyPayload } = payload;
    const legacy = await supabase
      .from('leaderboard_records')
      .upsert(legacyPayload, { onConflict: 'player_id,car_id,track_id' });
    error = legacy.error;
  }
  if (error) throw error;
}

function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: connected\ndata: {}\n\n');
  CLIENTS.add(res);
  req.on('close', () => CLIENTS.delete(res));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(ROOT, requested));

  if (!filePath.startsWith(ROOT) || filePath.includes('/.')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const type = MIME[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.writeHead(404);
      res.end('Not found');
    })
    .pipe(res);
}

function getLanUrls() {
  const urls = [`http://localhost:${PORT}`];
  for (const entries of Object.values(networkInterfaces())) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) urls.push(`http://${net.address}:${PORT}`);
    }
  }
  return urls;
}

function normalizeColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : null;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url.startsWith('/api/leaderboard/stream')) {
      handleStream(req, res);
    } else if (req.method === 'GET' && req.url.startsWith('/api/leaderboard')) {
      await handleGetLeaderboard(req, res);
    } else if (req.method === 'POST' && req.url === '/api/leaderboard') {
      await handlePostLeaderboard(req, res);
    } else if (req.method === 'GET' && req.url === '/api/mp/stats') {
      sendJson(res, 200, mpStats());
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res);
    } else {
      sendJson(res, 405, { error: 'Method not allowed' });
    }
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: '서버 오류가 발생했습니다.' });
  }
});

attachMultiplayer(server, '/api/mp');

server.listen(PORT, '0.0.0.0', () => {
  console.log('Racing leaderboard server is running:');
  for (const url of getLanUrls()) console.log(`  ${url}`);
  console.log('Multiplayer WebSocket: ws://<host>/api/mp');
});
