export const SKIN_DATA = [
  {
    id: 'factory',
    name: 'Factory Paint',
    rarity: 'Default',
    color: '#d7dde8',
    accent: '#2ec4b6',
    description: '기본 차체 도색입니다.',
    unlock: { type: 'default', text: '기본 지급' },
  },
  {
    id: 'ori',
    name: '오리 스킨',
    rarity: 'Event',
    color: '#ffd84a',
    accent: '#ff8a00',
    emissive: '#aa6600',
    description: '오리처럼 노란 차체와 주황 포인트가 들어간 이벤트 스킨입니다.',
    unlock: { type: 'noThrottleFinish', text: 'W/위쪽 방향키 없이 아무 맵 완주' },
  },
  {
    id: 'dino',
    name: '공룡 스킨',
    rarity: 'Event',
    color: '#4ade80',
    accent: '#facc15',
    description: '한 맵을 1000번 플레이한 집념의 증표입니다.',
    unlock: { type: 'trackPlays', count: 1000, text: '같은 맵 1000회 플레이' },
  },
  {
    id: 'minecraft',
    name: '마인크래프트 스킨',
    rarity: 'Event',
    color: '#6bbf59',
    accent: '#7a4a24',
    description: '온라인 랭킹 1위를 찍으면 열립니다.',
    unlock: { type: 'rankOne', text: '아무 맵 온라인 1위 달성' },
  },
  {
    id: 'flame',
    name: '화염 스킨',
    rarity: 'Event',
    color: '#ff4a08',
    accent: '#ffd166',
    emissive: '#aa2200',
    description: '긴 신규 맵을 완주하면 열리는 화염 도색입니다.',
    unlock: { type: 'trackFinish', trackId: 'aurora_endurance', text: 'Aurora Endurance 완주' },
  },
];

export function getSkinById(id) {
  return SKIN_DATA.find(skin => skin.id === id) || SKIN_DATA[0];
}
