import { getCurrentUser } from './auth.js';
import { getProfile, isOwned } from './profile.js';

export function isCarUnlocked(car) {
  return isOwned(car?.id);
}

export function unlockText(car) {
  if (!car) return '';
  if (!getCurrentUser()) return '로그인하면 코인으로 구매 가능';
  if (isOwned(car.id)) return '소유 중';
  if (Number(car.price || 0) <= 0) return '무료 해금';
  return `${Number(car.price || 0).toLocaleString()} coins`;
}

export function unlockProgressText(car) {
  if (!car) return '';
  const profile = getProfile();
  if (!getCurrentUser()) return '게스트는 기본 차량만 사용 가능';
  if (isOwned(car.id)) return '바로 사용 가능';
  const price = Number(car.price || 0);
  if (price <= 0) return '구매 버튼으로 즉시 해금';
  const coins = Number(profile?.coins || 0);
  if (coins >= price) return `구매 가능 · 보유 ${coins.toLocaleString()} coins`;
  return `${Math.max(0, price - coins).toLocaleString()} coins 부족`;
}
