const ACCOUNTS_KEY = 'racing_local_accounts';
const SESSION_KEY = 'racing_local_session';
const PURGE_FLAG_KEY = 'racing_accounts_purged_v2';
const LEGACY_KEYS = [
  'racing_player_profile',
  'racing_auth_email_cooldown_until',
  'sb-fcexjurcapptmiagdcxn-auth-token',
  'racing_accounts_purged_v1',
];

const ID_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

let currentUser = null;
const listeners = new Set();

function purgeLegacyAccounts() {
  if (localStorage.getItem(PURGE_FLAG_KEY) === '1') return;
  localStorage.removeItem(ACCOUNTS_KEY);
  localStorage.removeItem(SESSION_KEY);
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem(PURGE_FLAG_KEY, '1');
}

function readAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}::${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeId(id) {
  return String(id || '').trim();
}

function toUser(account) {
  return account ? { id: account.id, createdAt: account.createdAt } : null;
}

export async function initAuth() {
  purgeLegacyAccounts();
  const session = readSession();
  const accounts = readAccounts();
  const account = session?.accountId ? accounts[session.accountId] : null;
  if (account) {
    currentUser = toUser(account);
  } else {
    currentUser = null;
    if (session) writeSession(null);
  }
  notify();
}

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return !!currentUser;
}

export function onAuthChange(listener) {
  listeners.add(listener);
  listener(currentUser);
  return () => listeners.delete(listener);
}

export function accountExists(id) {
  const cleanId = normalizeId(id);
  if (!cleanId) return false;
  return !!readAccounts()[cleanId];
}

export async function signUpLocal(id, password) {
  const cleanId = normalizeId(id);
  if (!ID_PATTERN.test(cleanId)) {
    const err = new Error('invalid-id');
    err.code = 'invalid-id';
    throw err;
  }
  const pwd = String(password || '');
  if (pwd.length < 4) {
    const err = new Error('invalid-password');
    err.code = 'invalid-password';
    throw err;
  }
  const accounts = readAccounts();
  if (accounts[cleanId]) {
    const err = new Error('id-taken');
    err.code = 'id-taken';
    throw err;
  }
  const salt = makeSalt();
  const passwordHash = await hashPassword(pwd, salt);
  accounts[cleanId] = {
    id: cleanId,
    passwordSalt: salt,
    passwordHash,
    createdAt: Date.now(),
  };
  writeAccounts(accounts);
  writeSession({ accountId: cleanId });
  currentUser = toUser(accounts[cleanId]);
  notify();
  return currentUser;
}

export async function signInLocal(id, password) {
  const cleanId = normalizeId(id);
  const accounts = readAccounts();
  const account = accounts[cleanId];
  if (!account) {
    const err = new Error('no-account');
    err.code = 'no-account';
    throw err;
  }
  const candidate = await hashPassword(String(password || ''), account.passwordSalt || '');
  if (candidate !== account.passwordHash) {
    const err = new Error('wrong-password');
    err.code = 'wrong-password';
    throw err;
  }
  writeSession({ accountId: cleanId });
  currentUser = toUser(account);
  notify();
  return currentUser;
}

export async function signOut() {
  writeSession(null);
  currentUser = null;
  notify();
}

function notify() {
  for (const fn of listeners) fn(currentUser);
}
