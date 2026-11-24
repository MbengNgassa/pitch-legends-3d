import './style.css';
import { MatchEngine, DIFFICULTIES } from '../shared/MatchEngine.js';
import { UNLOCKABLE_PLAYERS } from '../shared/teamsData.js';
import { STADIUMS } from '../shared/stadiumsData.js';
import { Renderer3D } from './game/Renderer3D.js';
import { soundEngine } from './audio/SoundEngine.js';
import { HudOverlay } from './ui/HudOverlay.js';
import {
  renderHomeScreen,
  renderMatchSetupScreen,
  renderShopScreen,
  renderMultiplayerEntry,
  renderMultiplayerLobby,
} from './ui/Menus.js';

const STORAGE_KEY = 'pitch_legends_3d_profile_v1';

function loadProfile() {
  const defaults = {
    coins: 180,
    unlockedPlayers: [],
    unlockedStadiums: STADIUMS.filter((s) => s.unlocked).map((s) => s.id),
    activeDraft: [],
    playerName: 'Player 1',
    matchesPlayed: 0,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      unlockedStadiums: Array.from(new Set([...defaults.unlockedStadiums, ...(parsed.unlockedStadiums || [])])),
      unlockedPlayers: Array.isArray(parsed.unlockedPlayers) ? parsed.unlockedPlayers : [],
      activeDraft: Array.isArray(parsed.activeDraft) ? parsed.activeDraft : [],
    };
  } catch {
    return defaults;
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

class PitchLegendsApp {
  constructor() {
    this.profile = loadProfile();
    this.screen = 'home'; // 'home' | 'setup' | 'shop' | 'mp-entry' | 'mp-lobby' | 'match'
    this.setupStep = 1; // 1: Your Club, 2: Opponent, 3: Stadium & Rules
    this.shopTab = 'players';
    this.previewStadiumId = 'bernabeu';

    this.setup = {
      homeClubId: 'real-madrid',
      awayClubId: 'man-city',
      stadiumId: 'sunlit-park',
      difficulty: 'rookie',
      durationSeconds: 120,
    };

    // Match & Multiplayer state
    this.isMultiplayer = false;
    this.soloEngine = null;
    this.mpSocket = null;
    this.mpLobby = null;
    this.mpSlotId = 'p1';
    this.mpError = '';
    this.mpNetworkInfo = null;
    this.mpQrCache = {};
    this.latestSnapshot = null;
    this.matchMeta = null;
    this.rewardsAwarded = false;
    this.lastRewards = null;

    // Input state
    this.keys = new Set();
    this.lastInputSentAt = 0;

    // Mount DOM containers
    this.canvasRoot = document.getElementById('canvas-root');
    this.uiRoot = document.getElementById('ui-root');
    this.hudRoot = document.getElementById('hud-root');

    this.hud = new HudOverlay(this.hudRoot, {
      onToggleMute: () => {
        const next = !soundEngine.muted;
        soundEngine.setMuted(next);
        return next;
      },
      onToggleFullscreen: () => this.toggleLandscapeFullscreen(),
      onExitMatch: () => this.exitMatch('home'),
      onRematch: () => this.handleRematch(),
      onOpenShop: () => this.exitMatch('shop'),
    });

    document.getElementById('rotate-lock-btn')?.addEventListener('click', () => {
      this.requestLandscapeLock();
    });

    this._bindKeyboard();
    this._fetchNetworkInfo();

    // Check URL query `?room=XXXX` from QR code scan!
    const params = new URLSearchParams(window.location.search);
    const roomParam = (params.get('room') || '').trim().toUpperCase();
    if (roomParam && roomParam.length === 4) {
      this.prefillRoomCode = roomParam;
      this.screen = 'mp-entry';
    } else {
      this.prefillRoomCode = '';
    }

    // Render UI first so the user NEVER sees a blank screen while 3D initializes
    this.renderUI();

    try {
      this.renderer = new Renderer3D(this.canvasRoot);
    } catch (err) {
      console.warn('[App] Renderer3D init failed:', err);
      this.renderer = { loadShowcase() {}, loadMatch() {}, handleMatchEvents() {}, render() {} };
    }

    this._startLoop();
  }

  _fetchNetworkInfo() {
    if (
      !window.location.host ||
      !window.location.protocol.startsWith('http') ||
      window.location.hostname.endsWith('github.io')
    ) {
      return;
    }
    fetch('/api/network-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info) {
          this.mpNetworkInfo = info;
          if (this.screen === 'mp-lobby') this.renderUI();
        }
      })
      .catch(() => {});
  }

  async _ensureLobbyQr(code) {
    if (this.mpQrCache[code]) return this.mpQrCache[code];
    const base = this.mpNetworkInfo?.joinBaseUrl || window.location.origin;
    const url = `${base}?room=${code}`;
    try {
      const res = await fetch(`/api/qr?text=${encodeURIComponent(url)}`);
      const json = await res.json();
      if (json.dataUrl) {
        this.mpQrCache[code] = json.dataUrl;
        if (this.screen === 'mp-lobby') this.renderUI();
      }
    } catch {
      // Ignore QR error
    }
    return this.mpQrCache[code] || null;
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.screen === 'match') {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
          e.preventDefault();
        }
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  _collectLocalInput() {
    const touch = this.hud.getTouchInput();
    let mx = touch.mx;
    let mz = touch.mz;

    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz += 1;

    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    return {
      mx: Number(mx.toFixed(2)),
      mz: Number(mz.toFixed(2)),
      pass: touch.pass || this.keys.has('Space') || this.keys.has('KeyJ'),
      shoot: touch.shoot || this.keys.has('KeyK') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('Enter'),
      sprint: touch.sprint || this.keys.has('KeyE') || this.keys.has('KeyL'),
      skill: touch.skill || this.keys.has('KeyQ') || this.keys.has('KeyI'),
    };
  }

  _ensureSocket() {
    if (this.mpSocket && (this.mpSocket.readyState === WebSocket.OPEN || this.mpSocket.readyState === WebSocket.CONNECTING)) {
      return this.mpSocket;
    }
    const isStandalone = !window.location.host || window.location.protocol === 'file:' || window.location.protocol === 'about:' || window.location.protocol === 'data:';
    if (isStandalone) {
      this.mpError = '3-Device Wi-Fi Multiplayer needs a home computer running the local server. Tap Back → Play Match to play right now on your phone!';
      this.renderUI();
      return null;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    this.mpSocket = ws;

    ws.onerror = () => {
      this.mpError = 'No Wi-Fi game server detected yet. Tap Back → Play Match to play solo on your phone!';
      this.renderUI();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._handleServerMessage(msg);
      } catch {
        // Ignore bad packet
      }
    };

    ws.onclose = () => {
      if (this.screen === 'mp-lobby' || (this.screen === 'match' && this.isMultiplayer)) {
        this.mpError = 'Disconnected from local server. Reconnect to join again.';
        this.mpLobby = null;
        this.isMultiplayer = false;
        this.hud.unmount();
        this.screen = 'mp-entry';
        this.renderer.loadShowcase(this.previewStadiumId);
        this.renderUI();
      }
    };

    return ws;
  }

  _sendWs(payload) {
    const ws = this._ensureSocket();
    if (!ws) return;
    const raw = JSON.stringify(payload);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    } else {
      ws.addEventListener('open', () => ws.send(raw), { once: true });
    }
  }

  _handleServerMessage(msg) {
    if (msg.type === 'error') {
      this.mpError = msg.message || 'Could not join room.';
      this.renderUI();
      return;
    }

    if (msg.type === 'room_joined') {
      this.mpError = '';
      this.mpSlotId = msg.slotId;
      this.mpLobby = msg.lobby;
      this.screen = 'mp-lobby';
      this.renderer.loadShowcase(this.mpLobby.config.stadiumId, this.mpLobby.config.homeClubId, this.mpLobby.config.awayClubId);
      this._ensureLobbyQr(this.mpLobby.code);
      this.renderUI();
      return;
    }

    if (msg.type === 'lobby_update') {
      this.mpLobby = msg.lobby;
      if (this.screen === 'mp-lobby') {
        this.renderer.loadShowcase(this.mpLobby.config.stadiumId, this.mpLobby.config.homeClubId, this.mpLobby.config.awayClubId);
        this.renderUI();
      }
      return;
    }

    if (msg.type === 'match_started') {
      this.mpLobby = msg.lobby;
      this.isMultiplayer = true;
      this.soloEngine = null;
      this.matchMeta = msg.meta;
      this.latestSnapshot = msg.snapshot;
      this.rewardsAwarded = false;
      this.lastRewards = null;
      this.screen = 'match';
      this.uiRoot.innerHTML = '';

      this.renderer.loadMatch(this.matchMeta, this.latestSnapshot, this.mpSlotId);
      this.hud.mount(this.matchMeta, true, this.mpLobby.hostSlotId === this.mpSlotId);
      soundEngine.playWhistle('kickoff');
      return;
    }

    if (msg.type === 'state') {
      this.latestSnapshot = msg.snapshot;
      this._processMatchEvents(msg.events || []);
      if (this.latestSnapshot.phase === 'fulltime' && !this.rewardsAwarded) {
        this._awardMatchCoins(this.latestSnapshot);
      }
      return;
    }

    if (msg.type === 'returned_to_lobby') {
      this.mpLobby = msg.lobby;
      this.hud.unmount();
      this.screen = 'mp-lobby';
      this.renderer.loadShowcase(this.mpLobby.config.stadiumId);
      this.renderUI();
    }
  }

  _processMatchEvents(events) {
    if (!events || events.length === 0) return;
    this.renderer.handleMatchEvents(events);
    for (const ev of events) {
      if (ev.type === 'kick') soundEngine.playKick(ev.power || 0.7);
      else if (ev.type === 'supershot') soundEngine.playSuperShot();
      else if (ev.type === 'pass') soundEngine.playPass();
      else if (ev.type === 'tackle') soundEngine.playTackle();
      else if (ev.type === 'skill') soundEngine.playSkill();
      else if (ev.type === 'post') soundEngine.playPost();
      else if (ev.type === 'save') soundEngine.playSave();
      else if (ev.type === 'whistle') soundEngine.playWhistle(ev.kind);
      else if (ev.type === 'goal') soundEngine.playGoal();
    }
  }

  _awardMatchCoins(snapshot) {
    this.rewardsAwarded = true;
    const myHuman = snapshot.humans.find((h) => h.slotId === (this.isMultiplayer ? this.mpSlotId : 'p1'));
    const myTeam = myHuman ? myHuman.team : 'home';
    const oppTeam = myTeam === 'home' ? 'away' : 'home';

    const myScore = snapshot.score[myTeam];
    const oppScore = snapshot.score[oppTeam];
    const diff = DIFFICULTIES[this.matchMeta?.difficulty || 'rookie'] || DIFFICULTIES.rookie;

    const outcome = myScore > oppScore ? 'win' : myScore === oppScore ? 'draw' : 'loss';
    const participation = 80;
    const goalCoins = myScore * 35;
    const winCoins = outcome === 'win' ? 140 : outcome === 'draw' ? 60 : 0;
    const cleanSheetCoins = oppScore === 0 ? 75 : 0;
    const total = Math.round((participation + goalCoins + winCoins + cleanSheetCoins) * diff.coinBonus);

    this.profile.coins += total;
    this.profile.matchesPlayed += 1;
    saveProfile(this.profile);

    this.lastRewards = {
      outcome,
      teamGoals: myScore,
      participation,
      goalCoins,
      winCoins,
      cleanSheetCoins,
      total,
      newBalance: this.profile.coins,
    };
  }

  async requestLandscapeLock() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen rejection on browsers that don't support it
    }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {
      // Ignore orientation lock if unsupported (e.g. iOS Safari)
    }
  }

  async toggleLandscapeFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      } else {
        await this.requestLandscapeLock();
      }
    } catch {
      // Ignore
    }
  }

  startSoloMatch() {
    soundEngine.unlock();
    soundEngine.playClick();
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.requestLandscapeLock();
    }
    this.isMultiplayer = false;
    this.mpSlotId = 'p1';
    this.rewardsAwarded = false;
    this.lastRewards = null;

    this.soloEngine = new MatchEngine({
      homeClubId: this.setup.homeClubId,
      awayClubId: this.setup.awayClubId,
      stadiumId: this.setup.stadiumId,
      difficulty: this.setup.difficulty,
      durationSeconds: this.setup.durationSeconds,
      homeDraft: this.profile.activeDraft,
      humans: [{ slotId: 'p1', name: this.profile.playerName || 'You', team: 'home', color: '#38BDF8' }],
    });

    this.matchMeta = this.soloEngine.getMeta();
    this.latestSnapshot = this.soloEngine.getSnapshot();
    this.screen = 'match';
    this.uiRoot.innerHTML = '';

    this.renderer.loadMatch(this.matchMeta, this.latestSnapshot, 'p1');
    this.hud.mount(this.matchMeta, false, true);
  }

  handleRematch() {
    soundEngine.playClick();
    if (this.isMultiplayer) {
      this._sendWs({ type: 'rematch' });
    } else {
      this.startSoloMatch();
    }
  }

  exitMatch(targetScreen = 'home') {
    soundEngine.playClick();
    this.hud.unmount();
    this.soloEngine = null;
    this.latestSnapshot = null;

    if (this.isMultiplayer) {
      this._sendWs({ type: 'leave_room' });
      this.isMultiplayer = false;
      this.mpLobby = null;
    }

    this.screen = targetScreen;
    this.renderer.loadShowcase(this.setup.stadiumId || 'bernabeu', this.setup.homeClubId, this.setup.awayClubId);
    this.renderUI();
  }

  renderUI() {
    if (this.screen === 'match') {
      this.uiRoot.innerHTML = '';
      return;
    }

    if (this.screen === 'home') {
      this.uiRoot.innerHTML = renderHomeScreen(this.profile);
      this.uiRoot.querySelector('#home-play-solo')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        this.setupStep = 1;
        this.screen = 'setup';
        this.renderer.loadShowcase(this.setup.stadiumId, this.setup.homeClubId, this.setup.awayClubId);
        this.renderUI();
      });
      this.uiRoot.querySelector('#home-play-multi')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        this.mpError = '';
        this.screen = 'mp-entry';
        this.renderUI();
      });
      this.uiRoot.querySelector('#home-open-shop')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        this.screen = 'shop';
        this.renderUI();
      });
      return;
    }

    if (this.screen === 'setup') {
      this.uiRoot.innerHTML = renderMatchSetupScreen(this.profile, this.setup, this.setupStep);
      this.uiRoot.querySelector('#menu-back-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        if (this.setupStep > 1) {
          this.setupStep -= 1;
          this.renderUI();
        } else {
          this.screen = 'home';
          this.renderUI();
        }
      });
      this.uiRoot.querySelectorAll('[data-goto-step]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this.setupStep = Number(btn.dataset.gotoStep) || 1;
          this.renderUI();
        });
      });
      this.uiRoot.querySelector('#wizard-prev-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.setupStep = Math.max(1, this.setupStep - 1);
        this.renderUI();
      });
      this.uiRoot.querySelector('#wizard-next-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.setupStep = Math.min(3, this.setupStep + 1);
        this.renderUI();
      });
      this.uiRoot.querySelectorAll('[data-pick-club]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          const side = btn.dataset.pickClub;
          const clubId = btn.dataset.clubId;
          if (side === 'home') this.setup.homeClubId = clubId;
          else this.setup.awayClubId = clubId;
          this.renderer.loadShowcase(this.setup.stadiumId, this.setup.homeClubId, this.setup.awayClubId);
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-pick-stadium]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          const stId = btn.dataset.pickStadium;
          this.renderer.loadShowcase(stId, this.setup.homeClubId, this.setup.awayClubId);
          if (btn.dataset.locked === 'true') {
            this.shopTab = 'stadiums';
            this.previewStadiumId = stId;
            this.screen = 'shop';
            this.renderUI();
            return;
          }
          this.setup.stadiumId = stId;
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-pick-diff]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this.setup.difficulty = btn.dataset.pickDiff;
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-pick-duration]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this.setup.durationSeconds = Number(btn.dataset.pickDuration);
          this.renderUI();
        });
      });
      this.uiRoot.querySelector('#setup-kickoff-btn')?.addEventListener('click', () => {
        this.startSoloMatch();
      });
      return;
    }

    if (this.screen === 'shop') {
      this.uiRoot.innerHTML = renderShopScreen(this.profile, this.shopTab, this.previewStadiumId);
      this.uiRoot.querySelector('#menu-back-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.screen = 'home';
        this.renderUI();
      });
      this.uiRoot.querySelectorAll('[data-shop-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this.shopTab = btn.dataset.shopTab;
          this.renderUI();
        });
      });
      this.uiRoot.querySelector('#shop-clear-draft')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.profile.activeDraft = [];
        saveProfile(this.profile);
        this.renderUI();
      });
      this.uiRoot.querySelectorAll('[data-unlock-player]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pId = btn.dataset.unlockPlayer;
          const player = UNLOCKABLE_PLAYERS.find((p) => p.id === pId);
          if (!player || this.profile.coins < player.cost) return;
          if (this.profile.unlockedPlayers.includes(pId)) return;
          this.profile.coins -= player.cost;
          this.profile.unlockedPlayers.push(pId);
          // Automatically add to active squad if there is space!
          if (this.profile.activeDraft.length < 4) {
            this.profile.activeDraft.push(pId);
          }
          saveProfile(this.profile);
          soundEngine.playCoinUnlock();
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-toggle-draft]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          const pId = btn.dataset.toggleDraft;
          if (this.profile.activeDraft.includes(pId)) {
            this.profile.activeDraft = this.profile.activeDraft.filter((id) => id !== pId);
          } else {
            if (this.profile.activeDraft.length >= 4) {
              this.profile.activeDraft.shift();
            }
            this.profile.activeDraft.push(pId);
          }
          saveProfile(this.profile);
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-preview-stadium]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-unlock-stadium]')) return;
          const stId = el.dataset.previewStadium;
          this.previewStadiumId = stId;
          this.renderer.loadShowcase(stId, this.setup.homeClubId, this.setup.awayClubId);
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-unlock-stadium]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const stId = btn.dataset.unlockStadium;
          const stadium = STADIUMS.find((s) => s.id === stId);
          if (!stadium || this.profile.coins < stadium.cost) return;
          if (this.profile.unlockedStadiums.includes(stId)) return;
          this.profile.coins -= stadium.cost;
          this.profile.unlockedStadiums.push(stId);
          this.setup.stadiumId = stId;
          this.previewStadiumId = stId;
          saveProfile(this.profile);
          soundEngine.playCoinUnlock();
          this.renderer.loadShowcase(stId, this.setup.homeClubId, this.setup.awayClubId);
          this.renderUI();
        });
      });
      return;
    }

    if (this.screen === 'mp-entry') {
      this.uiRoot.innerHTML = renderMultiplayerEntry(
        this.profile,
        this.profile.playerName,
        this.prefillRoomCode,
        this.mpError
      );
      this.uiRoot.querySelector('#menu-back-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.screen = 'home';
        this.renderUI();
      });
      const getName = () => {
        const val = (this.uiRoot.querySelector('#mp-player-name')?.value || 'Player 1').trim().slice(0, 14);
        this.profile.playerName = val || 'Player 1';
        saveProfile(this.profile);
        return this.profile.playerName;
      };
      this.uiRoot.querySelector('#mp-create-btn')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        const name = getName();
        this._sendWs({
          type: 'create_room',
          name,
          config: {
            ...this.setup,
            homeDraft: this.profile.activeDraft,
          },
        });
      });
      this.uiRoot.querySelector('#mp-join-btn')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        const name = getName();
        const code = (this.uiRoot.querySelector('#mp-room-code-input')?.value || '').trim().toUpperCase();
        if (!code) {
          this.mpError = 'Please type the 4-letter Room Code!';
          this.renderUI();
          return;
        }
        this._sendWs({ type: 'join_room', name, code });
      });
      return;
    }

    if (this.screen === 'mp-lobby' && this.mpLobby) {
      const qr = this.mpQrCache[this.mpLobby.code] || null;
      this.uiRoot.innerHTML = renderMultiplayerLobby(
        this.profile,
        this.mpLobby,
        this.mpSlotId,
        this.mpNetworkInfo,
        qr
      );
      this.uiRoot.querySelector('#menu-back-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this._sendWs({ type: 'leave_room' });
        this.mpLobby = null;
        this.screen = 'home';
        this.renderUI();
      });
      this.uiRoot.querySelectorAll('[data-mp-team]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this._sendWs({ type: 'update_member', team: btn.dataset.mpTeam });
        });
      });
      const syncHostConfig = () => {
        const homeClubId = this.uiRoot.querySelector('#mp-home-club')?.value;
        const awayClubId = this.uiRoot.querySelector('#mp-away-club')?.value;
        const stadiumId = this.uiRoot.querySelector('#mp-stadium')?.value;
        const difficulty = this.uiRoot.querySelector('#mp-difficulty')?.value;
        const durationSeconds = Number(this.uiRoot.querySelector('#mp-duration')?.value || 120);
        this._sendWs({
          type: 'update_config',
          config: { homeClubId, awayClubId, stadiumId, difficulty, durationSeconds, homeDraft: this.profile.activeDraft },
        });
      };
      ['#mp-home-club', '#mp-away-club', '#mp-stadium', '#mp-difficulty', '#mp-duration'].forEach((sel) => {
        this.uiRoot.querySelector(sel)?.addEventListener('change', syncHostConfig);
      });
      this.uiRoot.querySelector('#mp-start-match-btn')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        this._sendWs({ type: 'start_match' });
      });
    }
  }

  _startLoop() {
    let lastTime = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      if (this.screen === 'match') {
        const input = this._collectLocalInput();

        if (!this.isMultiplayer && this.soloEngine) {
          this.soloEngine.setHumanInput('p1', input);
          this.soloEngine.step(dt);
          const events = this.soloEngine.consumeEvents();
          this.latestSnapshot = this.soloEngine.getSnapshot();
          this._processMatchEvents(events);
          if (this.latestSnapshot.phase === 'fulltime' && !this.rewardsAwarded) {
            this._awardMatchCoins(this.latestSnapshot);
          }
        } else if (this.isMultiplayer && now - this.lastInputSentAt > 30) {
          this.lastInputSentAt = now;
          this._sendWs({ type: 'input', input });
        }

        this.renderer.render(dt, this.latestSnapshot);
        this.hud.update(this.latestSnapshot, this.isMultiplayer ? this.mpSlotId : 'p1', this.lastRewards);
      } else {
        this.renderer.render(dt, null);
      }

      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function bootApp() {
  if (window.__pitchLegendsBooted) return;
  window.__pitchLegendsBooted = true;
  new PitchLegendsApp();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
