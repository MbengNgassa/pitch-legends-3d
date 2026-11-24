import { getClubById } from '../../shared/teamsData.js';
import { PITCH } from '../../shared/MatchEngine.js';
import { renderClubBadgeSVG } from './ClubBadge.js';

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/**
 * Manages the in-match broadcast HUD, Goal Celebration banner,
 * Responsive Touch Gamepad (for phones/tablets), and Full-Time Coin Rewards modal.
 */
export class HudOverlay {
  constructor(rootEl, callbacks) {
    this.root = rootEl;
    this.callbacks = callbacks;
    this.touchState = { mx: 0, mz: 0, sprint: false, shoot: false, pass: false, skill: false };
    this.forceTouchVisible = false;
    this.isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 820;
    this.lastGoalTimestamp = 0;
    this.fulltimeShown = false;
  }

  mount(meta, isMultiplayer = false, isHost = true) {
    this.meta = meta;
    this.isMultiplayer = isMultiplayer;
    this.isHost = isHost;
    this.homeClub = meta.homeClub || getClubById(meta.homeClubId);
    this.awayClub = meta.awayClub || getClubById(meta.awayClubId);
    this.fulltimeShown = false;
    this.touchState = { mx: 0, mz: 0, sprint: false, shoot: false, pass: false, skill: false };

    const showTouch = this.isTouchDevice || this.forceTouchVisible;

    this.root.innerHTML = `
      <div class="hud-layer">
        <!-- Top Broadcast Scorebug -->
        <header class="hud-topbar">
          <div class="scorebug" id="hud-scorebug">
            <div class="scorebug-team home">
              ${renderClubBadgeSVG(this.homeClub, 30)}
              <span class="scorebug-abbr">${this.homeClub.shortName}</span>
            </div>
            <div class="scorebug-score">
              <span id="hud-home-score">0</span>
              <span class="scorebug-sep">-</span>
              <span id="hud-away-score">0</span>
            </div>
            <div class="scorebug-team away">
              <span class="scorebug-abbr">${this.awayClub.shortName}</span>
              ${renderClubBadgeSVG(this.awayClub, 30)}
            </div>
            <div class="scorebug-clock" id="hud-clock">${formatClock(meta.durationSeconds)}</div>
          </div>

          <div class="hud-actions">
            <button id="hud-fs-btn" class="hud-icon-btn" title="Fullscreen Landscape">Full</button>
            <button id="hud-touch-toggle" class="hud-icon-btn" title="Toggle Touch Controls">
              ${showTouch ? 'Touch: ON' : 'Touch'}
            </button>
            <button id="hud-mute-btn" class="hud-icon-btn" title="Sound On/Off">Sound</button>
            <button id="hud-exit-btn" class="hud-icon-btn danger" title="Leave Match">Menu</button>
          </div>
        </header>

        <!-- Center Kickoff / Goal Celebration Banner -->
        <div class="goal-banner hidden" id="hud-goal-banner">
          <div class="goal-banner-kicker" id="hud-goal-kicker">GOAL!!</div>
          <div class="goal-banner-scorer" id="hud-goal-scorer">Mbappé #9</div>
          <div class="goal-banner-sub" id="hud-goal-sub">Real Madrid</div>
        </div>

        <div class="kickoff-pill hidden" id="hud-kickoff-pill">KICK OFF!</div>
        <div class="skill-callout-pill hidden" id="hud-skill-pill">360° ROULETTE!</div>

        <!-- Bottom Player Status Bar + Desktop Controls Legend -->
        <div class="hud-bottom">
          <div class="player-status-card" id="hud-player-status">
            <div class="ps-top">
              <span class="ps-dot" id="hud-player-dot"></span>
              <span class="ps-name" id="hud-player-name">Mbappé</span>
              <span class="ps-ovr" id="hud-player-ovr">91</span>
            </div>
            <div class="ps-bars">
              <div class="ps-bar-row">
                <span>SPRINT</span>
                <div class="ps-track"><div class="ps-fill stamina" id="hud-stamina-bar"></div></div>
              </div>
              <div class="ps-bar-row">
                <span id="hud-super-label">SUPER</span>
                <div class="ps-track"><div class="ps-fill super" id="hud-super-bar"></div></div>
              </div>
            </div>
          </div>

          <div class="controls-legend ${showTouch ? 'hidden' : ''}" id="hud-controls-legend">
            <span><kbd>WASD</kbd> / <kbd>Arrows</kbd> Move</span>
            <span><kbd>Space</kbd> / <kbd>J</kbd> Pass &amp; Switch</span>
            <span><kbd>K</kbd> / <kbd>Shift</kbd> Hold Shoot</span>
            <span><kbd>E</kbd> / <kbd>L</kbd> Sprint</span>
            <span><kbd>Q</kbd> Skill Move</span>
          </div>
        </div>

        <!-- Live Tactical Pitch Mini-Radar (Bottom Center, EA FC style!) -->
        <div class="hud-radar-wrap" aria-hidden="true">
          <canvas id="hud-radar-canvas" width="152" height="96"></canvas>
        </div>

        <!-- Touch Controls Overlay (Auto-shown on phones/tablets) -->
        <div class="touch-controls ${showTouch ? '' : 'hidden'}" id="hud-touch-layer">
          <div class="touch-joystick-zone" id="touch-joystick-zone">
            <div class="touch-joystick-base" id="touch-joystick-base">
              <span class="joy-tick up" aria-hidden="true"></span>
              <span class="joy-tick down" aria-hidden="true"></span>
              <span class="joy-tick left" aria-hidden="true"></span>
              <span class="joy-tick right" aria-hidden="true"></span>
              <div class="touch-joystick-knob" id="touch-joystick-knob"></div>
            </div>
          </div>
          <div class="touch-buttons-pad">
            <button class="touch-btn skill" data-action="skill" aria-label="Skill Move">
              <svg class="tb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 3l2.2 5.4L20 10.6l-4.5 3.7 1.4 5.7L12 17l-4.9 3 1.4-5.7L4 10.6l5.8-2.2z"/>
              </svg>
              <span class="tb-label">SKILL</span>
            </button>
            <button class="touch-btn shoot" data-action="shoot" aria-label="Shoot">
              <svg class="tb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8"/>
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
              </svg>
              <span class="tb-label">SHOOT</span>
            </button>
            <button class="touch-btn pass" data-action="pass" aria-label="Pass or Switch">
              <svg class="tb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 12h14"/>
                <path d="M13 6l6 6-6 6"/>
              </svg>
              <span class="tb-label">PASS</span>
            </button>
            <button class="touch-btn sprint" data-action="sprint" aria-label="Sprint">
              <svg class="tb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13 2L4 14h7l-1 8 10-12h-7l0-8z"/>
              </svg>
              <span class="tb-label">SPRINT</span>
            </button>
          </div>
        </div>

        <!-- Full-Time Summary & Rewards Modal -->
        <div class="fulltime-modal hidden" id="hud-fulltime-modal"></div>
      </div>
    `;

    this.radarCanvas = this.root.querySelector('#hud-radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
    this._skillPillTimer = null;
    this._bindEvents();
  }

  _bindEvents() {
    this.root.querySelector('#hud-fs-btn')?.addEventListener('click', () => {
      this.callbacks.onToggleFullscreen?.();
    });

    const muteBtn = this.root.querySelector('#hud-mute-btn');
    muteBtn?.addEventListener('click', () => {
      const isMuted = this.callbacks.onToggleMute();
      muteBtn.textContent = isMuted ? 'Muted' : 'Sound';
    });

    const touchBtn = this.root.querySelector('#hud-touch-toggle');
    touchBtn?.addEventListener('click', () => {
      this.forceTouchVisible = !this.forceTouchVisible;
      const show = this.isTouchDevice || this.forceTouchVisible;
      this.root.querySelector('#hud-touch-layer')?.classList.toggle('hidden', !show);
      this.root.querySelector('#hud-controls-legend')?.classList.toggle('hidden', show);
      touchBtn.textContent = show ? 'Touch: ON' : 'Touch';
    });

    this.root.querySelector('#hud-exit-btn')?.addEventListener('click', () => {
      this.callbacks.onExitMatch();
    });

    // Virtual Joystick pointer handling
    const joyZone = this.root.querySelector('#touch-joystick-zone');
    const joyKnob = this.root.querySelector('#touch-joystick-knob');
    if (joyZone && joyKnob) {
      let activeId = null;
      let originX = 0;
      let originY = 0;
      const maxR = 56;

      const updateStick = (clientX, clientY) => {
        const dx = clientX - originX;
        const dy = clientY - originY;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(maxR, dist);
        const angle = Math.atan2(dy, dx);
        const nx = dist > 4 ? (Math.cos(angle) * clamped) / maxR : 0;
        const ny = dist > 4 ? (Math.sin(angle) * clamped) / maxR : 0;
        this.touchState.mx = nx;
        this.touchState.mz = ny;
        joyKnob.style.transform = `translate(${nx * maxR}px, ${ny * maxR}px)`;
      };

      const resetStick = () => {
        activeId = null;
        this.touchState.mx = 0;
        this.touchState.mz = 0;
        joyKnob.style.transform = 'translate(0px, 0px)';
      };

      joyZone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        activeId = e.pointerId;
        joyZone.setPointerCapture(e.pointerId);
        const rect = joyZone.getBoundingClientRect();
        originX = rect.left + rect.width / 2;
        originY = rect.top + rect.height / 2;
        updateStick(e.clientX, e.clientY);
      });
      joyZone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== activeId) return;
        e.preventDefault();
        updateStick(e.clientX, e.clientY);
      });
      joyZone.addEventListener('pointerup', (e) => {
        if (e.pointerId === activeId) resetStick();
      });
      joyZone.addEventListener('pointercancel', resetStick);
    }

    // Touch Action Buttons (latch quick taps on pass/skill so rapid thumb taps never drop between frames!)
    this._tapLatch = { pass: false, skill: false };
    this.root.querySelectorAll('.touch-btn').forEach((btn) => {
      const action = btn.dataset.action;
      const press = (e) => {
        e.preventDefault();
        this.touchState[action] = true;
        if (action === 'pass' || action === 'skill') {
          this._tapLatch[action] = true;
        }
        btn.classList.add('pressed');
      };
      const release = (e) => {
        e.preventDefault();
        this.touchState[action] = false;
        btn.classList.remove('pressed');
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }

  getTouchInput() {
    const out = {
      ...this.touchState,
      pass: this.touchState.pass || Boolean(this._tapLatch?.pass),
      skill: this.touchState.skill || Boolean(this._tapLatch?.skill),
    };
    if (this._tapLatch) {
      this._tapLatch.pass = false;
      this._tapLatch.skill = false;
    }
    return out;
  }

  update(snapshot, localSlotId, rewardsData = null) {
    if (!snapshot) return;

    const homeScoreEl = this.root.querySelector('#hud-home-score');
    const awayScoreEl = this.root.querySelector('#hud-away-score');
    const clockEl = this.root.querySelector('#hud-clock');
    if (homeScoreEl) homeScoreEl.textContent = String(snapshot.score.home);
    if (awayScoreEl) awayScoreEl.textContent = String(snapshot.score.away);
    if (clockEl) clockEl.textContent = formatClock(snapshot.timeRemaining);

    // Kickoff indicator
    const kickoffEl = this.root.querySelector('#hud-kickoff-pill');
    if (kickoffEl) {
      kickoffEl.classList.toggle('hidden', snapshot.phase !== 'kickoff');
    }

    // Goal celebration banner
    const goalBanner = this.root.querySelector('#hud-goal-banner');
    if (goalBanner) {
      if (snapshot.phase === 'goal' && snapshot.lastGoal) {
        goalBanner.classList.remove('hidden');
        const g = snapshot.lastGoal;
        this.root.querySelector('#hud-goal-kicker').textContent = g.wasSuper ? 'SUPER GOAL!!' : 'GOAL!!';
        this.root.querySelector('#hud-goal-scorer').textContent = `${g.scorerName} #${g.scorerNumber}`;
        this.root.querySelector('#hud-goal-sub').textContent = g.humanName
          ? `${g.clubName} · Scored by ${g.humanName}`
          : g.clubName;
      } else {
        goalBanner.classList.add('hidden');
      }
    }

    // Controlled player status card (name, OVR, stamina, super meter)
    const localHuman = snapshot.humans.find((h) => h.slotId === localSlotId);
    const controlled = localHuman ? snapshot.players.find((p) => p.id === localHuman.playerId) : null;
    if (controlled) {
      const roster = controlled.team === 'home' ? this.meta.homeRoster : this.meta.awayRoster;
      const pMeta = roster[controlled.slotIndex];
      const dot = this.root.querySelector('#hud-player-dot');
      const nameEl = this.root.querySelector('#hud-player-name');
      const ovrEl = this.root.querySelector('#hud-player-ovr');
      const stamEl = this.root.querySelector('#hud-stamina-bar');
      const supEl = this.root.querySelector('#hud-super-bar');
      const supLabel = this.root.querySelector('#hud-super-label');

      if (dot && localHuman) dot.style.background = localHuman.color;
      if (nameEl && pMeta) nameEl.textContent = `${pMeta.name} #${pMeta.number}`;
      if (ovrEl && pMeta) ovrEl.textContent = `OVR ${pMeta.ovr}`;
      if (stamEl) stamEl.style.width = `${Math.round((controlled.stamina || 0) * 100)}%`;
      if (supEl) {
        supEl.style.width = `${Math.min(100, controlled.superMeter || 0)}%`;
        supEl.classList.toggle('ready', (controlled.superMeter || 0) >= 98);
      }
      if (supLabel) {
        supLabel.textContent = (controlled.superMeter || 0) >= 98 ? 'SUPER READY!' : 'SUPER';
        supLabel.classList.toggle('ready', (controlled.superMeter || 0) >= 98);
      }
    }

    // Draw live tactical pitch mini-radar
    this._drawRadar(snapshot, localSlotId);

    // Full-time modal (rendered once when match ends)
    if (snapshot.phase === 'fulltime' && !this.fulltimeShown && rewardsData) {
      this.fulltimeShown = true;
      this._renderFulltimeModal(snapshot, rewardsData);
    }
  }

  _drawRadar(snapshot, localSlotId) {
    const ctx = this.radarCtx;
    if (!ctx || !this.radarCanvas) return;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;
    const pad = 6;
    const pw = w - pad * 2;
    const ph = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    // Pitch lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pad, pad, pw, ph);
    ctx.beginPath();
    ctx.moveTo(w / 2, pad);
    ctx.lineTo(w / 2, h - pad);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 13, 0, Math.PI * 2);
    ctx.stroke();
    // Penalty boxes
    ctx.strokeRect(pad, h / 2 - 20, 18, 40);
    ctx.strokeRect(w - pad - 18, h / 2 - 20, 18, 40);

    const toX = (x) => pad + ((x + PITCH.halfLength) / PITCH.length) * pw;
    const toY = (z) => pad + ((z + PITCH.halfWidth) / PITCH.width) * ph;

    // Players
    for (const p of snapshot.players) {
      const px = toX(p.x);
      const py = toY(p.z);
      const isControlled = p.humanSlotId === localSlotId;
      ctx.beginPath();
      ctx.arc(px, py, isControlled ? 4.4 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = p.team === 'home' ? '#38BDF8' : '#F87171';
      ctx.fill();
      if (isControlled) {
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // Ball dot
    const bx = toX(snapshot.ball.x);
    const by = toY(snapshot.ball.z);
    ctx.beginPath();
    ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#0B1218';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _renderFulltimeModal(snapshot, rewards) {
    const modal = this.root.querySelector('#hud-fulltime-modal');
    if (!modal) return;

    const resultHeadline =
      rewards.outcome === 'win'
        ? 'VICTORY!'
        : rewards.outcome === 'draw'
          ? 'GREAT DRAW!'
          : 'GREAT EFFORT!';

    modal.classList.remove('hidden');
    modal.innerHTML = `
      <div class="fulltime-card">
        <div class="ft-badge">${resultHeadline}</div>
        <div class="ft-scoreboard">
          <div class="ft-club">
            ${renderClubBadgeSVG(this.homeClub, 56)}
            <span>${this.homeClub.name}</span>
          </div>
          <div class="ft-score">${snapshot.score.home} - ${snapshot.score.away}</div>
          <div class="ft-club">
            ${renderClubBadgeSVG(this.awayClub, 56)}
            <span>${this.awayClub.name}</span>
          </div>
        </div>

        <div class="ft-rewards">
          <h3>Match Coins Earned</h3>
          <div class="ft-reward-rows">
            <div class="ft-row"><span>Match Played Bonus</span><strong>+${rewards.participation}</strong></div>
            <div class="ft-row"><span>Goals Scored (${rewards.teamGoals})</span><strong>+${rewards.goalCoins}</strong></div>
            ${rewards.winCoins > 0 ? `<div class="ft-row"><span>Win Trophy Bonus</span><strong>+${rewards.winCoins}</strong></div>` : ''}
            ${rewards.cleanSheetCoins > 0 ? `<div class="ft-row"><span>Clean Sheet Bonus</span><strong>+${rewards.cleanSheetCoins}</strong></div>` : ''}
            <div class="ft-row total"><span>Total Earned</span><strong>+${rewards.total} Coins</strong></div>
          </div>
          <div class="ft-bank">Your Coin Bank: <strong>${rewards.newBalance} Coins</strong></div>
        </div>

        <div class="ft-actions">
          ${
            !this.isMultiplayer || this.isHost
              ? `<button class="btn-primary" id="ft-rematch-btn">Play Again</button>`
              : `<div class="ft-waiting">Waiting for host to start rematch...</div>`
          }
          <button class="btn-gold" id="ft-shop-btn">Unlock Players &amp; Stadiums</button>
          <button class="btn-secondary" id="ft-menu-btn">Main Menu</button>
        </div>
      </div>
    `;

    modal.querySelector('#ft-rematch-btn')?.addEventListener('click', () => {
      this.callbacks.onRematch();
    });
    modal.querySelector('#ft-shop-btn')?.addEventListener('click', () => {
      this.callbacks.onOpenShop();
    });
    modal.querySelector('#ft-menu-btn')?.addEventListener('click', () => {
      this.callbacks.onExitMatch();
    });
  }

  showSkillCallout(label, color = '#38BDF8') {
    const pill = this.root.querySelector('#hud-skill-pill');
    if (!pill || !label) return;
    pill.textContent = `${label}!`;
    pill.style.borderColor = color;
    pill.style.color = color;
    pill.classList.remove('hidden');
    pill.classList.remove('pop');
    // Force reflow so rapid consecutive tricks replay the crisp pop animation
    void pill.offsetWidth;
    pill.classList.add('pop');
    if (this._skillPillTimer) clearTimeout(this._skillPillTimer);
    this._skillPillTimer = setTimeout(() => {
      pill.classList.add('hidden');
      pill.classList.remove('pop');
    }, 950);
  }

  unmount() {
    if (this._skillPillTimer) clearTimeout(this._skillPillTimer);
    this.root.innerHTML = '';
  }
}
