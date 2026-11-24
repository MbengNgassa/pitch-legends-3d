import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Blender GLB/GLTF Drop-In Asset Loader.
 * Reads `/models/manifest.json` so you can drop custom Blender `.glb` exports
 * into `public/models/` at any time to seamlessly upgrade the ball, players, or stadiums.
 */
class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.manifest = null;
    this.cache = new Map();
    this._manifestPromise = null;
  }

  async ensureManifest() {
    if (this.manifest) return this.manifest;
    const isStandalone =
      typeof window === 'undefined' ||
      !window.location.host ||
      window.location.protocol === 'file:' ||
      window.location.protocol === 'about:' ||
      window.location.protocol === 'data:' ||
      window.location.protocol === 'blob:';
    if (isStandalone) {
      this.manifest = {};
      return this.manifest;
    }
    if (!this._manifestPromise) {
      this._manifestPromise = fetch('/models/manifest.json')
        .then((res) => (res.ok ? res.json() : {}))
        .catch(() => ({}))
        .then((json) => {
          this.manifest = json || {};
          return this.manifest;
        });
    }
    return this._manifestPromise;
  }

  async _loadNormalized(url, targetHeight = null) {
    if (!url) return null;
    if (this.cache.has(url)) {
      return this.cache.get(url).clone(true);
    }
    try {
      const gltf = await this.loader.loadAsync(url);
      const root = gltf.scene;
      root.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      if (targetHeight) {
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        box.getSize(size);
        if (size.y > 0.001) {
          const scale = targetHeight / size.y;
          root.scale.setScalar(scale);
          box.setFromObject(root);
          const center = new THREE.Vector3();
          box.getCenter(center);
          root.position.set(-center.x, -box.min.y, -center.z);
        }
      }

      const wrapper = new THREE.Group();
      wrapper.add(root);
      this.cache.set(url, wrapper);
      return wrapper.clone(true);
    } catch (err) {
      console.warn(`[ModelLoader] Could not load Blender GLB at ${url}, using built-in 3D mesh.`, err);
      return null;
    }
  }

  async loadBallModel(diameter = 1.04) {
    const m = await this.ensureManifest();
    if (!m.ball) return null;
    return this._loadNormalized(m.ball, diameter);
  }

  async loadPlayerModel(playerId, targetHeight = 2.05) {
    const m = await this.ensureManifest();
    const url = (m.players && m.players[playerId]) || m.defaultPlayer || null;
    if (!url) return null;
    return this._loadNormalized(url, targetHeight);
  }

  async loadStadiumModel(stadiumId) {
    const m = await this.ensureManifest();
    const url = (m.stadiums && m.stadiums[stadiumId]) || null;
    if (!url) return null;
    return this._loadNormalized(url, null);
  }
}

export const modelLoader = new ModelLoader();
