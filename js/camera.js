export function createCamera(canvasW, canvasH) {
  return {
    x: 0, y: 0,
    mode: 'chase', // 'top' or 'chase'
    zoom: 1,
    canvasW,
    canvasH,
  };
}

export function updateCamera(cam, car) {
  if (cam.mode === 'top') {
    cam.x = car.x - cam.canvasW / 2;
    cam.y = car.y - cam.canvasH / 2;
  } else {
    // chase cam: smooth follow
    const tx = car.x - cam.canvasW / 2;
    const ty = car.y - cam.canvasH / 2;
    cam.x += (tx - cam.x) * 0.12;
    cam.y += (ty - cam.y) * 0.12;
  }
}

export function applyCamera(ctx, cam) {
  ctx.translate(-cam.x, -cam.y);
}
