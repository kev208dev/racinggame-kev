const FALLBACK_NICKNAME = 'Driver';
const MAX_NICKNAME_LENGTH = 24;
const REJECT_MESSAGE = '닉네임에 사용할 수 없는 표현이 들어있어요. 조금만 바꿔주세요.';

const BLOCKED_FRAGMENTS = [
  '씨발', '시발', 'ㅅㅂ', 'ㅆㅂ', '씹', '개새', '병신', 'ㅂㅅ', '지랄', '좆',
  '보지', '자지', '섹스', '느금', '니애미',
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'pussy',
  'nigger', 'nigga', 'faggot', 'retard',
];

const URL_PATTERN = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|gg|io|kr|co)\b)/i;

export function cleanNickname(value, fallback = FALLBACK_NICKNAME) {
  const text = String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NICKNAME_LENGTH);
  return text || fallback;
}

export function isNicknameAllowed(value) {
  const text = cleanNickname(value, '');
  if (!text) return false;
  if (URL_PATTERN.test(text)) return false;
  const compact = normalizeForCheck(text);
  return !BLOCKED_FRAGMENTS.some(word => compact.includes(normalizeForCheck(word)));
}

export function validateNickname(value, fallback = FALLBACK_NICKNAME) {
  const nickname = cleanNickname(value, fallback);
  if (!isNicknameAllowed(nickname)) {
    const error = new Error(REJECT_MESSAGE);
    error.code = 'bad-nickname';
    throw error;
  }
  return nickname;
}

export function safeNickname(value, fallback = FALLBACK_NICKNAME) {
  const nickname = cleanNickname(value, fallback);
  return isNicknameAllowed(nickname) ? nickname : fallback;
}

export function nicknameRejectMessage() {
  return REJECT_MESSAGE;
}

function normalizeForCheck(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^\p{L}\p{N}ㄱ-ㅎㅏ-ㅣ가-힣]/gu, '');
}
