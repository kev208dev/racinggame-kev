// Official f1-circuits.com based traces.
// Coordinates are hand-traced from each linked circuit hero map in its original
// image orientation. No mirroring or reshaping is applied.

function buildSourceCenterline(trace, sourceSize, scale = 3.1, targetStep = 34) {
  const points = trace.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first[0] === last[0] && first[1] === last[1]) points.pop();

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  const controls = points.map(([x, y]) => ({
    x: (x - cx) * scale,
    y: (y - cy) * scale,
  }));

  const rounded = roundControls(controls);
  const out = [];
  for (let i = 0; i < rounded.length; i++) {
    const a = rounded[i];
    const b = rounded[(i + 1) % rounded.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(2, Math.ceil(len / targetStep));
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      out.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    }
  }

  return out;
}

function roundControls(controls) {
  if (controls.length < 4) return controls;
  let pts = controls;
  for (let pass = 0; pass < 2; pass++) {
    const nextPts = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      nextPts.push({
        x: a.x * 0.78 + b.x * 0.22,
        y: a.y * 0.78 + b.y * 0.22,
      });
      nextPts.push({
        x: a.x * 0.22 + b.x * 0.78,
        y: a.y * 0.22 + b.y * 0.78,
      });
    }
    pts = nextPts;
  }
  return pts;
}

function offsetWalls(center, width) {
  const N = center.length;
  const outer = [];
  const inner = [];
  for (let i = 0; i < N; i++) {
    const c = center[i];
    const cNext = center[(i + 1) % N];
    const cPrev = center[(i - 1 + N) % N];
    const tx = cNext.x - cPrev.x;
    const ty = cNext.y - cPrev.y;
    const tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl;
    const ny = -tx / tl;
    outer.push([c.x + nx * width / 2, c.y + ny * width / 2]);
    inner.push([c.x - nx * width / 2, c.y - ny * width / 2]);
  }
  return Math.abs(polyArea(outer)) >= Math.abs(polyArea(inner))
    ? { outer, inner }
    : { outer: inner, inner: outer };
}

function polyArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function makeOfficialCircuit({
  id,
  name,
  length,
  difficulty,
  desc,
  character,
  sourceSize,
  trace,
  width,
  scale = 3.1,
  startBackOffset = 130,
  theme = {},
  info = {},
}) {
  const center = buildSourceCenterline(trace, sourceSize, scale);
  const { outer, inner } = offsetWalls(center, width);

  const N = center.length;
  const sc = center[0];
  const scNext = center[1];
  const sAngle = Math.atan2(scNext.y - sc.y, scNext.x - sc.x);
  const halfW = width * 0.58;
  const perpDx = -Math.sin(sAngle);
  const perpDy = Math.cos(sAngle);
  const approxStep = avgStep(center);
  const backSeg = Math.max(3, Math.round(startBackOffset / approxStep));
  const spawnIdx = (N - backSeg) % N;
  const spawn = center[spawnIdx];
  const spawnN = center[(spawnIdx + 1) % N];
  const spawnAngle = Math.atan2(spawnN.y - spawn.y, spawnN.x - spawn.x);

  const startPos = { x: spawn.x, y: spawn.y, angle: spawnAngle };
  const startLine = {
    x1: sc.x + perpDx * halfW, y1: sc.y + perpDy * halfW,
    x2: sc.x - perpDx * halfW, y2: sc.y - perpDy * halfW,
    tx: Math.cos(sAngle), ty: Math.sin(sAngle),
  };

  const sectors = [];
  for (let s = 1; s <= 2; s++) {
    const idx = Math.floor((s * N / 3) % N);
    const c = center[idx];
    const cN = center[(idx + 1) % N];
    const a = Math.atan2(cN.y - c.y, cN.x - c.x);
    const px = -Math.sin(a);
    const py = Math.cos(a);
    sectors.push({
      id: s,
      checkLine: {
        x1: c.x + px * halfW, y1: c.y + py * halfW,
        x2: c.x - px * halfW, y2: c.y - py * halfW,
        tx: Math.cos(a), ty: Math.sin(a),
      },
      color: s === 1 ? (theme.sector1 || '#2ec4b6') : (theme.sector2 || '#c77dff'),
    });
  }

  return {
    id,
    name,
    length,
    difficulty,
    desc,
    character,
    width,
    outerBoundary: outer,
    innerBoundary: inner,
    centerLine: center.map(c => [c.x, c.y]),
    startLine,
    sectors,
    startPos,
    backgroundColor: theme.background || '#4f554d',
    trackColor: theme.track || '#303235',
    accentColor: theme.accent || '#ffd166',
    mapColor: theme.map || '#e7edf3',
    sourceSize,
    ...info,
  };
}

function avgStep(center) {
  let total = 0;
  for (let i = 0; i < center.length; i++) {
    const a = center[i];
    const b = center[(i + 1) % center.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total / center.length;
}

export const TRACKS = [
  makeOfficialCircuit({
    id: 'autodromo_hermanos_rodriguez',
    name: 'Autodromo Hermanos Rodriguez',
    length: '4.304 km',
    difficulty: '보통',
    desc: 'Mexico City Grand Prix 공식 페이지 맵 방향 그대로 적용',
    character: '긴 메인 스트레이트 + Foro Sol 스타디움 섹션',
    width: 138,
    scale: 3.0,
    startBackOffset: 150,
    sourceSize: { width: 1940, height: 1082 },
    theme: { accent: '#d71920', sector1: '#22c55e', sector2: '#facc15', map: '#fff5f5' },
    info: {
      country: 'Mexico',
      gpName: 'Mexico City Grand Prix',
      laps: 71,
      turns: 17,
      elevationChangeM: 0,
      firstGrandPrix: 1963,
      fastestLapRecord: '1:17.774',
      fastestLapDriver: 'Valtteri Bottas',
      polePositionRecord: '1:14.758',
      polePositionDriver: 'Daniel Ricciardo',
      mostWinsDriver: 'Max Verstappen',
      mostWinsCount: 5,
      iconicMomentTitle: '1970: Unsafe Crowds Halt Race',
      famousCorners: ['Foro Sol (Stadium Section)', 'Peraltada'],
      sourceUrl: 'https://f1-circuits.com/circuits/autodromo-hermanos-rodriguez',
    },
    trace: [
      [320, 110], [1580, 110], [1710, 250], [1600, 560], [1460, 900],
      [1365, 780], [1310, 595], [1080, 505], [760, 430], [420, 405],
      [240, 260], [320, 110],
    ],
  }),
  makeOfficialCircuit({
    id: 'pacifica_sweep',
    name: 'Pacifica Sweep GP',
    length: '5.840 km',
    difficulty: '보통',
    desc: '1번 트랙처럼 넓고 읽기 쉬운 고속 밸런스 서킷',
    character: '긴 직선 2개 + 크게 말리는 중속 코너 + 안정적인 탈출 구간',
    width: 152,
    scale: 2.85,
    startBackOffset: 190,
    sourceSize: { width: 1940, height: 1083 },
    theme: { accent: '#14b8a6', sector1: '#3b82f6', sector2: '#facc15', map: '#f0fdfa' },
    info: {
      country: 'Fantasy',
      gpName: 'Pacifica Speed Trial',
      laps: 48,
      turns: 11,
      elevationChangeM: 18,
      firstGrandPrix: 2026,
      fastestLapRecord: 'No record',
      fastestLapDriver: 'Open',
      polePositionRecord: 'No record',
      polePositionDriver: 'Open',
      mostWinsDriver: 'Open',
      mostWinsCount: 0,
      iconicMomentTitle: 'High-Speed Rhythm Course',
      famousCorners: ['Harbor Bend', 'Backstretch Kink'],
    },
    trace: [
      [245, 250], [1510, 245], [1740, 395], [1650, 610], [1390, 760],
      [1180, 905], [880, 915], [420, 805], [235, 560], [390, 390],
      [245, 250],
    ],
  }),
  makeOfficialCircuit({
    id: 'pylon_p_loop',
    name: 'Pylon P-Loop',
    length: '4.920 km',
    difficulty: '어려움',
    desc: 'P자 도로 형태의 브레이킹/재가속 집중 코스',
    character: '긴 세로 스템 + 둥근 P 루프 + 안쪽 타이트 섹션',
    width: 142,
    scale: 2.95,
    startBackOffset: 210,
    sourceSize: { width: 1935, height: 1080 },
    theme: { accent: '#f97316', sector1: '#22c55e', sector2: '#f43f5e', map: '#fff7ed' },
    info: {
      country: 'Fantasy',
      gpName: 'Pylon Technical Cup',
      laps: 62,
      turns: 16,
      elevationChangeM: 22,
      firstGrandPrix: 2026,
      fastestLapRecord: 'No record',
      fastestLapDriver: 'Open',
      polePositionRecord: 'No record',
      polePositionDriver: 'Open',
      mostWinsDriver: 'Open',
      mostWinsCount: 0,
      iconicMomentTitle: 'P-Shaped Brake Test',
      famousCorners: ['P Loop', 'Stem Hairpin'],
    },
    trace: [
      [420, 930], [420, 210], [1110, 205], [1510, 360], [1545, 585],
      [1480, 805], [1290, 970], [970, 1020], [620, 1005], [420, 930],
    ],
  }),
  makeOfficialCircuit({
    id: 'monaco_street',
    name: 'Circuit de Monaco',
    length: '3.337 km',
    difficulty: '매우 어려움',
    desc: 'Monte Carlo 도심을 막아 만든 좁고 까다로운 거리 서킷',
    character: '카지노 광장 + 그랑 호텔 헤어핀 + 터널 + 수영장 섹션',
    width: 128,
    scale: 2.85,
    startBackOffset: 180,
    sourceSize: { width: 1940, height: 1080 },
    theme: { accent: '#dc2626', sector1: '#3b82f6', sector2: '#fbbf24', map: '#fef2f2' },
    info: {
      country: 'Monaco',
      gpName: 'Monaco Grand Prix',
      laps: 78,
      turns: 19,
      elevationChangeM: 42,
      firstGrandPrix: 1929,
      fastestLapRecord: '1:12.909',
      fastestLapDriver: 'Lewis Hamilton',
      polePositionRecord: '1:10.166',
      polePositionDriver: 'Charles Leclerc',
      mostWinsDriver: 'Ayrton Senna',
      mostWinsCount: 6,
      iconicMomentTitle: '1996: Olivier Panis Wins in Chaos',
      famousCorners: ['Casino Square', 'Grand Hotel Hairpin', 'Swimming Pool'],
    },
    trace: [
      [290, 760], [340, 555], [510, 345], [750, 225], [1045, 205],
      [1285, 305], [1450, 490], [1605, 650], [1585, 835], [1440, 980],
      [1210, 1010], [1015, 925], [835, 1000], [600, 950], [405, 855],
      [290, 760],
    ],
  }),
  makeOfficialCircuit({
    id: 'monza_temple',
    name: 'Autodromo Nazionale Monza',
    length: '5.793 km',
    difficulty: '쉬움',
    desc: 'Ferrari의 홈, 초고속 직선과 시케인의 속도 성지',
    character: '긴 메인 스트레이트 + 3개 시케인 + 파라볼리카',
    width: 152,
    scale: 2.75,
    startBackOffset: 240,
    sourceSize: { width: 1940, height: 1080 },
    theme: { accent: '#16a34a', sector1: '#dc2626', sector2: '#f8fafc', map: '#f0fdf4' },
    info: {
      country: 'Italy',
      gpName: 'Italian Grand Prix',
      laps: 53,
      turns: 11,
      elevationChangeM: 12,
      firstGrandPrix: 1950,
      fastestLapRecord: '1:21.046',
      fastestLapDriver: 'Rubens Barrichello',
      polePositionRecord: '1:18.887',
      polePositionDriver: 'Lewis Hamilton',
      mostWinsDriver: 'Michael Schumacher',
      mostWinsCount: 5,
      iconicMomentTitle: 'Temple of Speed',
      famousCorners: ['Variante del Rettifilo', 'Curva Grande', 'Parabolica'],
    },
    trace: [
      [220, 800], [1510, 800], [1665, 720], [1735, 580], [1695, 430],
      [1570, 270], [1385, 185], [1210, 240], [1150, 350], [995, 355],
      [850, 440], [710, 535], [540, 605], [380, 680], [270, 785],
      [255, 900], [355, 980], [560, 1000], [720, 925], [610, 835],
      [220, 800],
    ],
  }),
  makeOfficialCircuit({
    id: 'aurora_endurance',
    name: 'Aurora Endurance',
    length: '11.620 km',
    difficulty: '매우 어려움',
    desc: '기존 맵보다 약 두 배 긴 장거리 변수형 서킷',
    character: '초장거리 직선 + 연속 S 코너 + 고저차 리듬 + 마지막 헤어핀',
    width: 150,
    scale: 4.15,
    startBackOffset: 120,
    sourceSize: { width: 1940, height: 1080 },
    theme: { accent: '#38bdf8', sector1: '#facc15', sector2: '#fb7185', map: '#ecfeff', background: '#26384a', track: '#2f343b' },
    info: {
      country: 'Fantasy',
      gpName: 'Aurora Long Trial',
      laps: 24,
      turns: 28,
      elevationChangeM: 64,
      firstGrandPrix: 2026,
      fastestLapRecord: 'No record',
      fastestLapDriver: 'Open',
      polePositionRecord: 'No record',
      polePositionDriver: 'Open',
      mostWinsDriver: 'Open',
      mostWinsCount: 0,
      iconicMomentTitle: 'Double-Length Variable Course',
      famousCorners: ['North Lights', 'Mirror Esses', 'Last Dawn Hairpin'],
    },
    trace: [
      [170, 815], [510, 760], [875, 820], [1275, 775], [1700, 705],
      [1835, 545], [1725, 390], [1465, 310], [1190, 190], [860, 170],
      [590, 250], [360, 385], [235, 555], [305, 720], [570, 825],
      [890, 900], [1225, 875], [1515, 785], [1640, 895], [1480, 1000],
      [1115, 1015], [770, 945], [465, 990], [250, 930], [170, 815],
    ],
  }),
];
