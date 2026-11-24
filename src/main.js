import './style.css';
import { MatchEngine, DIFFICULTIES } from '../shared/MatchEngine.js';
import { UNLOCKABLE_PLAYERS } from '../shared/teamsData.js';
import { STADIUMS } from '../shared/stadiumsData.js';
import { Renderer3D } from './game/Renderer3D.js';
import { soundEngine } from './audio/SoundEngine.js';
import { HudOverlay } from './ui/HudOverlay.js';
import {
  loadHouseholdStore,
  saveHouseholdStore,
  createNewProfile,
  buildCustomClubFromProfile,
  autoPickBestRosterIds,
  makeShortName,
} from './state/ProfileStore.js';
import {
  renderHomeScreen,
  renderProfilesScreen,
  renderMatchSetupScreen,
  renderShopScreen,
  renderMultiplayerEntry,
  renderMultiplayerLobby,
} from './ui/Menus.js';

class PitchLegendsApp {
  constructor() {
    this.store = loadHouseholdStore();
    this.screen = 'home'; // 'home' | 'profiles' | 'setup' | 'shop' | 'mp-entry' | 'mp-lobby' | 'match'
    this.setupStep = 1; // 1: Your Team, 2: Opponent, 3: Stadium & Rules
    this.activeRegion = 'house';
    this.shopTab = 'myteam';
    this.builderSlot = 4; // Striker selected by default
    this.previewStadiumId = 'olembe';
    this.deferredInstallPrompt = null;
    this.showInstallModal = false;
    this.isInstalled =
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (this.screen === 'home') this.renderUI();
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.isInstalled = true;
      this.showInstallModal = false;
      if (this.screen === 'home') this.renderUI();
    });

    this.setup = {
      homeClubId: `custom_${this.profile.id}`,
      awayClubId: 'cameroon',
      stadiumId: 'olembe',
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

  get profile() {
    return this.store.profiles.find((p) => p.id === this.store.activeProfileId) || this.store.profiles[0];
  }

  _save() {
    saveHouseholdStore(this.store);
  }

  _getHouseClubs() {
    return this.store.profiles.map((p) => buildCustomClubFromProfile(p));
  }

  _resolveClubData(clubId) {
    if (String(clubId || '').startsWith('custom_')) {
      return this._getHouseClubs().find((c) => c.id === clubId) || null;
    }
    return null;
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
    this.profile.matchesPlayed = (this.profile.matchesPlayed || 0) + 1;
    this.profile.goals = (this.profile.goals || 0) + myScore;
    if (outcome === 'win') this.profile.wins = (this.profile.wins || 0) + 1;
    this._save();

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

    const homeClubData = this._resolveClubData(this.setup.homeClubId);
    const awayClubData = this._resolveClubData(this.setup.awayClubId);

    this.soloEngine = new MatchEngine({
      homeClubId: this.setup.homeClubId,
      awayClubId: this.setup.awayClubId,
      homeClubData,
      awayClubData,
      stadiumId: this.setup.stadiumId,
      difficulty: this.setup.difficulty,
      durationSeconds: this.setup.durationSeconds,
      homeDraft: homeClubData ? [] : this.profile.activeDraft,
      humans: [
        {
          slotId: 'p1',
          name: this.profile.username || 'Player 1',
          team: 'home',
          color: this.profile.avatarColor || '#38BDF8',
        },
      ],
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
    this.renderer.loadShowcase(
      this.setup.stadiumId || 'olembe',
      this._resolveClubData(this.setup.homeClubId) || this.setup.homeClubId,
      this._resolveClubData(this.setup.awayClubId) || this.setup.awayClubId
    );
    this.renderUI();
  }

  _bindProfileChip() {
    this.uiRoot.querySelector('#open-profiles-btn')?.addEventListener('click', () => {
      soundEngine.unlock();
      soundEngine.playClick();
      this.screen = 'profiles';
      this.renderUI();
    });
  }

  renderUI() {
    if (this.screen === 'match') {
      this.uiRoot.innerHTML = '';
      return;
    }

    const houseClubs = this._getHouseClubs();

    if (this.screen === 'home') {
      this.uiRoot.innerHTML = renderHomeScreen(
        this.profile,
        {
          showModal: this.showInstallModal,
          canNativeInstall: Boolean(this.deferredInstallPrompt),
          isInstalled: this.isInstalled,
        },
        this.store.profiles.length
      );
      this._bindProfileChip();
      this.uiRoot.querySelector('#home-install-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.showInstallModal = true;
        this.renderUI();
      });
      this.uiRoot.querySelector('#install-modal-close')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.showInstallModal = false;
        this.renderUI();
      });
      this.uiRoot.querySelector('#install-modal-backdrop')?.addEventListener('click', (e) => {
        if (e.target.id === 'install-modal-backdrop') {
          this.showInstallModal = false;
          this.renderUI();
        }
      });
      this.uiRoot.querySelector('#install-native-trigger')?.addEventListener('click', async () => {
        if (!this.deferredInstallPrompt) return;
        this.deferredInstallPrompt.prompt();
        try {
          await this.deferredInstallPrompt.userChoice;
        } catch {
          // Ignore prompt cancel
        }
        this.deferredInstallPrompt = null;
        this.showInstallModal = false;
        this.renderUI();
      });
      this.uiRoot.querySelector('#home-play-solo')?.addEventListener('click', () => {
        soundEngine.unlock();
        soundEngine.playClick();
        this.setupStep = 1;
        this.screen = 'setup';
        this.renderer.loadShowcase(
          this.setup.stadiumId,
          this._resolveClubData(this.setup.homeClubId) || this.setup.homeClubId,
          this._resolveClubData(this.setup.awayClubId) || this.setup.awayClubId
        );
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

    if (this.screen === 'profiles') {
      this.uiRoot.innerHTML = renderProfilesScreen(this.store, this.profile);
      this.uiRoot.querySelector('#menu-back-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.screen = 'home';
        this.renderUI();
      });
      this.uiRoot.querySelectorAll('[data-select-profile]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-delete-profile]')) return;
          soundEngine.playClick();
          const pid = el.dataset.selectProfile;
          this.store.activeProfileId = pid;
          this.setup.homeClubId = `custom_${pid}`;
          this._save();
          this.screen = 'home';
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-delete-profile]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.store.profiles.length <= 1) return;
          soundEngine.playClick();
          const pid = btn.dataset.deleteProfile;
          this.store.profiles = this.store.profiles.filter((p) => p.id !== pid);
          if (this.store.activeProfileId === pid) {
            this.store.activeProfileId = this.store.profiles[0].id;
            this.setup.homeClubId = `custom_${this.store.activeProfileId}`;
          }
          this._save();
          this.renderUI();
        });
      });
      this.uiRoot.querySelector('#add-profile-btn')?.addEventListener('click', () => {
        const input = this.uiRoot.querySelector('#new-profile-name');
        const name = (input?.value || '').trim().slice(0, 14);
        if (!name) {
          input?.focus();
          return;
        }
        const created = createNewProfile(name, this.store.profiles.length);
        this.store.profiles.push(created);
        this.store.activeProfileId = created.id;
        this.setup.homeClubId = `custom_${created.id}`;
        this._save();
        soundEngine.playCoinUnlock();
        this.renderUI();
      });
      this.uiRoot.querySelector('#rename-profile-btn')?.addEventListener('click', () => {
        const input = this.uiRoot.querySelector('#rename-profile-input');
        const newName = (input?.value || '').trim().slice(0, 14);
        if (!newName) return;
        this.profile.username = newName;
        this._save();
        soundEngine.playClick();
        this.renderUI();
      });
      return;
    }

    if (this.screen === 'setup') {
      this.uiRoot.innerHTML = renderMatchSetupScreen(
        this.profile,
        this.setup,
        this.setupStep,
        this.activeRegion,
        houseClubs
      );
      this._bindProfileChip();
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
      this.uiRoot.querySelectorAll('[data-pick-region]').forEach((el) => {
        el.addEventListener('click', () => {
          soundEngine.playClick();
          this.activeRegion = el.dataset.pickRegion || 'africa';
          this.renderUI();
        });
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
          this.renderer.loadShowcase(
            this.setup.stadiumId,
            this._resolveClubData(this.setup.homeClubId) || this.setup.homeClubId,
            this._resolveClubData(this.setup.awayClubId) || this.setup.awayClubId
          );
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-pick-stadium]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          const stId = btn.dataset.pickStadium;
          this.renderer.loadShowcase(
            stId,
            this._resolveClubData(this.setup.homeClubId) || this.setup.homeClubId,
            this._resolveClubData(this.setup.awayClubId) || this.setup.awayClubId
          );
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
      this.uiRoot.innerHTML = renderShopScreen(
        this.profile,
        this.shopTab,
        this.previewStadiumId,
        this.builderSlot
      );
      this._bindProfileChip();
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

      // Custom Dream Team Builder handlers
      const nameInput = this.uiRoot.querySelector('#custom-team-name-input');
      nameInput?.addEventListener('change', () => {
        const val = nameInput.value.trim().slice(0, 18);
        if (!val) return;
        this.profile.customTeam.name = val;
        this.profile.customTeam.shortName = makeShortName(val);
        this._save();
        this.renderUI();
      });
      this.uiRoot.querySelector('#builder-autopick-btn')?.addEventListener('click', () => {
        soundEngine.playCoinUnlock();
        this.profile.customTeam.rosterIds = autoPickBestRosterIds(this.profile);
        this._save();
        this.renderUI();
      });
      this.uiRoot.querySelectorAll('[data-pick-kit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this.profile.customTeam.kitId = btn.dataset.pickKit;
          this._save();
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-select-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          this.builderSlot = Number(btn.dataset.selectSlot);
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-equip-player]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          const pId = btn.dataset.equipPlayer;
          const ids = [...this.profile.customTeam.rosterIds];
          const existingIdx = ids.indexOf(pId);
          if (existingIdx !== -1 && existingIdx !== this.builderSlot && existingIdx > 0 && this.builderSlot > 0) {
            // Swap positions if already in team
            ids[existingIdx] = ids[this.builderSlot];
          }
          ids[this.builderSlot] = pId;
          this.profile.customTeam.rosterIds = ids;
          this._save();
          this.renderUI();
        });
      });
      this.uiRoot.querySelector('#play-my-team-now')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.setup.homeClubId = `custom_${this.profile.id}`;
        this.setupStep = 2;
        this.activeRegion = this.store.profiles.length > 1 ? 'house' : 'africa';
        this.screen = 'setup';
        this.renderUI();
      });

      // Unlockable Superstars & Legends handlers
      this.uiRoot.querySelectorAll('[data-unlock-player]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pId = btn.dataset.unlockPlayer;
          const player = UNLOCKABLE_PLAYERS.find((p) => p.id === pId);
          if (!player || this.profile.coins < player.cost) return;
          if (this.profile.unlockedPlayers.includes(pId)) return;
          this.profile.coins -= player.cost;
          this.profile.unlockedPlayers.push(pId);
          // Immediately place the new unlocked legend in the striker/mid slot of their Dream Team!
          const targetSlot = player.role === 'MID' ? 2 : 4;
          this.profile.customTeam.rosterIds[targetSlot] = pId;
          this._save();
          soundEngine.playCoinUnlock();
          this.renderUI();
        });
      });
      this.uiRoot.querySelectorAll('[data-equip-unlocked-to-team]').forEach((btn) => {
        btn.addEventListener('click', () => {
          soundEngine.playClick();
          const pId = btn.dataset.equipUnlockedToTeam;
          const player = UNLOCKABLE_PLAYERS.find((p) => p.id === pId);
          const slot = player?.role === 'MID' ? 2 : 4;
          this.profile.customTeam.rosterIds[slot] = pId;
          this.builderSlot = slot;
          this.shopTab = 'myteam';
          this._save();
          this.renderUI();
        });
      });

      // Stadium unlocks
      this.uiRoot.querySelectorAll('[data-preview-stadium]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-unlock-stadium]')) return;
          const stId = el.dataset.previewStadium;
          this.previewStadiumId = stId;
          this.renderer.loadShowcase(stId, this._resolveClubData(this.setup.homeClubId) || this.setup.homeClubId, this.setup.awayClubId);
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
          this._save();
          soundEngine.playCoinUnlock();
          this.renderer.loadShowcase(stId, this._resolveClubData(this.setup.homeClubId) || this.setup.homeClubId, this.setup.awayClubId);
          this.renderUI();
        });
      });
      return;
    }

    if (this.screen === 'mp-entry') {
      this.uiRoot.innerHTML = renderMultiplayerEntry(
        this.profile,
        this.profile.username,
        this.prefillRoomCode,
        this.mpError
      );
      this._bindProfileChip();
      this.uiRoot.querySelector('#menu-back-btn')?.addEventListener('click', () => {
        soundEngine.playClick();
        this.screen = 'home';
        this.renderUI();
      });
      const getName = () => {
        const val = (this.uiRoot.querySelector('#mp-player-name')?.value || this.profile.username || 'Player 1').trim().slice(0, 14);
        this.profile.username = val || 'Player 1';
        this._save();
        return this.profile.username;
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
