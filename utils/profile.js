import { CAR_DATA } from '../data/cars.js';
import { MISSIONS } from '../data/missions.js';
import { SKIN_DATA } from '../data/skins.js';
import { getCurrentUser, onAuthChange } from './auth.js';
import { getPlayerProfile, setLeaderboardIdentity, setPlayerName } from './leaderboard.js';
import { safeNickname, validateNickname } from './nicknameFilter.js';

const PROFILES_KEY = 'racing_local_profiles';
const DEFAULT_OWNED = ['apex_gt3', 'feather_sprint'];
const DEFAULT_SKINS = ['factory'];
const DEFAULT_THEME = '#2ec4b6';
const SUPER_ACCOUNT_IDS = new Set(['admin', 'kev208', 'kev208dev']);
const ACCOUNT_CAR_UNLOCKS = {
  ahgo: ['zero_f1'],
  'i-mtheking': ['zero_f1'],
};
const ALL_CAR_IDS = CAR_DATA.map(car => car.id);
const ALL_SKIN_IDS = SKIN_DATA.map(skin => skin.id);

let profile = null;
let loading = false;
let authUnsub = null;
const listeners = new Set();

export function initProfile() {
  if (authUnsub) return;
  authUnsub = onAuthChange(async user => {
    if (!user) {
      profile = null;
      setLeaderboardIdentity(null);
      notify();
      return;
    }
    loading = true;
    notify();
    try {
      profile = ensureProfile(user);
      setPlayerName(profile.nickname);
      setLeaderboardIdentity({ id: profile.user_id, name: profile.nickname, themeColor: profile.theme_color });
    } catch (error) {
      console.warn('Profile load failed:', error);
      profile = null;
      setLeaderboardIdentity(null);
    } finally {
      loading = false;
      notify();
    }
  });
}

export function getProfile() {
  return profile;
}

export function isProfileLoading() {
  return loading;
}

export function onProfileChange(listener) {
  listeners.add(listener);
  listener(profile);
  return () => listeners.delete(listener);
}

export function getDisplayProfile() {
  if (profile) {
    return {
      id: profile.user_id,
      name: profile.nickname,
      themeColor: profile.theme_color || DEFAULT_THEME,
    };
  }
  const local = getPlayerProfile();
  return { id: local.id, name: local.name, themeColor: DEFAULT_THEME };
}

export function isOwned(carId) {
  if (isSuperAccount()) return ALL_CAR_IDS.includes(carId);
  if (accountUnlockIds().includes(carId)) return true;
  if (!getCurrentUser()) return DEFAULT_OWNED.includes(carId);
  return !!profile?.owned_car_ids?.includes(carId);
}

export function isSkinOwned(skinId) {
  if (isSuperAccount()) return ALL_SKIN_IDS.includes(skinId);
  if (!skinId) return false;
  if (!getCurrentUser()) return DEFAULT_SKINS.includes(skinId);
  return !!profile?.owned_skin_ids?.includes(skinId);
}

export async function updateProfileSettings({ nickname, themeColor }) {
  if (!profile) throw new Error('login-required');
  const cleanName = validateNickname(nickname, profile.nickname);
  const cleanColor = normalizeColor(themeColor) || profile.theme_color || DEFAULT_THEME;
  profile = saveProfile({ ...profile, nickname: cleanName, theme_color: cleanColor });
  setPlayerName(profile.nickname);
  setLeaderboardIdentity({ id: profile.user_id, name: profile.nickname, themeColor: profile.theme_color });
  notify();
  return profile;
}

export async function purchaseCar(car) {
  if (!profile) throw new Error('login-required');
  if (isOwned(car.id)) return profile;
  const price = Number(car.price || 0);
  if (price <= 0) return addOwnedCar(car.id);
  if ((profile.coins || 0) < price) throw new Error('not-enough-coins');
  const nextOwned = unique([...(profile.owned_car_ids || []), car.id]);
  const nextCoins = Math.max(0, (profile.coins || 0) - price);
  profile = saveProfile({ ...profile, coins: nextCoins, owned_car_ids: nextOwned });
  notify();
  return profile;
}

export async function claimStarterCar(carId) {
  if (!profile) throw new Error('login-required');
  if (profile.starter_claimed) return profile;
  const car = CAR_DATA.find(item => item.id === carId);
  if (!car) throw new Error('unknown-car');
  const nextOwned = unique([...(profile.owned_car_ids || []), car.id]);
  profile = saveProfile({ ...profile, owned_car_ids: nextOwned, starter_claimed: true });
  notify();
  return profile;
}

export async function awardMissions(trackId, lapMs, context = {}) {
  if (!profile) return [];
  const completed = new Set(profile.completed_missions || []);
  const rewards = MISSIONS.filter(mission =>
    mission.trackId === trackId &&
    lapMs <= mission.lapMs &&
    !completed.has(mission.id)
  );
  const skinRewards = awardSkinProgress(trackId, context);
  if (!rewards.length && !skinRewards.length) return [];
  const rewardCoins = rewards.reduce((sum, mission) => sum + mission.reward, 0);
  const nextCompleted = unique([...(profile.completed_missions || []), ...rewards.map(m => m.id)]);
  profile = saveProfile({
    ...profile,
    coins: (profile.coins || 0) + rewardCoins,
    completed_missions: nextCompleted,
  });
  notify();
  return [...rewards, ...skinRewards];
}

export function recordTrackPlay(trackId) {
  if (!profile || !trackId) return [];
  const stats = profile.stats || {};
  const trackPlays = { ...(stats.track_plays || {}) };
  trackPlays[trackId] = Number(trackPlays[trackId] || 0) + 1;
  const nextStats = { ...stats, track_plays: trackPlays };
  const owned = new Set(profile.owned_skin_ids || DEFAULT_SKINS);
  const gained = [];

  for (const skin of SKIN_DATA) {
    const unlock = skin.unlock || {};
    if (owned.has(skin.id) || unlock.type !== 'trackPlays') continue;
    if (Object.values(trackPlays).some(count => Number(count) >= Number(unlock.count || 0))) {
      owned.add(skin.id);
      gained.push({ id: `skin_${skin.id}`, name: `${skin.name} 획득`, reward: 0, skin });
    }
  }

  profile = saveProfile({
    ...profile,
    stats: nextStats,
    owned_skin_ids: [...owned],
  });
  notify();
  return gained;
}

export function awardSkinProgress(trackId, context = {}) {
  if (!profile) return [];
  const stats = profile.stats || {};
  const nextStats = {
    ...stats,
    no_throttle_finishes: Number(stats.no_throttle_finishes || 0) + (context.noThrottle ? 1 : 0),
    finishes: Number(stats.finishes || 0) + 1,
  };

  const owned = new Set(profile.owned_skin_ids || DEFAULT_SKINS);
  const gained = [];
  for (const skin of SKIN_DATA) {
    if (owned.has(skin.id)) continue;
    const unlock = skin.unlock || {};
    const ok =
      unlock.type === 'noThrottleFinish' ? !!context.noThrottle :
      unlock.type === 'trackFinish' ? unlock.trackId === trackId :
      false;
    if (ok) {
      owned.add(skin.id);
      gained.push({ id: `skin_${skin.id}`, name: `${skin.name} 획득`, reward: 0, skin });
    }
  }

  profile = saveProfile({
    ...profile,
    stats: nextStats,
    owned_skin_ids: [...owned],
  });
  notify();
  return gained;
}

export function awardRankOneSkin() {
  if (!profile) return null;
  const skin = SKIN_DATA.find(item => item.unlock?.type === 'rankOne');
  if (!skin || isSkinOwned(skin.id)) return null;
  profile = saveProfile({
    ...profile,
    owned_skin_ids: unique([...(profile.owned_skin_ids || DEFAULT_SKINS), skin.id]),
  });
  notify();
  return { id: `skin_${skin.id}`, name: `${skin.name} 획득`, reward: 0, skin };
}

export function getSkinUnlockText(skin) {
  if (!skin) return '';
  if (isSkinOwned(skin.id)) return '보유 중';
  if (!getCurrentUser()) return '로그인 후 이벤트 해금';
  return skin.unlock?.text || '이벤트 조건 달성';
}

export function getSkinProgressText(skin) {
  if (!skin) return '';
  if (isSkinOwned(skin.id)) return '바로 장착 가능';
  const stats = profile?.stats || {};
  const unlock = skin.unlock || {};
  if (unlock.type === 'trackPlays') {
    const best = Math.max(0, ...Object.values(stats.track_plays || {}).map(Number));
    return `${best.toLocaleString()}/${Number(unlock.count || 0).toLocaleString()} 플레이`;
  }
  if (unlock.type === 'noThrottleFinish') {
    return `${Number(stats.no_throttle_finishes || 0)}회 달성`;
  }
  if (unlock.type === 'rankOne') return '온라인 랭킹 1위 필요';
  if (unlock.type === 'trackFinish') {
    return `${unlock.trackId === 'aurora_endurance' ? 'Aurora Endurance' : unlock.trackId} 완주 필요`;
  }
  return '조건을 달성하면 해금';
}

export function rollStarterCar() {
  const pool = CAR_DATA.filter(car => (car.starterWeight || 0) > 0 && !isOwned(car.id));
  const fallback = CAR_DATA.find(car => !isOwned(car.id)) || CAR_DATA[0];
  if (!pool.length) return fallback;
  const total = pool.reduce((sum, car) => sum + car.starterWeight, 0);
  let ticket = Math.random() * total;
  for (const car of pool) {
    ticket -= car.starterWeight;
    if (ticket <= 0) return car;
  }
  return pool[pool.length - 1];
}

function addOwnedCar(carId) {
  const nextOwned = unique([...(profile.owned_car_ids || []), carId]);
  profile = saveProfile({ ...profile, owned_car_ids: nextOwned });
  notify();
  return profile;
}

function readStore() {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(store));
}

function ensureProfile(user) {
  const store = readStore();
  const existing = store[user.id];
  if (existing) {
    let normalized = normalizeProfile(existing, user);
    const accountUnlocks = accountUnlockIds(user);
    if (accountUnlocks.some(id => !normalized.owned_car_ids.includes(id))) {
      normalized = saveProfile({ ...normalized, owned_car_ids: unique([...normalized.owned_car_ids, ...accountUnlocks]) });
    }
    if (isSuperAccount(user) && (
      !ALL_CAR_IDS.every(id => normalized.owned_car_ids.includes(id)) ||
      !ALL_SKIN_IDS.every(id => normalized.owned_skin_ids.includes(id))
    )) {
      normalized = saveProfile({ ...normalized, owned_car_ids: ALL_CAR_IDS, owned_skin_ids: ALL_SKIN_IDS, starter_claimed: true });
    }
    return normalized;
  }
  const local = getPlayerProfile();
  const nickname = safeNickname(local.name || user.id, user.id);
  const fresh = {
    user_id: user.id,
    nickname,
    theme_color: DEFAULT_THEME,
    coins: 0,
    owned_car_ids: isSuperAccount(user) ? ALL_CAR_IDS : unique([...DEFAULT_OWNED, ...accountUnlockIds(user)]),
    owned_skin_ids: isSuperAccount(user) ? ALL_SKIN_IDS : [...DEFAULT_SKINS],
    completed_missions: [],
    stats: {},
    starter_claimed: isSuperAccount(user),
  };
  return saveProfile(fresh);
}

function saveProfile(next) {
  const store = readStore();
  const normalized = normalizeProfile(next);
  store[normalized.user_id] = normalized;
  writeStore(store);
  return normalized;
}

function normalizeProfile(row, user = getCurrentUser()) {
  const owned = Array.isArray(row.owned_car_ids) ? row.owned_car_ids : DEFAULT_OWNED;
  const ownedSkins = Array.isArray(row.owned_skin_ids) ? row.owned_skin_ids : DEFAULT_SKINS;
  const userId = row.user_id || user?.id;
  const accountUnlocks = accountUnlockIds({ id: userId });
  return {
    user_id: userId,
    nickname: safeNickname(row.nickname, 'Driver'),
    theme_color: normalizeColor(row.theme_color) || DEFAULT_THEME,
    coins: Number(row.coins || 0),
    owned_car_ids: isSuperAccount({ id: userId }) ? ALL_CAR_IDS : unique([...owned, ...accountUnlocks]),
    owned_skin_ids: isSuperAccount({ id: userId }) ? ALL_SKIN_IDS : unique([...DEFAULT_SKINS, ...ownedSkins]),
    completed_missions: Array.isArray(row.completed_missions) ? row.completed_missions : [],
    stats: row.stats && typeof row.stats === 'object' ? row.stats : {},
    starter_claimed: isSuperAccount({ id: userId }) || !!row.starter_claimed,
  };
}

function isSuperAccount(user = getCurrentUser()) {
  const id = String(user?.id || '').trim().toLowerCase();
  return SUPER_ACCOUNT_IDS.has(id);
}

function accountUnlockIds(user = getCurrentUser()) {
  const id = String(user?.id || '').trim().toLowerCase();
  return ACCOUNT_CAR_UNLOCKS[id] || [];
}

function normalizeColor(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function notify() {
  for (const fn of listeners) fn(profile);
}
