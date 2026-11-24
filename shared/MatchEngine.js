import { buildEffectiveRoster, getClubById } from './teamsData.js';

export const PITCH = {
  length: 76,
  width: 48,
  halfLength: 38,
  halfWidth: 24,
  goalWidth: 11.8,
  goalHalfWidth: 5.9,
  goalHeight: 4.8,
  goalDepth: 3.8,
  ballRadius: 0.36,
  playerRadius: 1.05,
};

export const DIFFICULTIES = {
  rookie: {
    label: 'Rookie (Kid Mode)',
    aiSpeedMul: 0.72,
    aiReaction: 0.65,
    aiShootPower: 0.78,
    aiTackleRange: 1.55,
    gkSpeedMul: 0.74,
    humanMagnetBonus: 0.42,
    humanAimAssist: 0.58,
    coinBonus: 1.0,
  },
  pro: {
    label: 'Pro',
    aiSpeedMul: 0.89,
    aiReaction: 0.85,
    aiShootPower: 0.92,
    aiTackleRange: 1.85,
    gkSpeedMul: 0.9,
    humanMagnetBonus: 0.26,
    humanAimAssist: 0.38,
    coinBonus: 1.25,
  },
  legend: {
    label: 'Legend',
    aiSpeedMul: 1.01,
    aiReaction: 0.98,
    aiShootPower: 1.04,
    aiTackleRange: 2.05,
    gkSpeedMul: 1.04,
    humanMagnetBonus: 0.16,
    humanAimAssist: 0.22,
    coinBonus: 1.5,
  },
};

export const HUMAN_COLORS = ['#38BDF8', '#22C55E', '#FB923C'];

// 5-a-side base formations (home attacks +X, away mirrors to attack -X)
const HOME_FORMATION = [
  { x: -35.2, z: 0 },      // 0: GK
  { x: -18.5, z: -6.5 },   // 1: DEF
  { x: -12.0, z: 7.5 },    // 2: MID
  { x: -5.5, z: -7.5 },    // 3: FWD left
  { x: -4.2, z: 2.5 },     // 4: FWD striker
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hypot2(x, z) {
  return Math.hypot(x, z);
}

function normalize2(x, z) {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 1, z: 0 };
  return { x: x / len, z: z / len };
}

function lerpAngle(current, target, factor) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}

/**
 * Deterministic 5v5 Arcade Soccer Simulation Engine.
 * Runs identically in browser (Solo Mode) and Node.js server (3-Device Wi-Fi Multiplayer).
 */
export class MatchEngine {
  constructor(config = {}) {
    this.homeClubId = config.homeClubId || 'real-madrid';
    this.awayClubId = config.awayClubId || 'man-city';
    this.stadiumId = config.stadiumId || 'sunlit-park';
    this.difficultyKey = config.difficulty || 'rookie';
    this.diff = DIFFICULTIES[this.difficultyKey] || DIFFICULTIES.rookie;
    this.matchDuration = config.durationSeconds || 120; // 2 minutes default for brisk fun

    this.homeClub = getClubById(this.homeClubId);
    this.awayClub = getClubById(this.awayClubId);

    this.homeRoster = buildEffectiveRoster(this.homeClubId, config.homeDraft || []);
    this.awayRoster = buildEffectiveRoster(this.awayClubId, config.awayDraft || []);

    /**
     * Human participants: [{ slotId: 'p1', name: 'Leo', team: 'home', color: '#38BDF8', playerId: null }]
     */
    this.humans = (config.humans && config.humans.length > 0
      ? config.humans
      : [{ slotId: 'p1', name: 'Player 1', team: 'home', color: HUMAN_COLORS[0] }]
    ).map((h, i) => ({
      slotId: h.slotId || `p${i + 1}`,
      name: h.name || `Player ${i + 1}`,
      team: h.team === 'away' ? 'away' : 'home',
      color: h.color || HUMAN_COLORS[i % HUMAN_COLORS.length],
      playerId: null,
      input: {
        mx: 0,
        mz: 0,
        sprint: false,
        shoot: false,
        pass: false,
        skill: false,
        _prevShoot: false,
        _prevPass: false,
        _prevSkill: false,
      },
      shotCharge: 0,
    }));

    this.score = { home: 0, away: 0 };
    this.timeRemaining = this.matchDuration;
    this.phase = 'kickoff'; // 'kickoff' | 'playing' | 'goal' | 'fulltime'
    this.phaseTimer = 1.25;
    this.kickoffTeam = 'home';
    this.lastGoal = null;
    this.events = []; // Transient events for audio/FX ('kick', 'supershot', 'pass', 'tackle', 'goal', 'whistle', 'post', 'save', 'skill')
    this.stats = {
      homeShots: 0,
      awayShots: 0,
      homePasses: 0,
      awayPasses: 0,
      goalsBySlot: {},
    };

    this.ball = {
      x: 0,
      y: PITCH.ballRadius,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      ownerId: null,
      lastTouchId: null,
      lastTouchTeam: null,
      isSuper: false,
      spinX: 0,
      spinZ: 0,
    };

    this.players = [];
    this._initPlayers();
    this._assignInitialHumans();
    this._resetPositions('home');
  }

  _initPlayers() {
    this.players = [];
    const createTeam = (team, roster) => {
      const dir = team === 'home' ? 1 : -1;
      roster.forEach((data, idx) => {
        const homePos = HOME_FORMATION[idx];
        const baseX = homePos.x * dir;
        const baseZ = homePos.z * dir;
        const speedBase = 8.4 + ((data.pac - 50) / 50) * 4.4;
        this.players.push({
          id: `${team}_${idx}`,
          team,
          slotIndex: idx,
          isGK: idx === 0,
          data,
          x: baseX,
          y: 0,
          z: baseZ,
          vx: 0,
          vz: 0,
          facing: dir > 0 ? 0 : Math.PI,
          baseX,
          baseZ,
          speedBase,
          stamina: 1.0,
          superMeter: 25,
          kickCooldown: 0,
          stunTimer: 0,
          skillTimer: 0,
          diveTimer: 0,
          diveDir: 0,
          celebrateTimer: 0,
          runCycle: Math.random() * Math.PI * 2,
          humanSlotId: null,
          shotCharge: 0,
        });
      });
    };
    createTeam('home', this.homeRoster);
    createTeam('away', this.awayRoster);
  }

  _assignInitialHumans() {
    // Assign each human to distinct outfield players on their chosen team (starting from striker #4 down to #1)
    const taken = new Set();
    for (const h of this.humans) {
      const candidates = this.players
        .filter((p) => p.team === h.team && !p.isGK && !taken.has(p.id))
        .sort((a, b) => b.slotIndex - a.slotIndex);
      if (candidates.length > 0) {
        const chosen = candidates[0];
        h.playerId = chosen.id;
        chosen.humanSlotId = h.slotId;
        taken.add(chosen.id);
      }
    }
  }

  _resetPositions(kickoffTeam) {
    this.kickoffTeam = kickoffTeam;
    this.ball.x = 0;
    this.ball.y = PITCH.ballRadius;
    this.ball.z = 0;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.vz = 0;
    this.ball.ownerId = null;
    this.ball.isSuper = false;

    for (const p of this.players) {
      const dir = p.team === 'home' ? 1 : -1;
      const form = HOME_FORMATION[p.slotIndex];
      p.x = form.x * dir;
      p.z = form.z * dir;
      if (p.slotIndex === 4 && p.team === kickoffTeam) {
        p.x = -1.8 * dir;
        p.z = 0;
      }
      p.y = 0;
      p.vx = 0;
      p.vz = 0;
      p.facing = dir > 0 ? 0 : Math.PI;
      p.kickCooldown = 0;
      p.stunTimer = 0;
      p.skillTimer = 0;
      p.diveTimer = 0;
      p.celebrateTimer = 0;
      p.shotCharge = 0;
    }

    for (const h of this.humans) {
      h.shotCharge = 0;
    }
  }

  setHumanInput(slotId, input) {
    const h = this.humans.find((item) => item.slotId === slotId);
    if (!h || !input) return;
    h.input.mx = clamp(Number(input.mx) || 0, -1, 1);
    h.input.mz = clamp(Number(input.mz) || 0, -1, 1);
    h.input.sprint = Boolean(input.sprint);
    h.input.shoot = Boolean(input.shoot);
    h.input.pass = Boolean(input.pass);
    h.input.skill = Boolean(input.skill);
  }

  _emit(type, payload = {}) {
    this.events.push({ type, ...payload });
  }

  consumeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  _getPlayer(id) {
    return this.players.find((p) => p.id === id) || null;
  }

  _getHumanForPlayer(playerId) {
    return this.humans.find((h) => h.playerId === playerId) || null;
  }

  _switchHumanToPlayer(human, newPlayer) {
    if (!human || !newPlayer || newPlayer.isGK) return;
    if (newPlayer.humanSlotId && newPlayer.humanSlotId !== human.slotId) return;
    const oldPlayer = this._getPlayer(human.playerId);
    if (oldPlayer) {
      oldPlayer.humanSlotId = null;
      oldPlayer.shotCharge = 0;
    }
    human.playerId = newPlayer.id;
    human.shotCharge = 0;
    newPlayer.humanSlotId = human.slotId;
  }

  step(dt) {
    const clampedDt = Math.min(dt, 0.05);

    if (this.phase === 'fulltime') {
      return;
    }

    if (this.phase === 'kickoff') {
      this.phaseTimer -= clampedDt;
      if (this.phaseTimer <= 0) {
        this.phase = 'playing';
        this._emit('whistle', { kind: 'kickoff' });
      }
      this._updateTimersOnly(clampedDt);
      return;
    }

    if (this.phase === 'goal') {
      this.phaseTimer -= clampedDt;
      this._stepGoalCelebration(clampedDt);
      if (this.phaseTimer <= 0) {
        const concedingTeam = this.lastGoal?.team === 'home' ? 'away' : 'home';
        this._resetPositions(concedingTeam);
        this.phase = 'kickoff';
        this.phaseTimer = 0.9;
      }
      return;
    }

    // Active playing phase
    this.timeRemaining = Math.max(0, this.timeRemaining - clampedDt);
    if (this.timeRemaining <= 0) {
      this.phase = 'fulltime';
      this._emit('whistle', { kind: 'fulltime' });
      return;
    }

    // 1. Process human controls
    for (const human of this.humans) {
      this._stepHumanController(human, clampedDt);
    }

    // 2. Process AI players (teammates & opponents & goalkeepers)
    for (const player of this.players) {
      if (!player.humanSlotId) {
        if (player.isGK) {
          this._stepGoalkeeper(player, clampedDt);
        } else {
          this._stepOutfieldAI(player, clampedDt);
        }
      }
    }

    // 3. Apply movement, collisions, and pitch bounds to all players
    this._integratePlayers(clampedDt);

    // 4. Step ball physics, possession pickup, and goal detection
    this._stepBall(clampedDt);
  }

  _updateTimersOnly(dt) {
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      p.stunTimer = Math.max(0, p.stunTimer - dt);
      p.skillTimer = Math.max(0, p.skillTimer - dt);
    }
  }

  _stepGoalCelebration(dt) {
    // Let ball finish rolling softly in net
    this.ball.x += this.ball.vx * dt;
    this.ball.y = Math.max(PITCH.ballRadius, this.ball.y + this.ball.vy * dt);
    this.ball.z += this.ball.vz * dt;
    this.ball.vx *= 0.92;
    this.ball.vz *= 0.92;
    if (this.ball.y > PITCH.ballRadius) {
      this.ball.vy -= 24 * dt;
    } else {
      this.ball.vy = 0;
    }

    // Scorer jumps & spins happily!
    const scorer = this._getPlayer(this.lastGoal?.scorerId);
    for (const p of this.players) {
      if (p.team === this.lastGoal?.team) {
        p.celebrateTimer += dt;
        if (p === scorer) {
          p.y = Math.abs(Math.sin(p.celebrateTimer * 7.5)) * 1.15;
          p.facing += dt * 4.5;
        } else {
          p.y = Math.abs(Math.sin(p.celebrateTimer * 6 + p.slotIndex)) * 0.55;
        }
      } else {
        p.y = 0;
      }
    }
  }

  _stepHumanController(human, dt) {
    const p = this._getPlayer(human.playerId);
    if (!p) return;

    const inp = human.input;
    const passJustPressed = inp.pass && !inp._prevPass;
    const shootJustReleased = !inp.shoot && inp._prevShoot;
    const skillJustPressed = inp.skill && !inp._prevSkill;

    const hasBall = this.ball.ownerId === p.id;

    // Movement vector
    const mag = Math.hypot(inp.mx, inp.mz);
    let moveX = 0;
    let moveZ = 0;
    if (mag > 0.08) {
      const clampedMag = Math.min(1, mag);
      moveX = (inp.mx / mag) * clampedMag;
      moveZ = (inp.mz / mag) * clampedMag;
      const desiredAngle = Math.atan2(moveZ, moveX);
      p.facing = lerpAngle(p.facing, desiredAngle, Math.min(1, dt * 15));
    }

    // Sprint stamina
    const sprinting = inp.sprint && mag > 0.1 && p.stamina > 0.06;
    if (sprinting) {
      p.stamina = Math.max(0, p.stamina - dt * 0.34);
    } else {
      p.stamina = Math.min(1, p.stamina + dt * 0.28);
    }

    let speed = p.speedBase * (sprinting ? 1.32 : 1.0);
    if (hasBall) speed *= 0.94 + (p.data.dri / 100) * 0.08;
    if (p.skillTimer > 0) speed *= 1.24;
    if (p.stunTimer > 0) speed *= 0.4;

    p.vx = moveX * speed;
    p.vz = moveZ * speed;

    // Build Super Meter gradually while dribbling!
    if (hasBall && mag > 0.2) {
      p.superMeter = Math.min(100, p.superMeter + dt * 11);
    }

    // Skill Spin Move!
    if (skillJustPressed && p.skillTimer <= 0 && p.stunTimer <= 0) {
      p.skillTimer = 0.55;
      p.superMeter = Math.min(100, p.superMeter + 14);
      this._emit('skill', { x: p.x, z: p.z, playerId: p.id });
    }

    // Actions WITH ball: Pass or Charge/Fire Shot
    if (hasBall) {
      if (passJustPressed) {
        this._performPass(p, human, moveX, moveZ);
        human.shotCharge = 0;
        p.shotCharge = 0;
      } else if (inp.shoot) {
        human.shotCharge = Math.min(1, human.shotCharge + dt * 1.6);
        p.shotCharge = human.shotCharge;
      } else if (shootJustReleased && human.shotCharge > 0.02) {
        this._performShot(p, human.shotCharge, moveX, moveZ, true);
        human.shotCharge = 0;
        p.shotCharge = 0;
      }
    } else {
      // Clear shot charge if ball lost
      human.shotCharge = 0;
      p.shotCharge = 0;

      // Without ball: Pass/Switch switches player OR tackles if close!
      if (passJustPressed) {
        const distToBall = hypot2(this.ball.x - p.x, this.ball.z - p.z);
        if (distToBall < 3.4) {
          this._performTackle(p);
        } else {
          // Switch to nearest unassigned outfield teammate to the ball
          const best = this._findBestSwitchCandidate(human);
          if (best && best.id !== p.id) {
            this._switchHumanToPlayer(human, best);
          } else {
            this._performTackle(p);
          }
        }
      } else if (inp.shoot && !inp._prevShoot) {
        // Pressing shoot on defense does a clean slide/poke tackle
        this._performTackle(p);
      }
    }

    inp._prevShoot = inp.shoot;
    inp._prevPass = inp.pass;
    inp._prevSkill = inp.skill;
  }

  _findBestSwitchCandidate(human) {
    let best = null;
    let bestDist = Infinity;
    for (const p of this.players) {
      if (p.team !== human.team || p.isGK) continue;
      if (p.humanSlotId && p.humanSlotId !== human.slotId) continue;
      const d = hypot2(p.x - this.ball.x, p.z - this.ball.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  _performPass(passer, human, aimX, aimZ) {
    const dir = Math.hypot(aimX, aimZ) > 0.15
      ? normalize2(aimX, aimZ)
      : { x: Math.cos(passer.facing), z: Math.sin(passer.facing) };

    // Find best teammate in the aimed cone (prioritize human teammates or open attackers!)
    let bestTarget = null;
    let bestScore = -Infinity;
    for (const mate of this.players) {
      if (mate.team !== passer.team || mate.id === passer.id || mate.isGK) continue;
      const dx = mate.x - passer.x;
      const dz = mate.z - passer.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.2) continue;
      const dot = (dx / dist) * dir.x + (dz / dist) * dir.z;
      const humanBonus = mate.humanSlotId ? 0.35 : 0;
      const score = dot * 2.2 - dist * 0.025 + humanBonus;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = mate;
      }
    }

    let passDir = dir;
    let speed = 22 + (passer.data.pas / 100) * 6;
    if (bestTarget && bestScore > -0.25) {
      // Lead pass slightly ahead of moving receiver
      const leadX = bestTarget.x + bestTarget.vx * 0.22;
      const leadZ = bestTarget.z + bestTarget.vz * 0.22;
      const dx = leadX - passer.x;
      const dz = leadZ - passer.z;
      const dist = Math.hypot(dx, dz);
      passDir = normalize2(dx, dz);
      speed = clamp(15 + dist * 0.72, 17, 29);

      // If passer was human and receiver is AI, seamlessly switch control to the receiver!
      if (human && !bestTarget.humanSlotId) {
        this._switchHumanToPlayer(human, bestTarget);
      }
    }

    this.ball.ownerId = null;
    this.ball.lastTouchId = passer.id;
    this.ball.lastTouchTeam = passer.team;
    this.ball.isSuper = false;
    this.ball.vx = passDir.x * speed;
    this.ball.vz = passDir.z * speed;
    this.ball.vy = 1.4;
    passer.kickCooldown = 0.26;
    passer.superMeter = Math.min(100, passer.superMeter + 18);

    if (passer.team === 'home') this.stats.homePasses++;
    else this.stats.awayPasses++;

    this._emit('pass', { x: this.ball.x, z: this.ball.z });
  }

  _performShot(shooter, charge, aimX, aimZ, isHuman) {
    const attackDir = shooter.team === 'home' ? 1 : -1;
    const goalX = attackDir * PITCH.halfLength;
    const rawDir = Math.hypot(aimX, aimZ) > 0.15
      ? normalize2(aimX, aimZ)
      : { x: Math.cos(shooter.facing), z: Math.sin(shooter.facing) };

    // Aim assist toward top/bottom corner of the opponent's goal when roughly facing goal!
    let targetDir = rawDir;
    const toGoal = normalize2(goalX - shooter.x, -shooter.z * 0.35);
    const alignment = rawDir.x * toGoal.x + rawDir.z * toGoal.z;

    if (alignment > 0.15) {
      // Choose corner biased by player's Z input so kids can aim left/right corners easily!
      const cornerZ = Math.abs(aimZ) > 0.2
        ? Math.sign(aimZ) * (PITCH.goalHalfWidth * 0.68)
        : (shooter.z >= 0 ? -1 : 1) * (PITCH.goalHalfWidth * 0.55);
      const assistVec = normalize2(goalX - shooter.x, cornerZ - shooter.z);
      const assistWeight = isHuman ? this.diff.humanAimAssist : 0.65;
      targetDir = normalize2(
        rawDir.x * (1 - assistWeight) + assistVec.x * assistWeight,
        rawDir.z * (1 - assistWeight) + assistVec.z * assistWeight
      );
    }

    const isSuper = isHuman && shooter.superMeter >= 98 && charge >= 0.35;
    const statPower = 24 + (shooter.data.sho / 100) * 11;
    let speed = statPower * (0.72 + charge * 0.45);
    if (!isHuman) speed *= this.diff.aiShootPower;
    if (isSuper) {
      speed *= 1.28;
      shooter.superMeter = 0;
    }

    this.ball.ownerId = null;
    this.ball.lastTouchId = shooter.id;
    this.ball.lastTouchTeam = shooter.team;
    this.ball.isSuper = isSuper;
    this.ball.vx = targetDir.x * speed;
    this.ball.vz = targetDir.z * speed;
    this.ball.vy = clamp(2.8 + charge * 5.2 + (isSuper ? 1.4 : 0), 2.5, 8.8);
    shooter.kickCooldown = 0.32;
    shooter.facing = Math.atan2(targetDir.z, targetDir.x);

    if (shooter.team === 'home') this.stats.homeShots++;
    else this.stats.awayShots++;

    this._emit(isSuper ? 'supershot' : 'kick', {
      x: this.ball.x,
      z: this.ball.z,
      power: charge,
      playerId: shooter.id,
    });
  }

  _performTackle(tackler) {
    if (tackler.kickCooldown > 0 || tackler.stunTimer > 0) return;
    const dir = { x: Math.cos(tackler.facing), z: Math.sin(tackler.facing) };
    tackler.vx += dir.x * 7.5;
    tackler.vz += dir.z * 7.5;
    tackler.kickCooldown = 0.42;

    const distToBall = hypot2(this.ball.x - tackler.x, this.ball.z - tackler.z);
    if (distToBall < 2.8) {
      const owner = this._getPlayer(this.ball.ownerId);
      if (owner && owner.team !== tackler.team) {
        if (owner.skillTimer > 0) {
          // Skill spin dodged the tackle!
          return;
        }
        owner.stunTimer = 0.55;
        owner.kickCooldown = 0.55;
        this.ball.ownerId = tackler.id;
        this.ball.lastTouchId = tackler.id;
        this.ball.lastTouchTeam = tackler.team;
        tackler.superMeter = Math.min(100, tackler.superMeter + 22);
        this._emit('tackle', { x: tackler.x, z: tackler.z });
      }
    }
  }

  _stepGoalkeeper(gk, dt) {
    const dir = gk.team === 'home' ? 1 : -1;
    const goalLineX = -dir * (PITCH.halfLength - 2.3);
    const hasBall = this.ball.ownerId === gk.id;

    if (gk.diveTimer > 0) {
      gk.diveTimer = Math.max(0, gk.diveTimer - dt);
      gk.vx *= 0.88;
      gk.vz *= 0.92;
      return;
    }

    if (hasBall) {
      gk.vx = 0;
      gk.vz = 0;
      gk.facing = dir > 0 ? 0 : Math.PI;
      // Quickly distribute to a teammate (favoring human teammates!)
      if (gk.kickCooldown <= 0) {
        const mates = this.players.filter((p) => p.team === gk.team && !p.isGK);
        mates.sort((a, b) => {
          const ha = a.humanSlotId ? -15 : 0;
          const hb = b.humanSlotId ? -15 : 0;
          return (ha + Math.abs(a.x - gk.x)) - (hb + Math.abs(b.x - gk.x));
        });
        const target = mates[0];
        if (target) {
          const d = normalize2(target.x - gk.x, target.z - gk.z);
          this.ball.ownerId = null;
          this.ball.lastTouchId = gk.id;
          this.ball.lastTouchTeam = gk.team;
          this.ball.vx = d.x * 23;
          this.ball.vz = d.z * 23;
          this.ball.vy = 2.6;
          gk.kickCooldown = 0.5;
          this._emit('pass', { x: gk.x, z: gk.z });
        }
      }
      return;
    }

    // Track ball Z along goal mouth
    const targetZ = clamp(this.ball.z * 0.72, -PITCH.goalHalfWidth + 1.2, PITCH.goalHalfWidth - 1.2);
    const ballApproaching = (this.ball.vx * -dir) > 6 && Math.abs(this.ball.x - goalLineX) < 18;
    const targetX = goalLineX + (ballApproaching ? dir * 1.4 : 0);

    const dx = targetX - gk.x;
    const dz = targetZ - gk.z;
    const dist = Math.hypot(dx, dz);
    const gkMaxSpeed = (8.8 + (gk.data.def / 100) * 3.2) * this.diff.gkSpeedMul;

    if (dist > 0.25) {
      const n = normalize2(dx, dz);
      gk.vx = n.x * Math.min(gkMaxSpeed, dist * 5.2);
      gk.vz = n.z * Math.min(gkMaxSpeed, dist * 5.2);
    } else {
      gk.vx = 0;
      gk.vz = 0;
    }
    gk.facing = Math.atan2(this.ball.z - gk.z, this.ball.x - gk.x);

    // Diving save attempt if a fast shot enters the box!
    if (ballApproaching && Math.abs(this.ball.x - gk.x) < 7.5 && Math.abs(this.ball.z - gk.z) < 4.5) {
      const saveChance = this.ball.isSuper ? 0.28 : this.diff.aiReaction;
      if (Math.abs(this.ball.z - gk.z) > 1.3 && Math.random() < saveChance * dt * 7.5) {
        gk.diveTimer = 0.45;
        gk.diveDir = Math.sign(this.ball.z - gk.z);
        gk.vz = gk.diveDir * (13.5 * this.diff.gkSpeedMul);
      }
    }
  }

  _stepOutfieldAI(p, dt) {
    const attackDir = p.team === 'home' ? 1 : -1;
    const hasBall = this.ball.ownerId === p.id;
    const owner = this._getPlayer(this.ball.ownerId);
    const teamHasBall = owner && owner.team === p.team;
    const aiSpeed = p.speedBase * this.diff.aiSpeedMul * (p.stunTimer > 0 ? 0.35 : 1.0);

    if (hasBall) {
      const goalX = attackDir * PITCH.halfLength;
      const distToGoal = hypot2(goalX - p.x, 0 - p.z);

      // If teammate is human and open ahead, pass to the kid! Kids love getting passes!
      const humanMates = this.players.filter((m) => m.team === p.team && m.humanSlotId && m.id !== p.id);
      for (const hm of humanMates) {
        const ahead = (hm.x - p.x) * attackDir > -4;
        const d = hypot2(hm.x - p.x, hm.z - p.z);
        if (ahead && d > 5 && d < 28 && Math.random() < dt * 2.2) {
          const dir = normalize2(hm.x - p.x, hm.z - p.z);
          this._performPass(p, null, dir.x, dir.z);
          return;
        }
      }

      // Shoot when within range
      if (distToGoal < 20 && Math.random() < dt * 2.4 * this.diff.aiReaction) {
        const toGoal = normalize2(goalX - p.x, (Math.random() - 0.5) * 6 - p.z);
        this._performShot(p, 0.58 + Math.random() * 0.32, toGoal.x, toGoal.z, false);
        return;
      }

      // Dribble toward opponent goal while weaving gently away from nearest defender
      let steerX = goalX - p.x;
      let steerZ = -p.z * 0.35;
      for (const opp of this.players) {
        if (opp.team === p.team) continue;
        const odx = p.x - opp.x;
        const odz = p.z - opp.z;
        const od = Math.hypot(odx, odz);
        if (od < 5.5 && od > 0.1) {
          steerX += (odx / od) * 6;
          steerZ += (odz / od) * 8;
        }
      }
      const n = normalize2(steerX, steerZ);
      p.vx = n.x * aiSpeed * 0.9;
      p.vz = n.z * aiSpeed * 0.9;
      p.facing = lerpAngle(p.facing, Math.atan2(n.z, n.x), Math.min(1, dt * 10));
      return;
    }

    // Determine if this AI is the closest AI on its team to chase the ball
    const isChaser = !teamHasBall && this._isClosestAIBallChaser(p);

    let targetX = p.baseX;
    let targetZ = p.baseZ;

    if (isChaser) {
      targetX = this.ball.x + this.ball.vx * 0.12;
      targetZ = this.ball.z + this.ball.vz * 0.12;

      // Attempt tackle if opponent has ball within range
      if (owner && owner.team !== p.team) {
        const d = hypot2(this.ball.x - p.x, this.ball.z - p.z);
        if (d < this.diff.aiTackleRange && Math.random() < dt * 2.1 * this.diff.aiReaction) {
          this._performTackle(p);
        }
      }
    } else if (teamHasBall) {
      // Make fun supporting attacking runs!
      const shiftX = clamp(this.ball.x * 0.55 + attackDir * 11, -PITCH.halfLength + 6, PITCH.halfLength - 5);
      targetX = p.baseX * 0.35 + shiftX * 0.65;
      targetZ = clamp(p.baseZ + Math.sin(this.timeRemaining * 0.8 + p.slotIndex * 2) * 3.5, -PITCH.halfWidth + 4, PITCH.halfWidth - 4);
    } else {
      // Defensive zonal shape
      const shiftX = clamp(this.ball.x * 0.6 - attackDir * 7, -PITCH.halfLength + 7, PITCH.halfLength - 7);
      targetX = p.baseX * 0.45 + shiftX * 0.55;
      targetZ = clamp(p.baseZ * 0.6 + this.ball.z * 0.35, -PITCH.halfWidth + 4, PITCH.halfWidth - 4);
    }

    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.6) {
      const n = normalize2(dx, dz);
      const speedMul = isChaser ? 0.96 : 0.82;
      p.vx = n.x * Math.min(aiSpeed * speedMul, dist * 4);
      p.vz = n.z * Math.min(aiSpeed * speedMul, dist * 4);
      p.facing = lerpAngle(p.facing, Math.atan2(n.z, n.x), Math.min(1, dt * 10));
    } else {
      p.vx *= 0.8;
      p.vz *= 0.8;
      p.facing = lerpAngle(p.facing, Math.atan2(this.ball.z - p.z, this.ball.x - p.x), Math.min(1, dt * 8));
    }
  }

  _isClosestAIBallChaser(candidate) {
    let best = null;
    let bestDist = Infinity;
    for (const p of this.players) {
      if (p.team !== candidate.team || p.isGK || p.humanSlotId) continue;
      const d = hypot2(p.x - this.ball.x, p.z - this.ball.z);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best === candidate;
  }

  _integratePlayers(dt) {
    for (const p of this.players) {
      p.kickCooldown = Math.max(0, p.kickCooldown - dt);
      p.stunTimer = Math.max(0, p.stunTimer - dt);
      p.skillTimer = Math.max(0, p.skillTimer - dt);

      p.x += p.vx * dt;
      p.z += p.vz * dt;

      // Keep players inside pitch bounds
      const maxX = PITCH.halfLength - 0.8;
      const maxZ = PITCH.halfWidth - 0.8;
      p.x = clamp(p.x, -maxX, maxX);
      p.z = clamp(p.z, -maxZ, maxZ);

      const speed = Math.hypot(p.vx, p.vz);
      if (speed > 0.4) {
        p.runCycle += dt * (2.6 + speed * 0.95);
      }
    }

    // Soft player-to-player separation so characters never overlap awkwardly
    const minSep = PITCH.playerRadius * 1.85;
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < minSep) {
          const push = (minSep - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
        }
      }
    }
  }

  _stepBall(dt) {
    const owner = this._getPlayer(this.ball.ownerId);

    if (owner) {
      // Smooth magnetic dribble right at the player's boots
      const dribbleDist = 1.18;
      const targetX = owner.x + Math.cos(owner.facing) * dribbleDist;
      const targetZ = owner.z + Math.sin(owner.facing) * dribbleDist;
      this.ball.x += (targetX - this.ball.x) * Math.min(1, dt * 22);
      this.ball.z += (targetZ - this.ball.z) * Math.min(1, dt * 22);
      this.ball.y = PITCH.ballRadius;
      this.ball.vx = owner.vx;
      this.ball.vz = owner.vz;
      this.ball.vy = 0;
      this.ball.spinX = owner.vz * 2.1;
      this.ball.spinZ = -owner.vx * 2.1;

      // Check if an opponent steals cleanly on contact (unless owner is spinning!)
      if (owner.skillTimer <= 0 && !owner.isGK) {
        for (const opp of this.players) {
          if (opp.team === owner.team || opp.kickCooldown > 0 || opp.stunTimer > 0) continue;
          const d = hypot2(this.ball.x - opp.x, this.ball.z - opp.z);
          const stealRadius = opp.humanSlotId ? 1.72 : 1.38;
          if (d < stealRadius) {
            owner.kickCooldown = 0.5;
            owner.stunTimer = 0.35;
            this.ball.ownerId = opp.id;
            this.ball.lastTouchId = opp.id;
            this.ball.lastTouchTeam = opp.team;
            this._emit('tackle', { x: opp.x, z: opp.z });
            break;
          }
        }
      }
      return;
    }

    // Free ball physics — apply gravity BEFORE position update and ALWAYS clamp to turf floor!
    if (this.ball.y > PITCH.ballRadius || this.ball.vy !== 0) {
      this.ball.vy -= 21 * dt;
    }
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.z += this.ball.vz * dt;

    if (this.ball.y <= PITCH.ballRadius) {
      this.ball.y = PITCH.ballRadius;
      if (this.ball.vy < -1.8) {
        this.ball.vy = -this.ball.vy * 0.56;
      } else {
        this.ball.vy = 0;
      }
    }

    // Grass / air friction
    const drag = this.ball.y <= PITCH.ballRadius + 0.05 ? Math.pow(0.28, dt) : Math.pow(0.75, dt);
    this.ball.vx *= drag;
    this.ball.vz *= drag;
    this.ball.spinX = this.ball.vz * 1.5;
    this.ball.spinZ = -this.ball.vx * 1.5;

    if (Math.hypot(this.ball.vx, this.ball.vz) < 7) {
      this.ball.isSuper = false;
    }

    // Check Goal Scoring!
    const inGoalMouthZ = Math.abs(this.ball.z) < PITCH.goalHalfWidth - PITCH.ballRadius * 0.3;
    const inGoalMouthY = this.ball.y < PITCH.goalHeight;

    if (inGoalMouthZ && inGoalMouthY) {
      if (this.ball.x > PITCH.halfLength + PITCH.ballRadius * 0.5) {
        this._registerGoal('home');
        return;
      }
      if (this.ball.x < -PITCH.halfLength - PITCH.ballRadius * 0.5) {
        this._registerGoal('away');
        return;
      }
    }

    // Goal post bounce check!
    const posts = [
      { x: PITCH.halfLength, z: -PITCH.goalHalfWidth },
      { x: PITCH.halfLength, z: PITCH.goalHalfWidth },
      { x: -PITCH.halfLength, z: -PITCH.goalHalfWidth },
      { x: -PITCH.halfLength, z: PITCH.goalHalfWidth },
    ];
    for (const post of posts) {
      const dx = this.ball.x - post.x;
      const dz = this.ball.z - post.z;
      const dist = Math.hypot(dx, dz);
      if (dist < PITCH.ballRadius + 0.28 && this.ball.y < PITCH.goalHeight + 0.3) {
        const n = normalize2(dx, dz);
        const speed = Math.hypot(this.ball.vx, this.ball.vz);
        this.ball.vx = n.x * Math.max(8, speed * 0.72);
        this.ball.vz = n.z * Math.max(8, speed * 0.72);
        this.ball.x = post.x + n.x * (PITCH.ballRadius + 0.32);
        this.ball.z = post.z + n.z * (PITCH.ballRadius + 0.32);
        this._emit('post', { x: post.x, z: post.z });
      }
    }

    // Cushioned arcade touchline & endline rebound (keeps gameplay fast & continuous for kids!)
    if (this.ball.z > PITCH.halfWidth - PITCH.ballRadius) {
      this.ball.z = PITCH.halfWidth - PITCH.ballRadius;
      this.ball.vz = -Math.abs(this.ball.vz) * 0.74;
    } else if (this.ball.z < -PITCH.halfWidth + PITCH.ballRadius) {
      this.ball.z = -PITCH.halfWidth + PITCH.ballRadius;
      this.ball.vz = Math.abs(this.ball.vz) * 0.74;
    }

    if (!inGoalMouthZ || !inGoalMouthY) {
      if (this.ball.x > PITCH.halfLength - PITCH.ballRadius) {
        this.ball.x = PITCH.halfLength - PITCH.ballRadius;
        this.ball.vx = -Math.abs(this.ball.vx) * 0.74;
      } else if (this.ball.x < -PITCH.halfLength + PITCH.ballRadius) {
        this.ball.x = -PITCH.halfLength + PITCH.ballRadius;
        this.ball.vx = Math.abs(this.ball.vx) * 0.74;
      }
    }

    // Check player ball pickup / goalkeeper save
    const ballSpeed = Math.hypot(this.ball.vx, this.ball.vz);
    for (const p of this.players) {
      if (p.kickCooldown > 0 || p.stunTimer > 0) continue;
      const dist = hypot2(this.ball.x - p.x, this.ball.z - p.z);
      const reachY = p.isGK ? 3.2 : 2.1;
      if (this.ball.y > reachY) continue;

      let pickupRadius = PITCH.playerRadius + PITCH.ballRadius + (p.humanSlotId ? this.diff.humanMagnetBonus : 0.14);
      if (p.isGK) pickupRadius += p.diveTimer > 0 ? 1.1 : 0.55;

      if (dist < pickupRadius) {
        // Fast shot near GK: either catch or dramatic parry!
        if (p.isGK && ballSpeed > 24 && p.team !== this.ball.lastTouchTeam) {
          const dir = p.team === 'home' ? 1 : -1;
          this.ball.vx = dir * 13 + (Math.random() - 0.5) * 6;
          this.ball.vz = (this.ball.z >= p.z ? 1 : -1) * 11;
          this.ball.vy = 4.2;
          this.ball.isSuper = false;
          this.ball.lastTouchId = p.id;
          this.ball.lastTouchTeam = p.team;
          p.kickCooldown = 0.4;
          this._emit('save', { x: p.x, z: p.z, playerId: p.id });
          break;
        }

        // Clean possession pickup!
        this.ball.ownerId = p.id;
        this.ball.lastTouchId = p.id;
        this.ball.lastTouchTeam = p.team;
        this.ball.isSuper = false;
        if (p.isGK) {
          p.kickCooldown = 0.65; // Hold briefly before distributing
          this._emit('save', { x: p.x, z: p.z, playerId: p.id });
        } else {
          // If an AI teammate on a human's team picks up a loose ball & no other human controls them,
          // check if we want to auto-switch a solo human to the ball carrier!
          const teamHumans = this.humans.filter((h) => h.team === p.team);
          if (teamHumans.length === 1 && !p.humanSlotId) {
            this._switchHumanToPlayer(teamHumans[0], p);
          }
        }
        break;
      }
    }
  }

  _registerGoal(scoringTeam) {
    this.score[scoringTeam]++;
    this.phase = 'goal';
    this.phaseTimer = 2.9;
    this.ball.ownerId = null;

    let scorer = this._getPlayer(this.ball.lastTouchId);
    if (!scorer || scorer.team !== scoringTeam) {
      // Own goal fallback: credit nearest attacking forward
      scorer = this.players.find((p) => p.team === scoringTeam && p.slotIndex === 4) || this.players[0];
    }

    const scorerHuman = this._getHumanForPlayer(scorer.id);
    if (scorerHuman) {
      this.stats.goalsBySlot[scorerHuman.slotId] = (this.stats.goalsBySlot[scorerHuman.slotId] || 0) + 1;
    }

    this.lastGoal = {
      team: scoringTeam,
      clubName: scoringTeam === 'home' ? this.homeClub.name : this.awayClub.name,
      scorerId: scorer.id,
      scorerName: scorer.data.name,
      scorerNumber: scorer.data.number,
      humanName: scorerHuman ? scorerHuman.name : null,
      wasSuper: this.ball.isSuper,
    };

    // Slow ball gently inside the net
    this.ball.vx *= 0.25;
    this.ball.vz *= 0.25;
    this.ball.vy = Math.min(this.ball.vy, 1.5);

    this._emit('goal', this.lastGoal);
  }

  /**
   * Compact serializable snapshot sent over WebSockets (30Hz) or read directly in Solo Mode.
   */
  getSnapshot() {
    return {
      phase: this.phase,
      phaseTimer: Number(this.phaseTimer.toFixed(2)),
      timeRemaining: Number(this.timeRemaining.toFixed(2)),
      score: { ...this.score },
      lastGoal: this.lastGoal,
      stats: this.stats,
      ball: {
        x: Number(this.ball.x.toFixed(2)),
        y: Number(this.ball.y.toFixed(2)),
        z: Number(this.ball.z.toFixed(2)),
        vx: Number(this.ball.vx.toFixed(2)),
        vy: Number(this.ball.vy.toFixed(2)),
        vz: Number(this.ball.vz.toFixed(2)),
        ownerId: this.ball.ownerId,
        isSuper: this.ball.isSuper,
      },
      humans: this.humans.map((h) => ({
        slotId: h.slotId,
        name: h.name,
        team: h.team,
        color: h.color,
        playerId: h.playerId,
        shotCharge: Number(h.shotCharge.toFixed(2)),
      })),
      players: this.players.map((p) => ({
        id: p.id,
        team: p.team,
        slotIndex: p.slotIndex,
        isGK: p.isGK,
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
        z: Number(p.z.toFixed(2)),
        vx: Number(p.vx.toFixed(2)),
        vz: Number(p.vz.toFixed(2)),
        facing: Number(p.facing.toFixed(2)),
        runCycle: Number(p.runCycle.toFixed(2)),
        stamina: Number(p.stamina.toFixed(2)),
        superMeter: Math.round(p.superMeter),
        skillTimer: Number(p.skillTimer.toFixed(2)),
        diveTimer: Number(p.diveTimer.toFixed(2)),
        diveDir: p.diveDir,
        shotCharge: Number(p.shotCharge.toFixed(2)),
        humanSlotId: p.humanSlotId,
      })),
    };
  }

  getMeta() {
    return {
      homeClubId: this.homeClubId,
      awayClubId: this.awayClubId,
      stadiumId: this.stadiumId,
      difficulty: this.difficultyKey,
      durationSeconds: this.matchDuration,
      homeRoster: this.homeRoster,
      awayRoster: this.awayRoster,
    };
  }
}
