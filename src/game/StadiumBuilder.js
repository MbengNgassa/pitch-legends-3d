import * as THREE from 'three';
import { PITCH } from '../../shared/MatchEngine.js';
import { createPitchTexture, createLedBoardTexture } from './TextureFactory.js';
import { modelLoader } from './ModelLoader.js';

/**
 * Builds rich, atmospheric 3D stadiums for all 6 unlockable arenas:
 * - Procedural high-res pitch + lush outer apron
 * - Authentic 3D goals with animated rippling nets
 * - Perimeter scrolling LED advertising boards
 * - Multi-tier stands tailored to each stadium's roof architecture
 * - 2,400+ instanced animated spectators who bounce & cheer on goals
 * - Floodlight towers with volumetric cones & sky dome (clouds / night stars)
 * - Automatic Blender `.glb` stadium drop-in support via ModelLoader
 */
export class StadiumBuilder {
  constructor(stadium, homeClub, awayClub) {
    this.stadium = stadium;
    this.homeClub = homeClub;
    this.awayClub = awayClub;

    this.group = new THREE.Group();
    this.crowdMesh = null;
    this.crowdData = [];
    this.crowdDummy = new THREE.Object3D();
    this.ledTextures = [];
    this.ledMaterials = [];
    this.ledGoalTex = null;
    this.ledNormalTex = null;
    this.goalNets = [];
    this.cornerFlags = [];
    this.clouds = [];
    this.goalExcitement = 0;

    this._buildSkyDome();
    this._buildPitch();
    this._buildGoals();
    this._buildCornerFlags();
    this._buildLedBoards();
    this._buildStandsAndRoof();
    this._buildInstancedCrowd();
    this._buildFloodlights();

    // Check if user dropped a Blender stadium GLB into public/models/manifest.json
    modelLoader.loadStadiumModel(stadium.id).then((glb) => {
      if (!glb) return;
      this.group.add(glb);
    });
  }

  _buildSkyDome() {
    const skyGeo = new THREE.SphereGeometry(240, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(this.stadium.skyTop) },
        bottomColor: { value: new THREE.Color(this.stadium.skyHorizon) },
        offset: { value: 18 },
        exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(sky);

    // Daytime fluffy stylized clouds OR night stars
    if (!this.stadium.floodlightsOn || this.stadium.id === 'bernabeu') {
      const cloudMat = new THREE.MeshStandardMaterial({
        color: this.stadium.id === 'bernabeu' ? '#FED7AA' : '#FFFFFF',
        roughness: 0.95,
        transparent: true,
        opacity: 0.88,
      });
      for (let i = 0; i < 14; i++) {
        const cloud = new THREE.Group();
        const puffs = 3 + (i % 3);
        for (let p = 0; p < puffs; p++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(4 + (p % 2) * 2.5, 10, 10), cloudMat);
          m.position.set(p * 4.5 - puffs * 2, (p % 2) * 1.4, (p % 2) * 1.6);
          m.scale.set(1.4, 0.72, 1.0);
          cloud.add(m);
        }
        const angle = (i / 14) * Math.PI * 2;
        cloud.position.set(Math.cos(angle) * 125, 48 + (i % 4) * 9, Math.sin(angle) * 115);
        this.group.add(cloud);
        this.clouds.push({ mesh: cloud, speed: 0.5 + (i % 3) * 0.25 });
      }
    } else {
      // Twinkling stadium night stars
      const starGeo = new THREE.BufferGeometry();
      const positions = [];
      for (let i = 0; i < 360; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.42;
        const r = 195;
        positions.push(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi) + 12,
          r * Math.sin(phi) * Math.sin(theta)
        );
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const starMat = new THREE.PointsMaterial({ color: '#F8FAFC', size: 1.4, transparent: true, opacity: 0.85 });
      this.group.add(new THREE.Points(starGeo, starMat));
    }
  }

  _buildPitch() {
    // Deep outer stadium ground apron
    const apronMat = new THREE.MeshStandardMaterial({
      color: '#195E29',
      roughness: 0.92,
      metalness: 0.0,
    });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(240, 180), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.05;
    apron.receiveShadow = true;
    this.group.add(apron);

    // Main textured FIFA-marked pitch
    const pitchTex = createPitchTexture(this.stadium);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: pitchTex,
      roughness: 0.86,
      metalness: 0.02,
    });
    // Slightly larger than exact lines so the inner chalk borders match PITCH.length x PITCH.width
    const pitchGeo = new THREE.PlaneGeometry(PITCH.length + 8.6, PITCH.width + 7.2);
    const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
    pitchMesh.rotation.x = -Math.PI / 2;
    pitchMesh.position.y = 0;
    pitchMesh.receiveShadow = true;
    this.group.add(pitchMesh);
  }

  _buildGoals() {
    const postMat = new THREE.MeshStandardMaterial({
      color: '#F8FAFC',
      roughness: 0.28,
      metalness: 0.35,
    });
    const netMat = new THREE.MeshStandardMaterial({
      color: '#F1F5F9',
      wireframe: true,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    });

    const buildOneGoal = (side) => {
      const g = new THREE.Group();
      const xBase = side * PITCH.halfLength;
      const hw = PITCH.goalHalfWidth;
      const h = PITCH.goalHeight;
      const d = PITCH.goalDepth * side;

      // Vertical posts
      const postGeo = new THREE.CylinderGeometry(0.14, 0.14, h, 12);
      const pLeft = new THREE.Mesh(postGeo, postMat);
      pLeft.position.set(xBase, h / 2, -hw);
      pLeft.castShadow = true;
      const pRight = new THREE.Mesh(postGeo, postMat);
      pRight.position.set(xBase, h / 2, hw);
      pRight.castShadow = true;

      // Crossbar
      const barGeo = new THREE.CylinderGeometry(0.14, 0.14, hw * 2 + 0.28, 12);
      barGeo.rotateX(Math.PI / 2);
      const bar = new THREE.Mesh(barGeo, postMat);
      bar.position.set(xBase, h, 0);
      bar.castShadow = true;

      // Back support stanchions
      const backGeo = new THREE.CylinderGeometry(0.09, 0.09, h, 10);
      const bLeft = new THREE.Mesh(backGeo, postMat);
      bLeft.position.set(xBase + d, h / 2, -hw);
      const bRight = new THREE.Mesh(backGeo, postMat);
      bRight.position.set(xBase + d, h / 2, hw);

      const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, hw * 2, 10), postMat);
      backBar.rotation.x = Math.PI / 2;
      backBar.position.set(xBase + d, h, 0);

      // Side top depth bars
      const depthBarGeo = new THREE.CylinderGeometry(0.09, 0.09, Math.abs(d), 10);
      depthBarGeo.rotateZ(Math.PI / 2);
      const topL = new THREE.Mesh(depthBarGeo, postMat);
      topL.position.set(xBase + d / 2, h, -hw);
      const topR = new THREE.Mesh(depthBarGeo, postMat);
      topR.position.set(xBase + d / 2, h, hw);

      // Rippling back net mesh
      const backNetGeo = new THREE.PlaneGeometry(hw * 2, h, 18, 9);
      const backNet = new THREE.Mesh(backNetGeo, netMat);
      backNet.position.set(xBase + d, h / 2, 0);
      backNet.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;

      // Top & side net panels
      const topNet = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(d), hw * 2, 8, 16), netMat);
      topNet.rotation.x = Math.PI / 2;
      topNet.position.set(xBase + d / 2, h, 0);

      const sideNetGeo = new THREE.PlaneGeometry(Math.abs(d), h, 8, 8);
      const leftNet = new THREE.Mesh(sideNetGeo, netMat);
      leftNet.position.set(xBase + d / 2, h / 2, -hw);
      const rightNet = new THREE.Mesh(sideNetGeo, netMat);
      rightNet.position.set(xBase + d / 2, h / 2, hw);

      g.add(pLeft, pRight, bar, bLeft, bRight, backBar, topL, topR, backNet, topNet, leftNet, rightNet);
      this.group.add(g);

      this.goalNets.push({
        side,
        mesh: backNet,
        basePositions: Float32Array.from(backNetGeo.attributes.position.array),
        ripple: 0,
      });
    };

    buildOneGoal(1);
    buildOneGoal(-1);
  }

  _buildCornerFlags() {
    const poleMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 });
    const flagMat = new THREE.MeshStandardMaterial({
      color: this.stadium.ledColor || '#F59E0B',
      side: THREE.DoubleSide,
      roughness: 0.5,
    });
    const corners = [
      [-PITCH.halfLength, -PITCH.halfWidth],
      [PITCH.halfLength, -PITCH.halfWidth],
      [PITCH.halfLength, PITCH.halfWidth],
      [-PITCH.halfLength, PITCH.halfWidth],
    ];
    corners.forEach(([x, z], idx) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), poleMat);
      pole.position.set(x, 1.1, z);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 4, 2), flagMat);
      flag.position.set(x + 0.45, 1.9, z);
      this.group.add(pole, flag);
      this.cornerFlags.push({ mesh: flag, phase: idx * 1.4 });
    });
  }

  _buildLedBoards() {
    this.ledNormalTex = createLedBoardTexture(this.homeClub, this.awayClub, this.stadium, false);
    this.ledGoalTex = createLedBoardTexture(this.homeClub, this.awayClub, this.stadium, true);

    const makeBoardMat = () => {
      const mat = new THREE.MeshStandardMaterial({
        map: this.ledNormalTex,
        emissive: new THREE.Color('#FFFFFF'),
        emissiveMap: this.ledNormalTex,
        emissiveIntensity: this.stadium.floodlightsOn ? 0.72 : 0.35,
        roughness: 0.3,
      });
      this.ledMaterials.push(mat);
      return mat;
    };

    const boardH = 1.35;
    // North & South sideline boards
    const sideGeo = new THREE.BoxGeometry(PITCH.length + 10, boardH, 0.35);
    const north = new THREE.Mesh(sideGeo, makeBoardMat());
    north.position.set(0, boardH / 2, -(PITCH.halfWidth + 4.2));
    const south = new THREE.Mesh(sideGeo, makeBoardMat());
    south.position.set(0, boardH / 2, PITCH.halfWidth + 4.2);

    // East & West behind-goal boards
    const endGeo = new THREE.BoxGeometry(0.35, boardH, PITCH.width + 8);
    const east = new THREE.Mesh(endGeo, makeBoardMat());
    east.position.set(PITCH.halfLength + 6.4, boardH / 2, 0);
    const west = new THREE.Mesh(endGeo, makeBoardMat());
    west.position.set(-(PITCH.halfLength + 6.4), boardH / 2, 0);

    this.group.add(north, south, east, west);
  }

  _buildStandsAndRoof() {
    const concreteMat = new THREE.MeshStandardMaterial({
      color: this.stadium.standPrimary,
      roughness: 0.78,
      metalness: 0.08,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: this.stadium.standAccent,
      roughness: 0.45,
      metalness: 0.2,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: this.stadium.roofStyle === 'wrapped-silver' ? '#E2E8F0' : '#334155',
      roughness: 0.35,
      metalness: 0.62,
    });

    const buildStandBank = (length, x, z, rotY, tiers = 6) => {
      const bank = new THREE.Group();
      bank.position.set(x, 0, z);
      bank.rotation.y = rotY;

      // Stepped seating tiers
      for (let t = 0; t < tiers; t++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(length, 1.5, 2.5), concreteMat);
        step.position.set(0, 0.75 + t * 1.45, t * 2.2);
        step.receiveShadow = true;
        step.castShadow = true;
        bank.add(step);
      }

      // Colored club fascia wall along front of stand
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(length, 1.8, 0.6), accentMat);
      fascia.position.set(0, 0.9, -1.35);
      bank.add(fascia);

      // Upper backing wall
      const backWallH = tiers * 1.5 + 3.5;
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(length, backWallH, 1.2), concreteMat);
      backWall.position.set(0, backWallH / 2, tiers * 2.2 + 1.2);
      bank.add(backWall);

      // Roof canopy tailored to the specific stadium!
      const roofY = tiers * 1.5 + 4.4;
      if (this.stadium.roofStyle === 'wrapped-silver' || this.stadium.roofStyle === 'circular-halo') {
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(length + 4, 0.85, tiers * 2.3 + 4), roofMat);
        canopy.position.set(0, roofY, tiers * 1.1);
        canopy.rotation.x = 0.08;
        bank.add(canopy);
        // Glowing trim strip
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(length + 4, 0.32, 0.4),
          new THREE.MeshBasicMaterial({ color: this.stadium.ledColor })
        );
        trim.position.set(0, roofY - 0.55, -0.7);
        bank.add(trim);
      } else if (this.stadium.roofStyle === 'cable-masts') {
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.55, tiers * 2.1), roofMat);
        canopy.position.set(0, roofY + 1.2, tiers * 1.15);
        bank.add(canopy);
        // Iconic Etihad inclined white masts
        [-length * 0.35, length * 0.35].forEach((mx) => {
          const mast = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.42, 24, 10),
            new THREE.MeshStandardMaterial({ color: '#E2E8F0', metalness: 0.7, roughness: 0.3 })
          );
          mast.position.set(mx, 13, tiers * 2.2 + 3.5);
          mast.rotation.x = -0.22;
          bank.add(mast);
        });
      } else {
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.6, tiers * 1.85), roofMat);
        canopy.position.set(0, roofY, tiers * 1.3);
        canopy.rotation.x = 0.1;
        bank.add(canopy);
      }

      this.group.add(bank);
    };

    const tierCount = this.stadium.id === 'sunlit-park' ? 4 : 7;
    const longStand = PITCH.length + 14;
    const endStand = PITCH.width + 12;
    // Far North stand (main broadcast backdrop — always fully visible!)
    buildStandBank(longStand, 0, -(PITCH.halfWidth + 8.5), Math.PI, tierCount);
    // East & West behind-goal stands
    buildStandBank(endStand, PITCH.halfLength + 10.5, 0, Math.PI / 2, tierCount);
    buildStandBank(endStand, -(PITCH.halfLength + 10.5), 0, -Math.PI / 2, tierCount);
    // Low South stand behind camera so reflections/orbit shots look complete!
    buildStandBank(longStand, 0, PITCH.halfWidth + 10.5, 0, 3);
  }

  _buildInstancedCrowd() {
    const tierCount = this.stadium.id === 'sunlit-park' ? 4 : 7;
    const placements = [];

    const addBankSpecs = (length, originX, originZ, rotY, tiers) => {
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      const cols = Math.floor(length / 1.85);
      for (let t = 0; t < tiers; t++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.14) continue; // natural sparse stair gaps
          const lx = -length / 2 + 1.4 + c * 1.85 + (Math.random() - 0.5) * 0.35;
          const ly = 1.9 + t * 1.45;
          const lz = t * 2.2 + (Math.random() - 0.5) * 0.4;
          const wx = originX + lx * cos + lz * sin;
          const wz = originZ - lx * sin + lz * cos;
          placements.push({
            x: wx,
            y: ly,
            z: wz,
            phase: Math.random() * Math.PI * 2,
            color: this.stadium.crowdPalette[Math.floor(Math.random() * this.stadium.crowdPalette.length)],
          });
        }
      }
    };

    addBankSpecs(PITCH.length + 10, 0, -(PITCH.halfWidth + 8.5), Math.PI, tierCount);
    addBankSpecs(PITCH.width + 8, PITCH.halfLength + 10.5, 0, Math.PI / 2, tierCount);
    addBankSpecs(PITCH.width + 8, -(PITCH.halfLength + 10.5), 0, -Math.PI / 2, tierCount);

    const specGeo = new THREE.CapsuleGeometry(0.32, 0.55, 4, 6);
    const specMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.05 });
    const instanced = new THREE.InstancedMesh(specGeo, specMat, placements.length);
    const color = new THREE.Color();

    placements.forEach((p, i) => {
      this.crowdDummy.position.set(p.x, p.y, p.z);
      this.crowdDummy.scale.set(1, 0.9 + Math.random() * 0.25, 1);
      this.crowdDummy.updateMatrix();
      instanced.setMatrixAt(i, this.crowdDummy.matrix);
      color.set(p.color);
      instanced.setColorAt(i, color);
    });

    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    this.crowdMesh = instanced;
    this.crowdData = placements;
    this.group.add(instanced);
  }

  _buildFloodlights() {
    const pylonMat = new THREE.MeshStandardMaterial({
      color: '#64748B',
      metalness: 0.7,
      roughness: 0.35,
    });
    const lampMat = new THREE.MeshBasicMaterial({
      color: this.stadium.floodlightsOn ? '#FFFBEB' : '#CBD5E1',
    });

    const corners = [
      [-PITCH.halfLength - 13, -PITCH.halfWidth - 13],
      [PITCH.halfLength + 13, -PITCH.halfWidth - 13],
      [PITCH.halfLength + 13, PITCH.halfWidth + 13],
      [-PITCH.halfLength - 13, PITCH.halfWidth + 13],
    ];

    corners.forEach(([x, z]) => {
      const pylon = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 36, 10), pylonMat);
      pole.position.set(x, 18, z);
      pylon.add(pole);

      const head = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.2, 1.2), lampMat);
      head.position.set(x, 36.2, z);
      head.lookAt(0, 0, 0);
      pylon.add(head);

      // Soft volumetric light beam cone for dramatic night/twilight stadiums!
      if (this.stadium.floodlightsOn) {
        const coneGeo = new THREE.ConeGeometry(16, 48, 16, 1, true);
        coneGeo.translate(0, -24, 0);
        const coneMat = new THREE.MeshBasicMaterial({
          color: this.stadium.sunColor || '#E0F2FE',
          transparent: true,
          opacity: 0.048,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(x, 35.5, z);
        cone.lookAt(0, 0, 0);
        cone.rotateX(-Math.PI / 2);
        pylon.add(cone);
      }

      this.group.add(pylon);
    });
  }

  triggerGoalCelebration(scoringTeam) {
    this.goalExcitement = 3.2;
    const hitSide = scoringTeam === 'home' ? 1 : -1;
    for (const net of this.goalNets) {
      if (net.side === hitSide) {
        net.ripple = 1.0;
      }
    }
    for (const mat of this.ledMaterials) {
      mat.map = this.ledGoalTex;
      mat.emissiveMap = this.ledGoalTex;
      mat.emissiveIntensity = 1.05;
      mat.needsUpdate = true;
    }
  }

  update(dt, elapsed) {
    // Scroll LED ad boards smoothly
    if (this.ledNormalTex) this.ledNormalTex.offset.x = (elapsed * 0.06) % 1;
    if (this.ledGoalTex) this.ledGoalTex.offset.x = (elapsed * 0.35) % 1;

    if (this.goalExcitement > 0) {
      this.goalExcitement = Math.max(0, this.goalExcitement - dt);
      if (this.goalExcitement === 0) {
        for (const mat of this.ledMaterials) {
          mat.map = this.ledNormalTex;
          mat.emissiveMap = this.ledNormalTex;
          mat.emissiveIntensity = this.stadium.floodlightsOn ? 0.72 : 0.35;
          mat.needsUpdate = true;
        }
      }
    }

    // Drift daytime clouds gently
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 140) c.mesh.position.x = -140;
    }

    // Flutter corner flags
    for (const f of this.cornerFlags) {
      f.mesh.rotation.y = Math.sin(elapsed * 5 + f.phase) * 0.25;
    }

    // Animate rippling goal nets
    for (const net of this.goalNets) {
      if (net.ripple > 0.005) {
        net.ripple *= Math.pow(0.28, dt);
        const pos = net.mesh.geometry.attributes.position;
        const base = net.basePositions;
        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3];
          const by = base[i * 3 + 1];
          const wave = Math.sin(bx * 1.4 + elapsed * 24) * Math.cos(by * 1.6 + elapsed * 18) * net.ripple * 0.55;
          pos.setZ(i, base[i * 3 + 2] + wave);
        }
        pos.needsUpdate = true;
      }
    }

    // Animate instanced crowd (gentle wave normally, ecstatic bouncing when a goal is scored!)
    if (this.crowdMesh) {
      const jumpAmp = this.goalExcitement > 0 ? 0.62 : 0.08;
      const jumpSpeed = this.goalExcitement > 0 ? 12.0 : 2.8;
      // Update crowd at smooth cadence
      for (let i = 0; i < this.crowdData.length; i++) {
        const d = this.crowdData[i];
        const hop = Math.abs(Math.sin(elapsed * jumpSpeed + d.phase)) * jumpAmp;
        this.crowdDummy.position.set(d.x, d.y + hop, d.z);
        this.crowdDummy.scale.set(1, 1, 1);
        this.crowdDummy.updateMatrix();
        this.crowdMesh.setMatrixAt(i, this.crowdDummy.matrix);
      }
      this.crowdMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
