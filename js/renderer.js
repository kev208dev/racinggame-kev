// Shared WebGLRenderer so solo and multiplayer screens reuse a single
// WebGL context on the same canvas across mode switches.
import * as THREE from 'three';

let renderer = null;

export function getSharedRenderer(canvas) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  return renderer;
}
