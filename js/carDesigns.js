import * as THREE from 'three';

/*
Codex 전달용 프롬프트

내 Three.js 웹 레이싱 게임에 자동차 디자인을 여러 개 추가해줘.
기존에 넣었던 빨간색 미래형 F1/포뮬러 자동차 디자인은 유지하고, 아래 코드에 포함된 7개의 추가 자동차 디자인도 선택 가능하게 넣어줘.

요구사항:
1. 기존 조작, 카메라, 물리, 충돌, 랭킹, UI 코드는 건드리지 마라.
2. 자동차의 시각 모델만 교체/선택 가능하게 만들어라.
3. 외부 glb, obj, 이미지 텍스처를 추가하지 마라.
4. Three.js 기본 Geometry만 사용해라.
5. 아래 createCarDesign(type) 함수를 프로젝트에 추가해라.
6. 기존 playerCar 또는 car 그룹 안에 createCarDesign(type) 결과를 child로 추가해라.
7. 디자인 선택값은 문자열로 관리해라.
8. 자동차 방향이 안 맞으면 model.rotation.y 또는 model.rotation.z만 조정해라.
9. 크기가 안 맞으면 model.scale.set(...)만 조정해라.
10. 수정한 파일과 위치를 설명해라.

추가할 자동차 디자인 목록:
- formula_red: 기존 빨간색 미래형 F1/포뮬러 자동차
- gt_silver: 흰색/실버 GT 트랙카
- cyber_black: 검은색 사이버 하이퍼카
- rally_blue: 파란색 랠리카
- muscle_orange: 주황색 머슬카
- hyper_purple: 보라색 미래형 하이퍼카
- buggy_yellow: 노란색 오프로드 버기
- classic_green: 초록색 클래식 레이싱카

사용 예시:
const model = createCarDesign('formula_red');
playerCar.add(model);
*/

export function createCarDesign(type = 'formula_red') {
  const factories = {
    formula_red: createFormulaRedCarModel,
    gt_silver: createGTSilverCarModel,
    cyber_black: createCyberBlackCarModel,
    rally_blue: createRallyBlueCarModel,
    muscle_orange: createMuscleOrangeCarModel,
    hyper_purple: createHyperPurpleCarModel,
    buggy_yellow: createBuggyYellowCarModel,
    classic_green: createClassicGreenCarModel,
  };

  const factory = factories[type] || factories.formula_red;
  const car = factory();
  addCurvedSportsShellTo(car, type);
  addBoostFlameTo(car);
  car.userData.designType = type;
  return car;
}

function createCarMaterials() {
  return {
    red: new THREE.MeshStandardMaterial({ color: 0xe11218, roughness: 0.28, metalness: 0.35 }),
    darkRed: new THREE.MeshStandardMaterial({ color: 0x7d0b0f, roughness: 0.35, metalness: 0.25 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f5f6, roughness: 0.32, metalness: 0.22 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.28, metalness: 0.45 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.48, metalness: 0.35 }),
    matteBlack: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.15 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x061018, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.78 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.68, metalness: 0.12 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffc400, roughness: 0.38, metalness: 0.35 }),
    blue: new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.32, metalness: 0.32 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf57c00, roughness: 0.32, metalness: 0.3 }),
    purple: new THREE.MeshStandardMaterial({ color: 0x7b1fa2, roughness: 0.28, metalness: 0.4 }),
    green: new THREE.MeshStandardMaterial({ color: 0x1b7f3a, roughness: 0.35, metalness: 0.28 }),
    cyanGlow: new THREE.MeshStandardMaterial({ color: 0x00d9ff, emissive: 0x0088aa, roughness: 0.2, metalness: 0.2 }),
    redGlow: new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x990000, roughness: 0.2, metalness: 0.2 }),
  };
}

function addBoxTo(group, name, size, pos, mat, rot = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addSphereTo(group, name, radius, pos, scale, mat) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addTaperedBlockTo(group, name, size, pos, mat, frontScale = 0.4, rearScale = 1.0) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2], 2, 1, 6);
  const p = geo.attributes.position;

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const t = (z + size[2] / 2) / size[2];
    const scale = THREE.MathUtils.lerp(rearScale, frontScale, t);
    p.setX(i, x * scale);
    p.setY(i, y + Math.sin(t * Math.PI) * 0.07);
  }

  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addWheelTo(group, name, x, z, radius, width, tireMat, rimMat, y = 0.48) {
  const isRearWheel = z < 0;
  const visualRadius = radius * (isRearWheel ? 1.58 : 1.16);
  const visualWidth = width * (isRearWheel ? 1.58 : 1.22);
  const wheelY = Math.max(y, visualRadius + 0.12);
  const wheel = new THREE.Group();
  wheel.name = name;
  wheel.position.set(x, wheelY, z);
  wheel.rotation.z = Math.PI / 2;

  const pivot = new THREE.Group();
  pivot.name = name + '_pivot';
  wheel.add(pivot);
  wheel.userData.spinPivot = pivot;
  wheel.userData.baseY = wheelY;

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(visualRadius, visualRadius, visualWidth, 32), tireMat);
  tire.name = 'black tire';
  tire.castShadow = true;
  tire.receiveShadow = true;
  pivot.add(tire);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(visualRadius * 0.58, visualRadius * 0.58, visualWidth + 0.035, 20), rimMat);
  rim.name = 'colored wheel rim';
  rim.castShadow = true;
  rim.receiveShadow = true;
  pivot.add(rim);

  for (let i = 0; i < 8; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.055, visualRadius * 1.25, 0.04), rimMat);
    spoke.name = 'wheel spoke';
    spoke.rotation.z = (Math.PI / 8) * i;
    spoke.castShadow = true;
    pivot.add(spoke);
  }

  group.add(wheel);

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.8, Math.abs(x) * 0.9), 0.07, 0.07),
    tireMat
  );
  arm.name = name + ' visible suspension arm';
  arm.position.set(x * 0.45, wheelY + 0.03, z);
  arm.castShadow = true;
  group.add(arm);

  return wheel;
}

function addCurvedSportsShellTo(group, type) {
  const colorByType = {
    formula_red: 0xe11218,
    gt_silver: 0xdce4e8,
    cyber_black: 0x15181c,
    rally_blue: 0x1565c0,
    muscle_orange: 0xf57c00,
    hyper_purple: 0x7b1fa2,
    buggy_yellow: 0xffc400,
    classic_green: 0x1b7f3a,
  };
  const paint = new THREE.MeshStandardMaterial({
    color: colorByType[type] || 0xdce4e8,
    roughness: 0.26,
    metalness: 0.32,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x071018,
    roughness: 0.12,
    metalness: 0.18,
    transparent: true,
    opacity: 0.76,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.48, metalness: 0.25 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), paint);
  body.name = 'smooth curved main body shell';
  body.position.set(0, 0.98, 0.02);
  body.scale.set(type === 'formula_red' ? 0.95 : 1.36, 0.24, type === 'formula_red' ? 2.18 : 2.05);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), paint);
  hood.name = 'smooth curved hood shell';
  hood.position.set(0, 1.08, 1.22);
  hood.scale.set(type === 'formula_red' ? 0.44 : 1.04, 0.12, 1.0);
  hood.castShadow = true;
  group.add(hood);

  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), glass);
  cabin.name = 'smooth curved glass canopy';
  cabin.position.set(0, 1.32, -0.42);
  cabin.scale.set(type === 'formula_red' ? 0.52 : 0.86, 0.28, 0.82);
  cabin.castShadow = true;
  group.add(cabin);

  const lip = new THREE.Mesh(new THREE.BoxGeometry(type === 'formula_red' ? 2.2 : 2.65, 0.08, 0.22), dark);
  lip.name = 'smooth black rear diffuser lip';
  lip.position.set(0, 0.56, -2.32);
  lip.castShadow = true;
  group.add(lip);
}

function addSuspensionArmTo(group, name, x, z, angle, mat) {
  return addBoxTo(group, name, [0.07, 0.07, 1.05], [x, 0.52, z], mat, [0, angle, 0]);
}

function addBoostFlameTo(group) {
  const flame = new THREE.Group();
  flame.name = 'boostflame';
  flame.position.set(0, 0.62, -2.65);
  flame.visible = false;

  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xff4a08,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xfff1a8,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff1f00,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.55, 18), outerMat);
  outer.name = 'flameouter';
  outer.rotation.x = -Math.PI / 2;
  flame.add(outer);

  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.15, 18), innerMat);
  inner.name = 'flameinner';
  inner.rotation.x = -Math.PI / 2;
  inner.position.z = -0.12;
  flame.add(inner);

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 12), glowMat);
  glow.name = 'flameglow';
  glow.scale.set(1.1, 0.55, 1.8);
  glow.position.z = -0.42;
  flame.add(glow);

  group.add(flame);
}

function createFormulaRedCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'formula_red_model';

  addTaperedBlockTo(car, 'long red formula body', [1.05, 0.42, 4.2], [0, 0.72, 0.15], m.red, 0.22, 0.95);
  addTaperedBlockTo(car, 'sharp red front nose', [0.62, 0.32, 2.25], [0, 0.64, 2.55], m.red, 0.12, 0.72);
  addTaperedBlockTo(car, 'rear red engine cover', [1.2, 0.48, 1.45], [0, 0.86, -1.35], m.red, 0.85, 1.1);
  addTaperedBlockTo(car, 'left red side pod', [0.78, 0.36, 1.85], [-0.82, 0.62, -0.35], m.red, 0.75, 1.05);
  addTaperedBlockTo(car, 'right red side pod', [0.78, 0.36, 1.85], [0.82, 0.62, -0.35], m.red, 0.75, 1.05);

  addBoxTo(car, 'center white racing stripe', [0.18, 0.035, 4.65], [0, 0.955, 0.45], m.white);
  addBoxTo(car, 'left thin white stripe', [0.055, 0.036, 3.7], [-0.18, 0.96, 0.25], m.white);
  addBoxTo(car, 'right thin white stripe', [0.055, 0.036, 3.7], [0.18, 0.96, 0.25], m.white);

  addSphereTo(car, 'black glass canopy', 0.46, [0, 1.03, -0.38], [0.82, 0.45, 1.45], m.glass);
  addBoxTo(car, 'front black wing main plane', [2.75, 0.12, 0.28], [0, 0.42, 3.75], m.black);
  addBoxTo(car, 'left red front wing flap', [0.78, 0.11, 0.25], [-0.78, 0.52, 3.55], m.red, [0, 0.12, 0]);
  addBoxTo(car, 'right red front wing flap', [0.78, 0.11, 0.25], [0.78, 0.52, 3.55], m.red, [0, -0.12, 0]);
  addBoxTo(car, 'rear black wing lower blade', [3.05, 0.16, 0.42], [0, 1.28, -2.95], m.black, [-0.04, 0, 0]);
  addBoxTo(car, 'rear black wing upper blade', [3.05, 0.12, 0.34], [0, 1.55, -2.88], m.black, [-0.04, 0, 0]);
  addBoxTo(car, 'left rear red wing endplate', [0.13, 0.72, 0.56], [-1.62, 1.38, -2.92], m.red);
  addBoxTo(car, 'right rear red wing endplate', [0.13, 0.72, 0.56], [1.62, 1.38, -2.92], m.red);

  addWheelTo(car, 'front left exposed wheel', -1.45, 2.1, 0.42, 0.38, m.tire, m.black);
  addWheelTo(car, 'front right exposed wheel', 1.45, 2.1, 0.42, 0.38, m.tire, m.black);
  addWheelTo(car, 'rear left exposed wheel', -1.52, -1.85, 0.5, 0.44, m.tire, m.black);
  addWheelTo(car, 'rear right exposed wheel', 1.52, -1.85, 0.5, 0.44, m.tire, m.black);

  addSuspensionArmTo(car, 'front left upper suspension', -0.72, 1.95, -0.75, m.black);
  addSuspensionArmTo(car, 'front right upper suspension', 0.72, 1.95, 0.75, m.black);
  addSuspensionArmTo(car, 'rear left suspension', -0.82, -1.85, 0.78, m.black);
  addSuspensionArmTo(car, 'rear right suspension', 0.82, -1.85, -0.78, m.black);

  // 기본 전방은 +Z 방향이다. 게임 전방과 반대면 car.rotation.y = Math.PI 적용.
  return car;
}

function createGTSilverCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'gt_silver_track_car_model';

  addTaperedBlockTo(car, 'wide silver gt body', [2.7, 0.5, 4.65], [0, 0.7, 0], m.silver, 0.72, 0.95);
  addTaperedBlockTo(car, 'front hood', [2.25, 0.28, 1.55], [0, 1.0, 1.35], m.silver, 0.72, 0.95);
  addTaperedBlockTo(car, 'wide rear haunch', [2.95, 0.38, 1.45], [0, 0.92, -1.25], m.silver, 0.92, 1.1);
  addSphereTo(car, 'dark rounded cabin', 0.82, [0, 1.23, -0.28], [1.05, 0.45, 1.2], m.glass);

  addBoxTo(car, 'black front splitter', [2.95, 0.14, 0.35], [0, 0.42, 2.5], m.black);
  addBoxTo(car, 'black side skirt left', [0.14, 0.18, 3.6], [-1.43, 0.48, -0.08], m.black);
  addBoxTo(car, 'black side skirt right', [0.14, 0.18, 3.6], [1.43, 0.48, -0.08], m.black);
  addBoxTo(car, 'red left side stripe', [0.06, 0.1, 1.9], [-1.52, 0.76, -0.2], m.red);
  addBoxTo(car, 'red right side stripe', [0.06, 0.1, 1.9], [1.52, 0.76, -0.2], m.red);
  addBoxTo(car, 'large black rear wing', [3.3, 0.14, 0.45], [0, 1.8, -2.35], m.black);
  addBoxTo(car, 'left rear wing stand', [0.12, 0.7, 0.16], [-0.78, 1.42, -2.2], m.black);
  addBoxTo(car, 'right rear wing stand', [0.12, 0.7, 0.16], [0.78, 1.42, -2.2], m.black);
  addBoxTo(car, 'left hood vent', [0.35, 0.06, 0.55], [-0.55, 1.18, 1.45], m.black);
  addBoxTo(car, 'right hood vent', [0.35, 0.06, 0.55], [0.55, 1.18, 1.45], m.black);

  addSphereTo(car, 'left round headlight', 0.22, [-0.82, 0.98, 2.1], [0.85, 0.24, 1.0], m.white);
  addSphereTo(car, 'right round headlight', 0.22, [0.82, 0.98, 2.1], [0.85, 0.24, 1.0], m.white);

  addWheelTo(car, 'front left red wheel', -1.38, 1.35, 0.45, 0.34, m.tire, m.red);
  addWheelTo(car, 'front right red wheel', 1.38, 1.35, 0.45, 0.34, m.tire, m.red);
  addWheelTo(car, 'rear left red wheel', -1.38, -1.45, 0.48, 0.36, m.tire, m.red);
  addWheelTo(car, 'rear right red wheel', 1.38, -1.45, 0.48, 0.36, m.tire, m.red);

  return car;
}

function createCyberBlackCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'cyber_black_hypercar_model';

  addTaperedBlockTo(car, 'sharp black wedge body', [2.45, 0.42, 4.55], [0, 0.68, 0], m.matteBlack, 0.45, 1.0);
  addTaperedBlockTo(car, 'low angular nose', [1.75, 0.28, 1.65], [0, 0.76, 1.65], m.black, 0.25, 0.9);
  addBoxTo(car, 'cyan center light stripe', [0.12, 0.04, 4.2], [0, 0.96, 0.25], m.cyanGlow);
  addBoxTo(car, 'left cyan side light', [0.05, 0.05, 2.6], [-1.18, 0.72, 0.1], m.cyanGlow);
  addBoxTo(car, 'right cyan side light', [0.05, 0.05, 2.6], [1.18, 0.72, 0.1], m.cyanGlow);
  addSphereTo(car, 'teardrop black glass canopy', 0.72, [0, 1.05, -0.35], [0.78, 0.32, 1.25], m.glass);
  addBoxTo(car, 'flat rear cyber spoiler', [2.75, 0.12, 0.35], [0, 1.24, -2.35], m.black);
  addBoxTo(car, 'front black splitter', [2.4, 0.1, 0.32], [0, 0.38, 2.42], m.black);

  addWheelTo(car, 'front left black wheel', -1.25, 1.35, 0.42, 0.34, m.tire, m.cyanGlow);
  addWheelTo(car, 'front right black wheel', 1.25, 1.35, 0.42, 0.34, m.tire, m.cyanGlow);
  addWheelTo(car, 'rear left black wheel', -1.25, -1.35, 0.46, 0.36, m.tire, m.cyanGlow);
  addWheelTo(car, 'rear right black wheel', 1.25, -1.35, 0.46, 0.36, m.tire, m.cyanGlow);

  return car;
}

function createRallyBlueCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'rally_blue_car_model';

  addTaperedBlockTo(car, 'compact blue rally body', [2.35, 0.58, 3.65], [0, 0.78, 0], m.blue, 0.75, 0.95);
  addBoxTo(car, 'white rally roof panel', [1.45, 0.08, 1.25], [0, 1.3, -0.35], m.white);
  addSphereTo(car, 'dark rally cabin', 0.72, [0, 1.18, -0.25], [1.0, 0.42, 1.12], m.glass);
  addBoxTo(car, 'front rally bumper', [2.45, 0.22, 0.35], [0, 0.5, 2.05], m.black);
  addBoxTo(car, 'rear rally bumper', [2.35, 0.22, 0.35], [0, 0.5, -2.02], m.black);
  addBoxTo(car, 'small blue rear wing', [2.3, 0.12, 0.35], [0, 1.45, -1.92], m.blue);
  addBoxTo(car, 'left mud flap', [0.12, 0.55, 0.18], [-1.27, 0.45, -1.45], m.black);
  addBoxTo(car, 'right mud flap', [0.12, 0.55, 0.18], [1.27, 0.45, -1.45], m.black);
  addBoxTo(car, 'white center rally stripe', [0.22, 0.04, 3.2], [0, 1.08, 0.12], m.white);

  addWheelTo(car, 'front left rally wheel', -1.15, 1.22, 0.43, 0.32, m.tire, m.white);
  addWheelTo(car, 'front right rally wheel', 1.15, 1.22, 0.43, 0.32, m.tire, m.white);
  addWheelTo(car, 'rear left rally wheel', -1.15, -1.22, 0.43, 0.32, m.tire, m.white);
  addWheelTo(car, 'rear right rally wheel', 1.15, -1.22, 0.43, 0.32, m.tire, m.white);

  return car;
}

function createMuscleOrangeCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'muscle_orange_car_model';

  addTaperedBlockTo(car, 'long orange muscle body', [2.55, 0.55, 4.35], [0, 0.72, 0], m.orange, 0.78, 0.95);
  addTaperedBlockTo(car, 'long hood', [2.1, 0.25, 1.65], [0, 1.02, 1.35], m.orange, 0.75, 0.95);
  addBoxTo(car, 'black hood scoop', [0.72, 0.18, 0.55], [0, 1.2, 1.25], m.black);
  addSphereTo(car, 'dark rectangular cabin softened', 0.74, [0, 1.18, -0.45], [1.2, 0.38, 0.95], m.glass);
  addBoxTo(car, 'black front grille', [1.65, 0.22, 0.16], [0, 0.72, 2.22], m.black);
  addBoxTo(car, 'black rear lip spoiler', [2.2, 0.12, 0.3], [0, 1.18, -2.02], m.black);
  addBoxTo(car, 'black left racing stripe', [0.13, 0.04, 3.9], [-0.18, 1.1, 0.15], m.black);
  addBoxTo(car, 'black right racing stripe', [0.13, 0.04, 3.9], [0.18, 1.1, 0.15], m.black);

  addWheelTo(car, 'front left muscle wheel', -1.28, 1.25, 0.45, 0.34, m.tire, m.black);
  addWheelTo(car, 'front right muscle wheel', 1.28, 1.25, 0.45, 0.34, m.tire, m.black);
  addWheelTo(car, 'rear left muscle wheel', -1.28, -1.35, 0.52, 0.38, m.tire, m.black);
  addWheelTo(car, 'rear right muscle wheel', 1.28, -1.35, 0.52, 0.38, m.tire, m.black);

  return car;
}

function createHyperPurpleCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'hyper_purple_car_model';

  addTaperedBlockTo(car, 'purple hypercar body', [2.55, 0.42, 4.75], [0, 0.68, 0], m.purple, 0.35, 1.0);
  addTaperedBlockTo(car, 'thin pointed nose', [1.35, 0.25, 1.75], [0, 0.82, 1.75], m.purple, 0.18, 0.85);
  addSphereTo(car, 'bubble glass canopy', 0.76, [0, 1.05, -0.32], [0.9, 0.34, 1.35], m.glass);
  addBoxTo(car, 'cyan left headlight slash', [0.58, 0.055, 0.08], [-0.56, 0.92, 2.2], m.cyanGlow, [0, 0.28, 0]);
  addBoxTo(car, 'cyan right headlight slash', [0.58, 0.055, 0.08], [0.56, 0.92, 2.2], m.cyanGlow, [0, -0.28, 0]);
  addBoxTo(car, 'black central aero channel', [0.35, 0.05, 2.6], [0, 0.96, 0.25], m.black);
  addBoxTo(car, 'floating rear wing', [2.85, 0.12, 0.36], [0, 1.32, -2.25], m.black);
  addBoxTo(car, 'left wing support', [0.1, 0.55, 0.1], [-0.55, 1.02, -2.05], m.black);
  addBoxTo(car, 'right wing support', [0.1, 0.55, 0.1], [0.55, 1.02, -2.05], m.black);

  addWheelTo(car, 'front left purple wheel', -1.25, 1.35, 0.43, 0.32, m.tire, m.cyanGlow);
  addWheelTo(car, 'front right purple wheel', 1.25, 1.35, 0.43, 0.32, m.tire, m.cyanGlow);
  addWheelTo(car, 'rear left purple wheel', -1.3, -1.35, 0.47, 0.35, m.tire, m.cyanGlow);
  addWheelTo(car, 'rear right purple wheel', 1.3, -1.35, 0.47, 0.35, m.tire, m.cyanGlow);

  return car;
}

function createBuggyYellowCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'buggy_yellow_offroad_model';

  addTaperedBlockTo(car, 'short yellow buggy body', [1.8, 0.45, 3.35], [0, 0.7, 0], m.yellow, 0.65, 0.95);
  addBoxTo(car, 'black roll cage front', [1.35, 0.08, 0.08], [0, 1.35, 0.45], m.black);
  addBoxTo(car, 'black roll cage rear', [1.35, 0.08, 0.08], [0, 1.35, -0.75], m.black);
  addBoxTo(car, 'left roll cage rail', [0.08, 0.08, 1.3], [-0.68, 1.35, -0.15], m.black);
  addBoxTo(car, 'right roll cage rail', [0.08, 0.08, 1.3], [0.68, 1.35, -0.15], m.black);
  addSphereTo(car, 'small dark open cockpit', 0.55, [0, 1.0, -0.25], [0.85, 0.25, 0.9], m.glass);
  addBoxTo(car, 'front offroad bumper', [2.25, 0.18, 0.22], [0, 0.48, 1.9], m.black);
  addBoxTo(car, 'rear offroad bumper', [2.2, 0.18, 0.22], [0, 0.48, -1.85], m.black);
  addBoxTo(car, 'yellow roof light bar', [1.1, 0.12, 0.15], [0, 1.52, 0.1], m.yellow);

  addWheelTo(car, 'front left huge buggy wheel', -1.25, 1.25, 0.55, 0.42, m.tire, m.yellow, 0.5);
  addWheelTo(car, 'front right huge buggy wheel', 1.25, 1.25, 0.55, 0.42, m.tire, m.yellow, 0.5);
  addWheelTo(car, 'rear left huge buggy wheel', -1.25, -1.25, 0.58, 0.44, m.tire, m.yellow, 0.5);
  addWheelTo(car, 'rear right huge buggy wheel', 1.25, -1.25, 0.58, 0.44, m.tire, m.yellow, 0.5);

  addSuspensionArmTo(car, 'front left buggy suspension', -0.65, 1.25, -0.75, m.black);
  addSuspensionArmTo(car, 'front right buggy suspension', 0.65, 1.25, 0.75, m.black);
  addSuspensionArmTo(car, 'rear left buggy suspension', -0.65, -1.25, 0.75, m.black);
  addSuspensionArmTo(car, 'rear right buggy suspension', 0.65, -1.25, -0.75, m.black);

  return car;
}

function createClassicGreenCarModel() {
  const m = createCarMaterials();
  const car = new THREE.Group();
  car.name = 'classic_green_racer_model';

  addTaperedBlockTo(car, 'classic green long body', [1.75, 0.45, 4.4], [0, 0.7, 0], m.green, 0.42, 0.95);
  addTaperedBlockTo(car, 'classic pointed nose', [1.05, 0.34, 1.9], [0, 0.66, 1.45], m.green, 0.22, 0.8);
  addSphereTo(car, 'small vintage windshield', 0.42, [0, 1.02, -0.35], [1.0, 0.32, 0.65], m.glass);
  addBoxTo(car, 'cream center stripe', [0.22, 0.04, 4.35], [0, 0.93, 0.15], m.white);
  addBoxTo(car, 'small rear tail fin', [0.6, 0.55, 0.12], [0, 1.12, -2.1], m.green);
  addBoxTo(car, 'front chrome bumper simplified', [1.65, 0.12, 0.16], [0, 0.45, 2.25], m.silver);
  addBoxTo(car, 'rear chrome bumper simplified', [1.55, 0.12, 0.16], [0, 0.45, -2.25], m.silver);
  addSphereTo(car, 'left vintage headlight', 0.16, [-0.48, 0.78, 2.18], [1, 0.4, 1], m.white);
  addSphereTo(car, 'right vintage headlight', 0.16, [0.48, 0.78, 2.18], [1, 0.4, 1], m.white);

  addWheelTo(car, 'front left classic wheel', -1.0, 1.35, 0.38, 0.28, m.tire, m.silver);
  addWheelTo(car, 'front right classic wheel', 1.0, 1.35, 0.38, 0.28, m.tire, m.silver);
  addWheelTo(car, 'rear left classic wheel', -1.0, -1.35, 0.4, 0.3, m.tire, m.silver);
  addWheelTo(car, 'rear right classic wheel', 1.0, -1.35, 0.4, 0.3, m.tire, m.silver);

  return car;
}

// 브라우저 콘솔 디버깅용. 게임 코드는 ES module import를 사용한다.
if (typeof window !== 'undefined') {
  window.createCarDesign = createCarDesign;
}

/*
간단 테스트 코드:

const selectedCarType = 'formula_red';
const model = createCarDesign(selectedCarType);
scene.add(model);

디자인 이름 목록:
const carDesignTypes = [
  'formula_red',
  'gt_silver',
  'cyber_black',
  'rally_blue',
  'muscle_orange',
  'hyper_purple',
  'buggy_yellow',
  'classic_green',
];
*/
