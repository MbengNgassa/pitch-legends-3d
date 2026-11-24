import * as THREE from 'three';
import { createJerseyTexture, createNameplateSprite } from './TextureFactory.js';
import { modelLoader } from './ModelLoader.js';

/**
 * Stylized, articulated 3D soccer player with real kit textures, shirt numbers,
 * varied real-player hair styles, cleats, animations, turf indicator rings,
 * shot-charge bar, and automatic Blender `.glb` drop-in override support.
 */
export class PlayerMesh {
  constructor(playerMeta, club, isGK) {
    this.id = playerMeta.id;
    this.data = playerMeta;
    this.club = club;
    this.isGK = isGK;

    this.group = new THREE.Group();
    this.bodyRoot = new THREE.Group();
    this.group.add(this.bodyRoot);

    this.baseScale = 1.46;
    this.scaleY = playerMeta.height || 1.0;
    this.bodyRoot.scale.set(this.baseScale, this.baseScale * this.scaleY, this.baseScale);

    this.hasCustomModel = false;
    this.customModelRoot = null;

    this._buildStylizedRig();
    this._buildGroundIndicators();
    this._buildNameplate();

    // Check asynchronously if a Blender GLB exists in public/models/manifest.json
    modelLoader.loadPlayerModel(playerMeta.id, 2.08 * this.baseScale * this.scaleY).then((glb) => {
      if (!glb) return;
      this.hasCustomModel = true;
      this.proceduralRig.visible = false;
      this.customModelRoot = glb;
      this.bodyRoot.add(glb);
    });
  }

  _buildStylizedRig() {
    this.proceduralRig = new THREE.Group();
    this.bodyRoot.add(this.proceduralRig);

    const skinMat = new THREE.MeshStandardMaterial({
      color: this.data.skin || '#EBC09E',
      roughness: 0.65,
      metalness: 0.04,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: this.data.hair || '#1E1612',
      roughness: 0.78,
      metalness: 0.05,
    });
    const jerseyTex = createJerseyTexture(this.club, this.data, this.isGK);
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: jerseyTex,
      roughness: 0.52,
      metalness: 0.05,
    });
    const sleeveColor = this.isGK
      ? '#FACC15'
      : this.club.pattern === 'sleeves'
        ? this.club.secondary
        : this.club.primary;
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: sleeveColor,
      roughness: 0.55,
    });
    const shortsMat = new THREE.MeshStandardMaterial({
      color: this.isGK ? '#111827' : this.club.shorts || '#FFFFFF',
      roughness: 0.6,
    });
    const sockMat = new THREE.MeshStandardMaterial({
      color: this.isGK ? '#FACC15' : this.club.socks || this.club.primary,
      roughness: 0.6,
    });
    const bootMat = new THREE.MeshStandardMaterial({
      color: this.isGK ? '#22C55E' : '#111827',
      roughness: 0.35,
      metalness: 0.2,
    });
    const bootAccentMat = new THREE.MeshStandardMaterial({
      color: this.club.accent || '#F59E0B',
      roughness: 0.3,
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.4,
    });

    // Pelvis / Shorts hip base
    this.hips = new THREE.Group();
    this.hips.position.y = 0.94;
    this.proceduralRig.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.26, 14), shortsMat);
    pelvis.castShadow = true;
    pelvis.receiveShadow = true;
    this.hips.add(pelvis);

    // Torso (Jersey — rotated so front chest faces +X in local space)
    this.torso = new THREE.Group();
    this.torso.position.y = 0.14;
    this.hips.add(this.torso);

    const chestGeo = new THREE.CylinderGeometry(0.32, 0.26, 0.64, 18);
    // Align cylinder UV front (u=0.25) to +X (player facing direction)
    chestGeo.rotateY(Math.PI);
    const chest = new THREE.Mesh(chestGeo, jerseyMat);
    chest.position.y = 0.32;
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    // Rounded shoulders cap
    const shoulderBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.44, 6, 12), sleeveMat);
    shoulderBar.rotation.x = Math.PI / 2;
    shoulderBar.position.y = 0.56;
    shoulderBar.castShadow = true;
    this.torso.add(shoulderBar);

    // Neck + Head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 10), skinMat);
    neck.position.y = 0.7;
    this.torso.add(neck);

    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.92;
    this.torso.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), skinMat);
    head.scale.set(1.02, 1.08, 0.95);
    head.castShadow = true;
    this.headGroup.add(head);

    // Expressive eyes facing +X
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.2 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    leftEye.position.set(0.21, 0.03, -0.08);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeMat);
    rightEye.position.set(0.21, 0.03, 0.08);
    this.headGroup.add(leftEye, rightEye);

    // Hair style tailored to each real player
    this._addHair(hairMat, this.data.hairStyle || 'short');

    // Left & Right Arms
    const buildArm = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.56, side * 0.36);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.22, 5, 10), sleeveMat);
      upper.position.y = -0.14;
      upper.castShadow = true;
      pivot.add(upper);

      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.072, 0.22, 5, 10), skinMat);
      lower.position.y = -0.38;
      lower.castShadow = true;
      pivot.add(lower);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(this.isGK ? 0.095 : 0.072, 8, 8),
        this.isGK ? gloveMat : skinMat
      );
      hand.position.y = -0.54;
      pivot.add(hand);

      this.torso.add(pivot);
      return pivot;
    };
    this.leftArm = buildArm(-1);
    this.rightArm = buildArm(1);

    // Left & Right Legs
    const buildLeg = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, -0.05, side * 0.145);

      const thighShort = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.098, 0.28, 10), shortsMat);
      thighShort.position.y = -0.14;
      thighShort.castShadow = true;
      pivot.add(thighShort);

      const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.18, 10), skinMat);
      knee.position.y = -0.35;
      pivot.add(knee);

      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.068, 0.34, 10), sockMat);
      sock.position.y = -0.58;
      sock.castShadow = true;
      pivot.add(sock);

      // Stylized football boot
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.13), bootMat);
      boot.position.set(0.05, -0.8, 0);
      boot.castShadow = true;
      pivot.add(boot);

      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.138), bootAccentMat);
      stripe.position.set(0.04, -0.79, 0);
      pivot.add(stripe);

      this.hips.add(pivot);
      return pivot;
    };
    this.leftLeg = buildLeg(-1);
    this.rightLeg = buildLeg(1);
  }

  _addHair(hairMat, style) {
    if (style === 'buzz') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.245, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.54),
        hairMat
      );
      cap.position.y = 0.025;
      this.headGroup.add(cap);
      return;
    }

    if (style === 'curly' || style === 'short-curl') {
      const count = style === 'curly' ? 14 : 9;
      const puffR = style === 'curly' ? 0.105 : 0.078;
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        const phi = 0.35 + (i % 3) * 0.28;
        const r = 0.21;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(puffR, 8, 8), hairMat);
        puff.position.set(
          Math.cos(theta) * Math.sin(phi) * r - 0.02,
          Math.cos(phi) * r + 0.08,
          Math.sin(theta) * Math.sin(phi) * r
        );
        puff.castShadow = true;
        this.headGroup.add(puff);
      }
      return;
    }

    if (style === 'ponytail') {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
        hairMat
      );
      cap.position.y = 0.03;
      this.headGroup.add(cap);

      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.24, 5, 10), hairMat);
      tail.position.set(-0.27, 0.02, 0);
      tail.rotation.z = 0.55;
      tail.castShadow = true;
      this.headGroup.add(tail);
      return;
    }

    if (style === 'swept') {
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 12), hairMat);
      top.scale.set(1.06, 0.72, 1.0);
      top.position.set(-0.02, 0.14, 0);
      top.castShadow = true;
      this.headGroup.add(top);
      return;
    }

    if (style === 'fade') {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.13, 0.32), hairMat);
      top.position.set(-0.01, 0.22, 0);
      top.castShadow = true;
      this.headGroup.add(top);
      return;
    }

    // Default 'short'
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.255, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
      hairMat
    );
    cap.position.set(-0.015, 0.035, 0);
    cap.castShadow = true;
    this.headGroup.add(cap);
  }

  _buildGroundIndicators() {
    // Contact shadow disc
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.contactShadow = new THREE.Mesh(new THREE.CircleGeometry(1.05, 20), shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.03;
    this.group.add(this.contactShadow);

    // Human controlled glowing turf ring + directional aim arrow
    this.ringGroup = new THREE.Group();
    this.ringGroup.position.y = 0.05;
    this.ringGroup.visible = false;
    this.group.add(this.ringGroup);

    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.54, 28), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.ringGroup.add(ring);

    // Forward aim arrow triangle pointing +X
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(2.22, 0);
    arrowShape.lineTo(1.62, 0.44);
    arrowShape.lineTo(1.62, -0.44);
    arrowShape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    arrowGeo.rotateX(-Math.PI / 2);
    this.aimArrow = new THREE.Mesh(arrowGeo, this.ringMat);
    this.ringGroup.add(this.aimArrow);

    // Shot charge bar right on the grass
    const chargeBg = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.3),
      new THREE.MeshBasicMaterial({ color: '#0B1218', transparent: true, opacity: 0.78, depthWrite: false })
    );
    chargeBg.rotation.x = -Math.PI / 2;
    chargeBg.position.set(0, 0.02, -2.05);
    this.chargeGroup = new THREE.Group();
    this.chargeGroup.visible = false;
    this.chargeGroup.add(chargeBg);

    this.chargeFillMat = new THREE.MeshBasicMaterial({ color: '#FACC15', depthWrite: false });
    this.chargeFill = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.2), this.chargeFillMat);
    this.chargeFill.rotation.x = -Math.PI / 2;
    this.chargeFill.position.set(0, 0.03, -2.05);
    this.chargeGroup.add(this.chargeFill);
    this.group.add(this.chargeGroup);

    // Super Shot Ready Golden Halo Ring
    this.superRingMat = new THREE.MeshBasicMaterial({
      color: '#F59E0B',
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.superRing = new THREE.Mesh(new THREE.RingGeometry(1.64, 1.88, 28), this.superRingMat);
    this.superRing.rotation.x = -Math.PI / 2;
    this.superRing.position.y = 0.06;
    this.superRing.visible = false;
    this.group.add(this.superRing);

    // Smooth Skill Roulette Footwork Ring
    this.skillRingMat = new THREE.MeshBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.skillRing = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.52, 28), this.skillRingMat);
    this.skillRing.rotation.x = -Math.PI / 2;
    this.skillRing.position.y = 0.08;
    this.skillRing.visible = false;
    this.group.add(this.skillRing);
  }

  _buildNameplate() {
    this.currentLabel = '';
    this.currentAccent = '';
    this.nameSprite = createNameplateSprite(this.data.name, this.club.accent || '#FFFFFF');
    this.nameSprite.position.set(0, 3.85 * this.scaleY, 0);
    this.nameSprite.visible = false;
    this.group.add(this.nameSprite);
  }

  updateFromState(state, humanInfo, isBallOwner, dt, elapsed) {
    // Smooth interpolation for buttery multiplayer motion
    const lerpFactor = Math.min(1, dt * 20);
    this.group.position.x += (state.x - this.group.position.x) * lerpFactor;
    this.group.position.z += (state.z - this.group.position.z) * lerpFactor;
    this.bodyRoot.position.y += ((state.y || 0) - this.bodyRoot.position.y) * Math.min(1, dt * 18);

    // Rotate player body cleanly toward movement/aim direction (never corrupted by skill spin!)
    const targetRotY = -state.facing;
    let diff = targetRotY - this.bodyRoot.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.bodyRoot.rotation.y += diff * Math.min(1, dt * 18);

    // Distinct silky choreography for 5 Attack Skill Moves + 3 Defensive Tackles!
    const skillActive = state.skillTimer > 0;
    const skillType = state.skillType || 'roulette';
    const skillDur = state.skillDuration || 0.55;
    const skillProg = skillActive ? Math.max(0, Math.min(1, 1 - state.skillTimer / skillDur)) : 0;
    const skillDir = state.skillDir || 1;

    const defActive = state.defTimer > 0 && Boolean(state.defAction);
    const defAction = state.defAction || '';
    const defDur = state.defDuration || 0.45;
    const defProg = defActive ? Math.max(0, Math.min(1, 1 - state.defTimer / defDur)) : 0;

    if (defActive) {
      this.skillRing.visible = true;
      const defColors = { slide: '#EF4444', barge: '#F59E0B', poke: '#22C55E' };
      this.skillRingMat.color.set(defColors[defAction] || '#EF4444');
      const ringScale = 0.92 + defProg * 0.95;
      this.skillRing.scale.set(ringScale, ringScale, 1);
      this.skillRingMat.opacity = (1 - defProg) * 0.9;
    } else if (skillActive) {
      this.skillRing.visible = true;
      const ringColors = {
        roulette: '#38BDF8',
        rainbow: '#FACC15',
        elastico: '#22C55E',
        stepover: '#F97316',
        heelchop: '#FB7185',
      };
      this.skillRingMat.color.set(ringColors[skillType] || '#38BDF8');
      const ringScale = 0.88 + skillProg * 0.82;
      this.skillRing.scale.set(ringScale, ringScale, 1);
      this.skillRingMat.opacity = (1 - skillProg) * 0.88;
    } else {
      this.skillRing.visible = false;
    }

    // Ring orientation matches facing
    this.ringGroup.rotation.y = this.bodyRoot.rotation.y;

    // Human ring visibility & color
    if (humanInfo) {
      this.ringGroup.visible = true;
      this.ringMat.color.set(humanInfo.color);
    } else {
      this.ringGroup.visible = false;
    }

    // Shot Charge bar
    if (state.shotCharge > 0.03) {
      this.chargeGroup.visible = true;
      const pct = Math.min(1, state.shotCharge);
      this.chargeFill.scale.x = Math.max(0.05, pct);
      this.chargeFill.position.x = -1.0 * (1 - pct);
      this.chargeFillMat.color.set(pct > 0.78 ? '#EF4444' : pct > 0.45 ? '#F59E0B' : '#22C55E');
    } else {
      this.chargeGroup.visible = false;
    }

    // Super Shot Ready pulsing aura!
    if (humanInfo && state.superMeter >= 98) {
      this.superRing.visible = true;
      const pulse = 1 + Math.sin(elapsed * 9) * 0.08;
      this.superRing.scale.set(pulse, pulse, 1);
    } else {
      this.superRing.visible = false;
    }

    // Nameplate for human-controlled players or the active ball carrier
    if (humanInfo || isBallOwner) {
      const showHumanPrefix = humanInfo && humanInfo.name && humanInfo.name !== 'Player 1' && humanInfo.name !== 'You';
      const label = showHumanPrefix ? `${humanInfo.name} · ${this.data.name}` : this.data.name;
      const accent = humanInfo ? humanInfo.color : '#FFFFFF';
      if (label !== this.currentLabel || accent !== this.currentAccent) {
        this.group.remove(this.nameSprite);
        this.nameSprite.material.map?.dispose();
        this.nameSprite.material.dispose();
        this.nameSprite = createNameplateSprite(label, accent);
        this.nameSprite.position.set(0, 3.85 * this.scaleY, 0);
        this.group.add(this.nameSprite);
        this.currentLabel = label;
        this.currentAccent = accent;
      }
      this.nameSprite.visible = true;
    } else {
      this.nameSprite.visible = false;
    }

    // Procedural limb, skill & defensive tackle animations
    if (!this.hasCustomModel) {
      const speed = Math.hypot(state.vx, state.vz);
      const strideAmp = Math.min(0.85, speed * 0.075);
      const cycle = state.runCycle || 0;

      // Reset lateral/roll/pitch offsets cleanly each frame
      this.proceduralRig.position.z *= 0.72;
      this.leftLeg.rotation.x *= 0.7;
      this.rightLeg.rotation.x *= 0.7;

      if (state.diveTimer > 0) {
        // Dramatic goalkeeper outstretched dive!
        this.proceduralRig.rotation.y = 0;
        this.proceduralRig.rotation.z = 0;
        this.proceduralRig.rotation.x = (state.diveDir || 1) * 1.15;
        this.proceduralRig.position.y = 0.55;
        this.leftArm.rotation.z = 2.4;
        this.rightArm.rotation.z = 2.4;
        this.leftLeg.rotation.z = -0.25;
        this.rightLeg.rotation.z = 0.25;
      } else if (defActive) {
        if (defAction === 'slide') {
          // Authentic low-to-the-turf football Slide Tackle (feet first!)
          const slideCurve = defProg < 0.72 ? Math.min(1, defProg / 0.14) : Math.max(0, (1 - defProg) / 0.28);
          this.proceduralRig.rotation.y = 0.18 * slideCurve;
          this.proceduralRig.rotation.x = -0.22 * slideCurve;
          this.proceduralRig.rotation.z = 1.18 * slideCurve;
          this.proceduralRig.position.y = -0.54 * slideCurve;
          this.torso.rotation.z = -0.15;
          this.rightLeg.rotation.z = 0.22 * slideCurve; // Straight sweeping boot forward!
          this.leftLeg.rotation.z = -0.82 * slideCurve; // Tucked trailing knee!
          this.leftArm.rotation.z = -1.05 * slideCurve;
          this.rightArm.rotation.z = 0.78 * slideCurve;
        } else if (defAction === 'barge') {
          // Physical Shoulder Barge: drop center of gravity & drive tucked shoulder forward!
          const peak = Math.sin(defProg * Math.PI);
          this.proceduralRig.rotation.z = 0;
          this.proceduralRig.rotation.y = 0.42 * peak;
          this.proceduralRig.rotation.x = 0.46 * peak;
          this.proceduralRig.position.y = -0.15 * peak;
          this.torso.rotation.z = -0.36 * peak;
          this.leftLeg.rotation.z = Math.sin(cycle) * strideAmp * 1.1;
          this.rightLeg.rotation.z = -Math.sin(cycle) * strideAmp * 1.1;
          this.leftArm.rotation.z = 0.28;
          this.rightArm.rotation.z = -0.28;
        } else {
          // Crisp Standing Poke Tackle lunge
          const peak = Math.sin(defProg * Math.PI);
          this.proceduralRig.rotation.z = 0;
          this.proceduralRig.rotation.y = 0;
          this.proceduralRig.rotation.x = 0;
          this.proceduralRig.position.y = -0.1 * peak;
          this.torso.rotation.z = -0.34 * peak;
          this.rightLeg.rotation.z = 1.15 * peak;
          this.leftLeg.rotation.z = -0.55 * peak;
          this.leftArm.rotation.z = -0.65 * peak;
          this.rightArm.rotation.z = 0.65 * peak;
        }
      } else if (skillActive) {
        this.proceduralRig.rotation.z *= 0.65;
        const sinP = Math.sin(skillProg * Math.PI);

        if (skillType === 'roulette') {
          const eased =
            skillProg < 0.5
              ? 4 * skillProg * skillProg * skillProg
              : 1 - Math.pow(-2 * skillProg + 2, 3) / 2;
          this.proceduralRig.rotation.y = eased * Math.PI * 2 * skillDir;
          this.proceduralRig.rotation.x = sinP * 0.14 * skillDir;
          this.proceduralRig.position.y = sinP * 0.18;
          this.torso.rotation.z = -0.22;
          this.leftLeg.rotation.z = Math.sin(skillProg * Math.PI * 2) * 0.65;
          this.rightLeg.rotation.z = -Math.sin(skillProg * Math.PI * 2) * 0.65;
          this.leftArm.rotation.z = 0.45;
          this.rightArm.rotation.z = -0.45;
        } else if (skillType === 'rainbow') {
          const flickPhase = skillProg < 0.4 ? Math.sin((skillProg / 0.4) * Math.PI) : 0;
          this.proceduralRig.rotation.y = 0;
          this.proceduralRig.rotation.x = 0;
          this.proceduralRig.position.y = flickPhase * 0.34 + Math.abs(Math.sin(cycle)) * 0.1;
          this.torso.rotation.z = -0.18 - flickPhase * 0.28;
          this.rightLeg.rotation.z = flickPhase > 0.05 ? -flickPhase * 1.25 : -Math.sin(cycle) * strideAmp;
          this.leftLeg.rotation.z = flickPhase > 0.05 ? flickPhase * 0.45 : Math.sin(cycle) * strideAmp;
          this.leftArm.rotation.z = flickPhase > 0.05 ? 0.72 : -Math.sin(cycle) * strideAmp * 0.78;
          this.rightArm.rotation.z = flickPhase > 0.05 ? 0.55 : Math.sin(cycle) * strideAmp * 0.78;
        } else if (skillType === 'elastico') {
          const whip =
            skillProg < 0.4
              ? -Math.sin((skillProg / 0.4) * Math.PI) * 0.3
              : Math.sin(((skillProg - 0.4) / 0.6) * Math.PI) * 0.38;
          this.proceduralRig.rotation.y = whip * 0.9 * skillDir;
          this.proceduralRig.rotation.x = whip * 0.85 * skillDir;
          this.proceduralRig.position.z = whip * 0.55 * skillDir;
          this.proceduralRig.position.y = sinP * 0.14;
          this.torso.rotation.z = -0.26;
          this.rightLeg.rotation.x = whip * 1.45 * skillDir;
          this.rightLeg.rotation.z = 0.42 * sinP;
          this.leftLeg.rotation.z = -0.35 * sinP;
          this.leftArm.rotation.z = -0.55 * skillDir;
          this.rightArm.rotation.z = 0.55 * skillDir;
        } else if (skillType === 'stepover') {
          const feintPhase = skillProg < 0.58;
          const wave = Math.sin(skillProg * Math.PI * 4);
          this.proceduralRig.rotation.y = feintPhase ? wave * 0.22 : 0.16 * skillDir;
          this.proceduralRig.rotation.x = feintPhase ? wave * 0.22 : 0.26 * skillDir;
          this.proceduralRig.position.y = Math.abs(wave) * 0.12;
          this.torso.rotation.z = -0.28;
          if (feintPhase) {
            this.leftLeg.rotation.x = Math.max(0, wave) * -0.78;
            this.rightLeg.rotation.x = Math.max(0, -wave) * 0.78;
            this.leftLeg.rotation.z = Math.max(0, wave) * 0.75;
            this.rightLeg.rotation.z = Math.max(0, -wave) * 0.75;
          } else {
            this.leftLeg.rotation.z = Math.sin(cycle) * strideAmp;
            this.rightLeg.rotation.z = -Math.sin(cycle) * strideAmp;
          }
          this.leftArm.rotation.z = -wave * 0.55;
          this.rightArm.rotation.z = wave * 0.55;
        } else {
          const chopPeak = Math.sin(Math.min(1, skillProg / 0.65) * Math.PI);
          this.proceduralRig.rotation.y = chopPeak * 0.68 * skillDir;
          this.proceduralRig.rotation.x = chopPeak * 0.26 * skillDir;
          this.proceduralRig.position.y = chopPeak * 0.38;
          this.torso.rotation.z = -0.2;
          this.rightLeg.rotation.z = -chopPeak * 1.05;
          this.rightLeg.rotation.x = chopPeak * 0.65 * skillDir;
          this.leftLeg.rotation.z = chopPeak * 0.42;
          this.leftArm.rotation.z = 0.65;
          this.rightArm.rotation.z = -0.65;
        }
      } else {
        this.proceduralRig.rotation.y *= 0.72;
        this.proceduralRig.rotation.x *= 0.8;
        this.proceduralRig.rotation.z *= 0.65;
        const pressDrop = state.pressing ? -0.09 : 0;
        this.proceduralRig.position.y = pressDrop + Math.abs(Math.sin(cycle)) * strideAmp * 0.14;

        // Forward athletic lean into sprint or low aggressive jockey lean on PRESS
        this.torso.rotation.z = state.pressing ? -0.32 : -Math.min(0.24, speed * 0.018);

        // Running leg & arm swing
        this.leftLeg.rotation.z = Math.sin(cycle) * strideAmp;
        this.rightLeg.rotation.z = -Math.sin(cycle) * strideAmp;
        this.leftArm.rotation.z = -Math.sin(cycle) * strideAmp * 0.78;
        this.rightArm.rotation.z = Math.sin(cycle) * strideAmp * 0.78;
      }
    }
  }

  snapTo(state) {
    this.group.position.set(state.x, 0, state.z);
    this.bodyRoot.position.y = state.y || 0;
    this.bodyRoot.rotation.y = -state.facing;
  }
}
