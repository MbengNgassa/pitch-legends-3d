import * as THREE from 'three';
import { PITCH } from '../../shared/MatchEngine.js';
import { getClubById } from '../../shared/teamsData.js';
import { getStadiumById } from '../../shared/stadiumsData.js';
import { createSoccerBallTexture } from './TextureFactory.js';
import { PlayerMesh } from './PlayerMesh.js';
import { StadiumBuilder } from './StadiumBuilder.js';
import { modelLoader } from './ModelLoader.js';

/**
 * High-craft Three.js 3D Match & Menu Backdrop Renderer.
 * Features ACES Filmic lighting, soft shadows, dynamic broadcast + goal orbit camera,
 * fiery super-shot trails, confetti & stadium fireworks, and Blender GLB drop-in ball/players/stadiums.
 */
export class Renderer3D {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.webglReady = false;

    const initW = Math.max(320, this.container.clientWidth || window.innerWidth || 800);
    const initH = Math.max(420, this.container.clientHeight || window.innerHeight || 600);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, initW / initH, 0.5, 420);

    const isMobile = initW < 820;

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: !isMobile,
        powerPreference: isMobile ? 'default' : 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
      this.renderer.setSize(initW, initH);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.container.appendChild(this.renderer.domElement);
      this.webglReady = true;
    } catch (err) {
      console.warn('[Renderer3D] WebGL failed to initialize:', err);
      this.renderer = null;
      this.webglReady = false;
    }

    this.mode = 'showcase'; // 'showcase' | 'match'
    this.stadiumBuilder = null;
    this.stadiumData = null;
    this.playerMeshes = new Map();
    this.ballGroup = null;
    this.ballMesh = null;
    this.ballShadow = null;
    this.superHalo = null;

    this.particles = [];
    this.cameraTarget = new THREE.Vector3(0, 1.5, 0);
    this.cameraPos = new THREE.Vector3(0, 26, 36);
    this.shakeAmount = 0;
    this.elapsed = 0;
    this.localSlotId = 'p1';

    this._setupResize();
    if (this.webglReady) {
      try {
        this.loadShowcase('bernabeu');
      } catch (err) {
        console.warn('[Renderer3D] Showcase init error:', err);
      }
    }
  }

  _setupResize() {
    this._onResize = () => {
      if (!this.renderer) return;
      const w = Math.max(320, this.container.clientWidth || window.innerWidth || 800);
      const h = Math.max(420, this.container.clientHeight || window.innerHeight || 600);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._onResize());
      this._ro.observe(this.container);
    }
  }

  _clearScene() {
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.playerMeshes.clear();
    this.particles = [];
    this.stadiumBuilder = null;
    this.ballGroup = null;
  }

  _setupLighting(stadium) {
    this.scene.fog = new THREE.FogExp2(stadium.fogColor, stadium.fogDensity || 0.0022);

    const hemi = new THREE.HemisphereLight(stadium.ambientColor, '#1B4332', stadium.ambientIntensity || 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(stadium.sunColor, stadium.sunIntensity || 2.3);
    const [sx, sy, sz] = stadium.sunPos || [45, 72, 32];
    sun.position.set(sx, sy, sz);
    sun.castShadow = true;
    const shadowRes = (window.innerWidth || 800) < 820 ? 1024 : 2048;
    sun.shadow.mapSize.width = shadowRes;
    sun.shadow.mapSize.height = shadowRes;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 290;
    const d = 92;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Subtle rim/fill light for vivid jersey colors
    const rim = new THREE.DirectionalLight('#E0F2FE', 0.55);
    rim.position.set(-sx * 0.7, 36, -sz * 0.7);
    this.scene.add(rim);
  }

  _buildBall() {
    this.ballGroup = new THREE.Group();

    const ballTex = createSoccerBallTexture();
    const ballMat = new THREE.MeshStandardMaterial({
      map: ballTex,
      roughness: 0.34,
      metalness: 0.08,
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(PITCH.ballRadius, 24, 24), ballMat);
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    this.ballGroup.add(this.ballMesh);

    // Fiery golden aura around Super Shots
    this.superHalo = new THREE.Mesh(
      new THREE.SphereGeometry(PITCH.ballRadius * 1.48, 16, 16),
      new THREE.MeshBasicMaterial({
        color: '#F59E0B',
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.superHalo.visible = false;
    this.ballGroup.add(this.superHalo);

    this.ballGroup.position.set(0, PITCH.ballRadius, 0);
    this.scene.add(this.ballGroup);

    // Crisp ground shadow directly beneath the ball (helps kids judge ball height!)
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(PITCH.ballRadius * 1.15, 20),
      new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.34, depthWrite: false })
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.set(0, 0.04, 0);
    this.scene.add(this.ballShadow);

    // Check if user added a custom Blender ball.glb
    modelLoader.loadBallModel(PITCH.ballRadius * 2).then((glb) => {
      if (!glb || !this.ballGroup) return;
      this.ballMesh.visible = false;
      this.ballGroup.add(glb);
      this.ballMesh = glb;
    });
  }

  /**
   * Renders a live, slowly orbiting 3D stadium behind the Main Menu & Locker screens!
   */
  loadShowcase(stadiumId = 'olembe', homeClubOrId = 'cameroon', awayClubOrId = 'nigeria') {
    this._clearScene();
    this.mode = 'showcase';
    const stadium = getStadiumById(stadiumId);
    const homeClub = typeof homeClubOrId === 'object' && homeClubOrId ? homeClubOrId : getClubById(homeClubOrId);
    const awayClub = typeof awayClubOrId === 'object' && awayClubOrId ? awayClubOrId : getClubById(awayClubOrId);
    this.stadiumData = stadium;

    this._setupLighting(stadium);
    this.stadiumBuilder = new StadiumBuilder(stadium, homeClub, awayClub);
    this.scene.add(this.stadiumBuilder.group);
    this._buildBall();
    this.ballGroup.position.set(0, PITCH.ballRadius, 0);
  }

  /**
   * Initializes the full 3D match scene with real clubs or custom Dream Teams, players, and chosen stadium.
   */
  loadMatch(meta, initialSnapshot, localSlotId = 'p1') {
    this._clearScene();
    this.mode = 'match';
    this.localSlotId = localSlotId;

    const stadium = getStadiumById(meta.stadiumId);
    const homeClub = meta.homeClub || getClubById(meta.homeClubId);
    const awayClub = meta.awayClub || getClubById(meta.awayClubId);
    this.stadiumData = stadium;

    this._setupLighting(stadium);
    this.stadiumBuilder = new StadiumBuilder(stadium, homeClub, awayClub);
    this.scene.add(this.stadiumBuilder.group);
    this._buildBall();

    // Build all 10 3D players (5v5)
    const buildTeamMeshes = (team, roster, club) => {
      roster.forEach((pData, idx) => {
        const id = `${team}_${idx}`;
        const pm = new PlayerMesh(pData, club, idx === 0);
        this.scene.add(pm.group);
        this.playerMeshes.set(id, pm);
      });
    };
    buildTeamMeshes('home', meta.homeRoster, homeClub);
    buildTeamMeshes('away', meta.awayRoster, awayClub);

    if (initialSnapshot) {
      for (const p of initialSnapshot.players) {
        this.playerMeshes.get(p.id)?.snapTo(p);
      }
      this.ballGroup.position.set(initialSnapshot.ball.x, initialSnapshot.ball.y, initialSnapshot.ball.z);
    }

    this.cameraPos.set(0, 27, 36);
    this.cameraTarget.set(0, 1.5, 0);
  }

  handleMatchEvents(events = []) {
    for (const ev of events) {
      if (ev.type === 'supershot') {
        this.shakeAmount = 0.55;
        this._spawnBurst(ev.x, 0.9, ev.z, '#F59E0B', 20, 9);
      } else if (ev.type === 'kick') {
        this.shakeAmount = Math.max(this.shakeAmount, 0.16);
        this._spawnBurst(ev.x, 0.4, ev.z, '#4ADE80', 7, 4.5);
      } else if (ev.type === 'skill') {
        this._spawnBurst(ev.x, 1.0, ev.z, ev.color || '#38BDF8', 14, 6.2);
      } else if (ev.type === 'slide_start') {
        this._spawnBurst(ev.x, 0.25, ev.z, '#4ADE80', 11, 4.8);
      } else if (ev.type === 'slide_win') {
        this.shakeAmount = Math.max(this.shakeAmount, 0.26);
        this._spawnBurst(ev.x, 0.45, ev.z, '#EF4444', 15, 6.5);
      } else if (ev.type === 'barge_start') {
        this._spawnBurst(ev.x, 0.9, ev.z, '#F59E0B', 8, 4.2);
      } else if (ev.type === 'barge_hit') {
        this.shakeAmount = Math.max(this.shakeAmount, 0.28);
        this._spawnBurst(ev.x, 1.15, ev.z, '#F59E0B', 16, 6.8);
      } else if (ev.type === 'wall') {
        const sparkColor = this.stadiumData?.railColor || this.stadiumData?.ledColor || '#38BDF8';
        this._spawnBurst(ev.x, Math.max(0.5, ev.y || 0.6), ev.z, sparkColor, 10, 5.5);
      } else if (ev.type === 'post') {
        this.shakeAmount = 0.45;
        this._spawnBurst(ev.x, 2.2, ev.z, '#FFFFFF', 14, 7);
      } else if (ev.type === 'goal') {
        this.shakeAmount = 0.85;
        this.stadiumBuilder?.triggerGoalCelebration(ev.team);
        const gx = ev.team === 'home' ? PITCH.halfLength : -PITCH.halfLength;
        this._spawnConfetti(gx, 4.5, 0, 75);
        if (this.stadiumData?.fireworksOnGoal) {
          this._spawnFirework(-24, 24, -22, '#FACC15');
          this._spawnFirework(24, 27, -24, '#38BDF8');
          this._spawnFirework(0, 30, -28, '#22C55E');
        }
      }
    }
  }

  _spawnBurst(x, y, z, color, count = 12, speed = 6) {
    const geo = new THREE.SphereGeometry(0.14, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.4 + Math.random() * 0.8) * speed;
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: Math.cos(angle) * spd,
        vy: 2 + Math.random() * speed * 0.7,
        vz: Math.sin(angle) * spd,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        gravity: 14,
      });
    }
  }

  _spawnConfetti(x, y, z, count = 70) {
    const colors = ['#FACC15', '#22C55E', '#38BDF8', '#EF4444', '#FFFFFF', '#FB923C'];
    const geo = new THREE.PlaneGeometry(0.38, 0.22);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 4, y, z + (Math.random() - 0.5) * 10);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 18,
        vy: 6 + Math.random() * 14,
        vz: (Math.random() - 0.5) * 18,
        life: 1.6 + Math.random() * 1.1,
        maxLife: 2.7,
        gravity: 8,
        spin: true,
      });
    }
  }

  _spawnFirework(x, y, z, color) {
    const geo = new THREE.SphereGeometry(0.24, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = 8 + Math.random() * 11;
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: Math.sin(phi) * Math.cos(theta) * spd,
        vy: Math.cos(phi) * spd,
        vz: Math.sin(phi) * Math.sin(theta) * spd,
        life: 1.0 + Math.random() * 0.6,
        maxLife: 1.6,
        gravity: 5,
      });
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= (p.gravity || 12) * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.08, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      if (p.spin) {
        p.mesh.rotation.x += dt * 7;
        p.mesh.rotation.y += dt * 5;
      }
      const scale = Math.max(0.01, p.life / p.maxLife);
      p.mesh.scale.setScalar(scale);
    }
  }

  render(dt, snapshot = null) {
    if (!this.renderer) return;
    const clampedDt = Math.min(dt, 0.05);
    this.elapsed += clampedDt;

    this.stadiumBuilder?.update(clampedDt, this.elapsed);
    this._updateParticles(clampedDt);

    if (this.mode === 'showcase' || !snapshot) {
      // Smooth cinematic stadium flyover for menus!
      const angle = this.elapsed * 0.14;
      this.camera.position.set(Math.sin(angle) * 44, 21 + Math.sin(angle * 2) * 3, Math.cos(angle) * 44);
      this.camera.lookAt(0, 2.5, 0);
      if (this.ballMesh) {
        this.ballMesh.rotation.y += clampedDt * 0.7;
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Update Ball with smooth interpolation, strict turf floor clamp, and realistic rolling spin
    const b = snapshot.ball;
    const lerpB = Math.min(1, clampedDt * 24);
    this.ballGroup.position.x += (b.x - this.ballGroup.position.x) * lerpB;
    const targetY = Math.max(PITCH.ballRadius, b.y);
    this.ballGroup.position.y = Math.max(
      PITCH.ballRadius,
      this.ballGroup.position.y + (targetY - this.ballGroup.position.y) * lerpB
    );
    this.ballGroup.position.z += (b.z - this.ballGroup.position.z) * lerpB;

    if (this.ballMesh) {
      this.ballMesh.rotation.z -= (b.vx * clampedDt) / PITCH.ballRadius;
      this.ballMesh.rotation.x += (b.vz * clampedDt) / PITCH.ballRadius;
    }

    // Ball ground shadow scales slightly with ball altitude
    const altScale = Math.max(0.45, 1 - (this.ballGroup.position.y - PITCH.ballRadius) * 0.08);
    this.ballShadow.position.set(this.ballGroup.position.x, 0.04, this.ballGroup.position.z);
    this.ballShadow.scale.setScalar(altScale);

    // Super shot glowing aura & blazing trail particles!
    this.superHalo.visible = Boolean(b.isSuper);
    if (b.isSuper && Math.random() < 0.75) {
      this._spawnBurst(this.ballGroup.position.x, this.ballGroup.position.y, this.ballGroup.position.z, '#F59E0B', 2, 2.2);
    }

    // Map human slot metadata for rings & nameplates
    const humanByPlayerId = new Map();
    let localPlayerState = null;
    for (const h of snapshot.humans) {
      humanByPlayerId.set(h.playerId, h);
    }

    for (const ps of snapshot.players) {
      const pm = this.playerMeshes.get(ps.id);
      if (!pm) continue;
      const humanInfo = humanByPlayerId.get(ps.id) || null;
      if (humanInfo && humanInfo.slotId === this.localSlotId) {
        localPlayerState = ps;
      }
      pm.updateFromState(ps, humanInfo, b.ownerId === ps.id, clampedDt, this.elapsed);
      if (ps.defAction === 'slide' && Math.random() < 0.65) {
        this._spawnBurst(ps.x, 0.18, ps.z, '#4ADE80', 2, 2.4);
      }
    }

    // Broadcast Dynamic Camera (or Goal Celebration Orbit Camera!)
    if (snapshot.phase === 'goal' && snapshot.lastGoal) {
      const scorer = snapshot.players.find((p) => p.id === snapshot.lastGoal.scorerId);
      const sx = scorer ? scorer.x : this.ballGroup.position.x;
      const sz = scorer ? scorer.z : this.ballGroup.position.z;
      const orbitAngle = this.elapsed * 1.25;
      const desiredPos = new THREE.Vector3(sx + Math.cos(orbitAngle) * 13, 6.8, sz + Math.sin(orbitAngle) * 13);
      const desiredTarget = new THREE.Vector3(sx, 2.5, sz);
      this.cameraPos.lerp(desiredPos, Math.min(1, clampedDt * 4.5));
      this.cameraTarget.lerp(desiredTarget, Math.min(1, clampedDt * 6));
    } else {
      // Full-pitch broadcast camera: tracks all the way to the near bottom touchline so players NEVER clip off-screen!
      const focusX = localPlayerState ? b.x * 0.65 + localPlayerState.x * 0.35 : b.x;
      const focusZ = localPlayerState ? b.z * 0.65 + localPlayerState.z * 0.35 : b.z;
      const targetX = Math.max(-(PITCH.halfLength - 11), Math.min(PITCH.halfLength - 11, focusX * 0.94));
      // Track near (+Z) touchline generously (even slightly past +halfWidth) so the bottom edge + touch controls never hide the player!
      const targetZ = Math.max(-(PITCH.halfWidth - 10), Math.min(PITCH.halfWidth + 2, focusZ * 0.95 + 2.0));

      const portraitBoost = this.camera.aspect < 1 ? Math.min(16, (1 / Math.max(0.45, this.camera.aspect) - 1) * 16) : 0;
      const boxZoom = Math.min(2.6, Math.max(0, (Math.abs(b.x) - 40) * 0.14));
      const camHeight = 22.0 + portraitBoost * 0.8 - boxZoom * 0.45;
      const camBackZ = 29.5 + portraitBoost * 1.0 - boxZoom * 0.8;

      const desiredPos = new THREE.Vector3(targetX, camHeight, targetZ + camBackZ);
      const desiredTarget = new THREE.Vector3(targetX, 1.4, targetZ);

      this.cameraPos.lerp(desiredPos, Math.min(1, clampedDt * 5.8));
      this.cameraTarget.lerp(desiredTarget, Math.min(1, clampedDt * 7.2));
    }

    // Apply decaying camera shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeAmount > 0.01) {
      shakeX = (Math.random() - 0.5) * this.shakeAmount;
      shakeY = (Math.random() - 0.5) * this.shakeAmount;
      this.shakeAmount *= Math.pow(0.05, clampedDt);
    }

    this.camera.position.set(this.cameraPos.x + shakeX, this.cameraPos.y + shakeY, this.cameraPos.z);
    this.camera.lookAt(this.cameraTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
