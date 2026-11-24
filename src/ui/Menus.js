import {
  CLUBS,
  REGIONS,
  UNLOCKABLE_PLAYERS,
  buildEffectiveRoster,
  getClubById,
  getClubsByRegion,
} from '../../shared/teamsData.js';
import { STADIUMS, getStadiumById } from '../../shared/stadiumsData.js';
import { DIFFICULTIES } from '../../shared/MatchEngine.js';
import {
  KIT_PRESETS,
  SLOT_LABELS,
  buildCustomClubFromProfile,
  getAvailablePlayersForProfile,
} from '../state/ProfileStore.js';
import { renderClubBadgeSVG } from './ClubBadge.js';
import { QUALITY_PRESETS } from '../state/SettingsStore.js';

function resolveAnyClub(clubId, houseClubs = []) {
  const custom = houseClubs.find((c) => c.id === clubId);
  if (custom) return custom;
  return getClubById(clubId);
}

function renderWorldMapSelector(activeRegion, houseCount = 1) {
  const counts = {
    house: houseCount,
    africa: getClubsByRegion('africa').length,
    europe: getClubsByRegion('europe').length,
    americas: getClubsByRegion('americas').length,
  };

  return `
    <div class="world-map-box">
      <svg class="world-map-svg" viewBox="0 0 600 230" role="img" aria-label="Select football region on world map">
        <g stroke="rgba(148,163,184,0.12)" stroke-width="1" fill="none">
          <line x1="0" y1="60" x2="600" y2="60"/>
          <line x1="0" y1="115" x2="600" y2="115"/>
          <line x1="0" y1="170" x2="600" y2="170"/>
          <line x1="150" y1="0" x2="150" y2="230"/>
          <line x1="300" y1="0" x2="300" y2="230"/>
          <line x1="450" y1="0" x2="450" y2="230"/>
        </g>

        <g fill="rgba(148,163,184,0.16)" stroke="rgba(255,255,255,0.08)" stroke-width="1">
          <path d="M362 42 L412 28 L482 36 L526 58 L516 98 L474 114 L442 132 L416 112 L382 104 L356 86 Z"/>
          <path d="M472 156 L526 150 L548 176 L534 202 L486 198 L466 178 Z"/>
        </g>

        <!-- AMERICAS -->
        <g class="map-region ${activeRegion === 'americas' ? 'active' : ''}" data-pick-region="americas">
          <path d="M52 24 L124 22 L152 46 L142 78 L112 96 L94 108 L82 96 L64 74 L46 48 Z"/>
          <path d="M114 116 L154 122 L182 146 L172 182 L146 214 L128 206 L122 172 L106 142 Z"/>
          <g class="map-pin">
            <rect x="66" y="128" width="96" height="24" rx="12"/>
            <text x="114" y="144" text-anchor="middle">AMERICAS · ${counts.americas}</text>
          </g>
        </g>

        <!-- EUROPE -->
        <g class="map-region ${activeRegion === 'europe' ? 'active' : ''}" data-pick-region="europe">
          <path d="M254 34 L288 22 L334 24 L362 42 L354 74 L322 84 L286 84 L264 74 L250 56 Z"/>
          <g class="map-pin">
            <rect x="256" y="42" width="94" height="24" rx="12"/>
            <text x="303" y="58" text-anchor="middle">EUROPE · ${counts.europe}</text>
          </g>
        </g>

        <!-- AFRICA -->
        <g class="map-region africa-region ${activeRegion === 'africa' ? 'active' : ''}" data-pick-region="africa">
          <path d="M254 96 L294 90 L338 96 L360 116 L372 138 L354 166 L338 202 L314 214 L294 196 L286 164 L262 148 L244 124 Z"/>
          <path d="M366 176 L374 172 L376 194 L366 196 Z"/>
          <g class="map-pin">
            <rect x="262" y="132" width="94" height="24" rx="12"/>
            <text x="309" y="148" text-anchor="middle">AFRICA · ${counts.africa}</text>
          </g>
        </g>

        <!-- MY HOUSE CUSTOM TEAMS PIN -->
        <g class="map-region house-region ${activeRegion === 'house' ? 'active' : ''}" data-pick-region="house">
          <g class="map-pin">
            <rect x="424" y="96" width="124" height="26" rx="13"/>
            <text x="486" y="113" text-anchor="middle">★ MY HOUSE · ${counts.house}</text>
          </g>
        </g>
      </svg>

      <div class="region-tabs">
        <button class="region-tab house-tab ${activeRegion === 'house' ? 'active' : ''}" data-pick-region="house">
          <span>★ My House</span>
          <em>${counts.house}</em>
        </button>
        ${REGIONS.map(
          (r) => `
          <button class="region-tab ${activeRegion === r.id ? 'active' : ''}" data-pick-region="${r.id}">
            <span>${r.name}</span>
            <em>${counts[r.id]}</em>
          </button>
        `
        ).join('')}
      </div>
    </div>
  `;
}

export function renderGraphicsSettingsModal(settings) {
  const activeQuality = settings?.quality || 'balanced';
  const fpsCap = settings?.fpsCap || 45;
  const shadowsOn = Boolean(settings?.shadows);
  const resCap = settings?.pixelRatioCap || 1.05;

  const resOptions = [
    { val: 0.75, label: 'Low (Coolest)' },
    { val: 1.05, label: 'Standard' },
    { val: 1.5, label: 'Crisp HD' },
  ];

  return `
    <div class="install-modal-backdrop" id="settings-modal-backdrop">
      <div class="install-modal-card settings-modal-card">
        <div class="im-head">
          <h3>Graphics &amp; Battery Saver</h3>
          <button class="btn-ghost small" id="settings-modal-close">✕</button>
        </div>

        <p class="settings-intro">
          Pick a preset to keep your phone cool and smooth — changes apply immediately!
        </p>

        <div class="gfx-presets-grid">
          ${Object.values(QUALITY_PRESETS)
            .map(
              (p) => `
            <button class="gfx-preset-card ${activeQuality === p.id ? 'selected' : ''}" data-pick-quality="${p.id}">
              <strong>${p.label}</strong>
              <span>${p.tagline}</span>
              <div class="gfx-meta">${p.fpsCap} FPS · ${p.shadows ? 'Shadows ON' : 'No Shadows'} · ${Math.round(p.pixelRatioCap * 100)}% Res</div>
            </button>
          `
            )
            .join('')}
        </div>

        <div class="gfx-fine-grid">
          <div class="setup-field">
            <label>Frame Rate Cap (Lower = Cooler Phone)</label>
            <div class="segmented-group">
              ${[30, 45, 60]
                .map(
                  (fps) => `
                <button class="seg-btn small ${fpsCap === fps ? 'selected' : ''}" data-pick-fps="${fps}">
                  ${fps} FPS${fps === 30 ? ' (Cool)' : ''}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="setup-field">
            <label>3D Resolution</label>
            <div class="segmented-group">
              ${resOptions
                .map(
                  (r) => `
                <button class="seg-btn small ${Math.abs(resCap - r.val) < 0.16 ? 'selected' : ''}" data-pick-res="${r.val}">
                  ${r.label}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="setup-field">
            <label>Dynamic Shadows</label>
            <div class="segmented-group">
              <button class="seg-btn small ${!shadowsOn ? 'selected' : ''}" data-pick-shadows="false">OFF (Cooler)</button>
              <button class="seg-btn small ${shadowsOn ? 'selected' : ''}" data-pick-shadows="true">ON</button>
            </div>
          </div>
        </div>

        <div class="settings-footer-row">
          <span class="settings-tip">Tip: On S21 Ultra or weaker phones, <strong>Cool (30 FPS)</strong> or <strong>Balanced (45 FPS)</strong> stops overheating fast!</span>
          <button class="btn-primary small" id="settings-done-btn">Done</button>
        </div>
      </div>
    </div>
  `;
}

export function renderTopBar(profile, backAction = null, title = '', graphicsSettings = null) {
  const unlockedPlayersCount = profile.unlockedPlayers.length;
  const unlockedStadiumsCount = profile.unlockedStadiums.length;
  const gfxPreset = QUALITY_PRESETS[graphicsSettings?.quality || 'balanced'] || QUALITY_PRESETS.balanced;
  const fpsTag = graphicsSettings?.fpsCap || gfxPreset.fpsCap;

  return `
    <header class="menu-topbar">
      <div class="topbar-left">
        ${
          backAction
            ? `<button class="btn-ghost" id="menu-back-btn">← Back</button>`
            : `<div class="brand-lockup">
                <span class="brand-ball" aria-hidden="true">⚽</span>
                <div>
                  <div class="brand-title">PITCH LEGENDS 3D</div>
                  <div class="brand-sub">Africa &amp; World Edition</div>
                </div>
              </div>`
        }
        ${title ? `<h2 class="topbar-screen-title">${title}</h2>` : ''}
      </div>
      <div class="topbar-stats">
        <button class="user-chip" id="open-profiles-btn" title="Switch household player or add family member">
          <span class="user-dot" style="background:${profile.avatarColor || '#22C55E'}"></span>
          <strong>${profile.username}</strong>
          <span class="user-switch-hint">Switch</span>
        </button>
        ${
          !backAction
            ? `<button class="settings-chip" id="open-settings-btn" title="Graphics & Battery Saver Settings">
                ⚙ ${gfxPreset.shortLabel} · ${fpsTag} FPS
              </button>
              <button class="download-chip" id="home-install-btn" title="Install app to phone home screen or download local version">
                Install App
              </button>`
            : ''
        }
        <div class="stat-chip" title="Unlocked Superstars">
          <span class="stat-label">Stars</span>
          <strong>${unlockedPlayersCount}/${UNLOCKABLE_PLAYERS.length}</strong>
        </div>
        <div class="stat-chip" title="Unlocked Stadiums">
          <span class="stat-label">Stadiums</span>
          <strong>${unlockedStadiumsCount}/${STADIUMS.length}</strong>
        </div>
        <div class="coin-chip" id="topbar-coins">
          <span class="coin-icon" aria-hidden="true">★</span>
          <strong>${profile.coins}</strong>
          <span class="coin-word">Coins</span>
        </div>
      </div>
    </header>
  `;
}

export function renderHomeScreen(profile, installUi = {}, householdCount = 1, graphicsSettings = null, showSettingsModal = false) {
  const customClub = buildCustomClubFromProfile(profile);
  const showInstallModal = Boolean(installUi.showModal);
  const canNativeInstall = Boolean(installUi.canNativeInstall);
  const isInstalled = Boolean(installUi.isInstalled);

  return `
    <div class="menu-shell home-shell">
      ${renderTopBar(profile, null, '', graphicsSettings)}
      <main class="home-hero">
        <div class="hero-copy">
          <h1>Welcome, ${profile.username}!</h1>
          <p class="hero-lead">
            Play with <strong>${customClub.name} (OVR ${customClub.rating})</strong> or any Africa &amp; World team.
            ${householdCount > 1 ? `${householdCount} family players saved on this device.` : 'Tap your name above to add brothers or parents!'}
          </p>
        </div>

        <div class="home-cards">
          <button class="action-card primary-card" id="home-play-solo">
            <div class="card-kicker">1 Player vs AI · House Teams</div>
            <h3>Play Match</h3>
            <p>Play with ${customClub.name}, Cameroon, Nigeria, Real Madrid &amp; challenge other family teams!</p>
            <span class="card-cta">Kick Off →</span>
          </button>

          <button class="action-card shop-card" id="home-open-shop">
            <div class="card-kicker">${profile.coins} Coins · ${customClub.name}</div>
            <h3>My Team &amp; Unlocks</h3>
            <p>Build your custom 5-star team, pick your kit, and unlock Eto'o, Drogba, Pelé &amp; stadiums!</p>
            <span class="card-cta">Build &amp; Unlock →</span>
          </button>

          <button class="action-card wifi-card" id="home-play-multi">
            <div class="card-kicker">3 Devices on Wi-Fi</div>
            <h3>Multiplayer</h3>
            <p>Connect up to 3 devices on home Wi-Fi for Co-op or 2v1 family matches.</p>
            <span class="card-cta">Wi-Fi Lobby →</span>
          </button>
        </div>
      </main>

      ${
        showInstallModal
          ? `
        <div class="install-modal-backdrop" id="install-modal-backdrop">
          <div class="install-modal-card">
            <div class="im-head">
              <h3>Install &amp; Local Download</h3>
              <button class="btn-ghost small" id="install-modal-close">✕</button>
            </div>
            <div class="im-grid">
              <div class="im-option primary-opt">
                <strong>Phone Home Screen App (Offline)</strong>
                <p>Installs Pitch Legends 3D with its own app icon right alongside your other apps — fullscreen &amp; offline.</p>
                ${
                  isInstalled
                    ? `<span class="unlocked-tag">Already Installed on Home Screen ✓</span>`
                    : canNativeInstall
                      ? `<button class="btn-primary full-btn" id="install-native-trigger">Install to Home Screen</button>`
                      : `<div class="im-steps">
                          <strong>Chrome Android:</strong> Tap <code>⋮</code> (top right) → <strong>Add to Home screen</strong> → <strong>Install</strong>.<br/>
                          <strong>iPhone Safari:</strong> Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.
                        </div>`
                }
              </div>

              <div class="im-option">
                <strong>Local Computer / 3-Device Wi-Fi Package</strong>
                <p>Download the full app folder (with 3-device Wi-Fi server &amp; Blender model folder) or standalone file.</p>
                <div class="im-links">
                  <a class="btn-gold small im-link-btn" href="https://github.com/MbengNgassa/pitch-legends-3d/archive/refs/heads/main.zip" target="_blank" rel="noopener">
                    Download Full App (.zip)
                  </a>
                  <a class="btn-secondary small im-link-btn" href="./pitch-legends-3d-offline.html" download="Pitch-Legends-3D.html">
                    Single Offline File (.html)
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
          : ''
      }
      ${showSettingsModal ? renderGraphicsSettingsModal(graphicsSettings) : ''}
    </div>
  `;
}

export function renderProfilesScreen(store, activeProfile) {
  return `
    <div class="menu-shell profiles-shell">
      ${renderTopBar(activeProfile, true, 'Players in the House')}
      <main class="profiles-grid-layout">
        <section class="setup-panel">
          <div class="panel-header">
            <h3>Switch Player (${store.profiles.length})</h3>
            <span class="selected-club-tag">Each player keeps their own coins, stars &amp; Dream Team!</span>
          </div>
          <div class="profiles-list">
            ${store.profiles
              .map((p) => {
                const isActive = p.id === store.activeProfileId;
                const club = buildCustomClubFromProfile(p);
                return `
                  <div class="profile-row ${isActive ? 'active' : ''}" data-select-profile="${p.id}">
                    <div class="profile-row-left">
                      ${renderClubBadgeSVG(club, 38)}
                      <div>
                        <strong>${p.username} ${isActive ? '<span class="active-pill">Playing</span>' : ''}</strong>
                        <div class="profile-meta">${club.name} (OVR ${club.rating}) · ★ ${p.coins} Coins · ${p.wins || 0}W · ${p.goals || 0} Goals</div>
                      </div>
                    </div>
                    <div class="profile-row-actions">
                      ${!isActive ? `<button class="btn-primary small" data-select-profile="${p.id}">Play</button>` : ''}
                      ${
                        store.profiles.length > 1
                          ? `<button class="btn-ghost small" data-delete-profile="${p.id}" title="Remove player">✕</button>`
                          : ''
                      }
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <aside class="setup-panel">
          <h3>Add Family Player</h3>
          <p class="mp-intro">Create a profile for each son or parent so everyone builds their own team and challenges each other!</p>
          <div class="mp-field">
            <label for="new-profile-name">New Player Username</label>
            <input id="new-profile-name" type="text" maxlength="14" placeholder="e.g. Junior, Sam, Dad" />
          </div>
          <button class="btn-primary full-btn" id="add-profile-btn">+ Add Player (+220 Starter Coins)</button>

          <hr class="panel-divider" />

          <div class="mp-field">
            <label for="rename-profile-input">Rename Current Player (${activeProfile.username})</label>
            <div class="mp-join-row">
              <input id="rename-profile-input" type="text" maxlength="14" value="${activeProfile.username}" />
              <button class="btn-gold small" id="rename-profile-btn">Save</button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  `;
}

export function renderMatchSetupScreen(profile, setup, step = 1, activeRegion = 'africa', houseClubs = []) {
  const homeClub = resolveAnyClub(setup.homeClubId, houseClubs);
  const awayClub = resolveAnyClub(setup.awayClubId, houseClubs);
  const stadium = getStadiumById(setup.stadiumId);
  const homeRoster = homeClub.isCustom
    ? homeClub.roster
    : buildEffectiveRoster(setup.homeClubId, profile.activeDraft);
  const awayRoster = awayClub.isCustom
    ? awayClub.roster
    : buildEffectiveRoster(setup.awayClubId, []);

  const regionClubs = activeRegion === 'house' ? houseClubs : getClubsByRegion(activeRegion);

  const stepMeta = [
    { n: 1, label: 'Your Team' },
    { n: 2, label: 'Opponent' },
    { n: 3, label: 'Stadium & Rules' },
  ];

  const renderStepper = () => `
    <nav class="wizard-stepper" aria-label="Match setup steps">
      ${stepMeta
        .map(
          (s) => `
        <button class="step-pill ${step === s.n ? 'active' : step > s.n ? 'done' : ''}" data-goto-step="${s.n}">
          <span class="step-num">${s.n}</span>
          <span>${s.label}</span>
        </button>
      `
        )
        .join('')}
    </nav>
  `;

  const renderClubOption = (club, selectedId, side) => `
    <button class="club-pill ${club.id === selectedId ? 'selected' : ''}" data-pick-club="${side}" data-club-id="${club.id}">
      ${renderClubBadgeSVG(club, 30)}
      <div class="club-pill-info">
        <strong>${club.name}</strong>
        <span>${club.isCustom ? club.ownerName + ' · ' : ''}OVR ${club.rating}</span>
      </div>
    </button>
  `;

  const renderRosterList = (roster, isCustom) => `
    <div class="wizard-roster">
      <div class="roster-preview-title">
        Starting 5 ${isCustom ? '(Custom Dream Team)' : ''}
      </div>
      <div class="roster-tags">
        ${roster
          .map(
            (p) => `
          <span class="roster-tag">
            <strong>#${p.number}</strong> ${p.name} <em>${p.ovr}</em>
          </span>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  let bodyHtml = '';

  if (step === 1) {
    bodyHtml = `
      <main class="wizard-body">
        <section class="wizard-main-col map-picker-col">
          ${renderWorldMapSelector(activeRegion, houseClubs.length)}
          <div class="club-grid-scroll">
            ${regionClubs.map((c) => renderClubOption(c, setup.homeClubId, 'home')).join('')}
          </div>
        </section>

        <aside class="wizard-side-col">
          <div class="selected-spotlight">
            ${renderClubBadgeSVG(homeClub, 50)}
            <div>
              <div class="spot-kicker">YOUR TEAM (HOME)</div>
              <h3>${homeClub.name}</h3>
              <div class="spot-sub">${homeClub.league} · OVR ${homeClub.rating}</div>
            </div>
          </div>
          ${renderRosterList(homeRoster, homeClub.isCustom)}
          <div class="wizard-nav-row">
            <button class="btn-primary full-btn" id="wizard-next-btn">Next: Pick Opponent →</button>
          </div>
        </aside>
      </main>
    `;
  } else if (step === 2) {
    bodyHtml = `
      <main class="wizard-body">
        <section class="wizard-main-col map-picker-col">
          ${renderWorldMapSelector(activeRegion, houseClubs.length)}
          <div class="club-grid-scroll">
            ${regionClubs.map((c) => renderClubOption(c, setup.awayClubId, 'away')).join('')}
          </div>
        </section>

        <aside class="wizard-side-col">
          <div class="matchup-card">
            <div class="matchup-side">
              ${renderClubBadgeSVG(homeClub, 42)}
              <strong>${homeClub.shortName}</strong>
            </div>
            <span class="matchup-vs">VS</span>
            <div class="matchup-side">
              ${renderClubBadgeSVG(awayClub, 42)}
              <strong>${awayClub.shortName}</strong>
            </div>
          </div>
          ${renderRosterList(awayRoster, awayClub.isCustom)}
          <div class="wizard-nav-row">
            <button class="btn-secondary" id="wizard-prev-btn">← Back</button>
            <button class="btn-primary flex-1" id="wizard-next-btn">Next: Stadium →</button>
          </div>
        </aside>
      </main>
    `;
  } else {
    bodyHtml = `
      <main class="wizard-body">
        <section class="wizard-main-col">
          <div class="stadium-picker-3 stadium-scroll">
            ${STADIUMS.map((s) => {
              const unlocked = profile.unlockedStadiums.includes(s.id);
              const active = setup.stadiumId === s.id;
              const isCage = s.style === 'cage';
              return `
                <button class="stadium-chip ${active ? 'selected' : ''} ${unlocked ? '' : 'locked'} ${isCage ? 'cage-chip' : ''}"
                        data-pick-stadium="${s.id}" ${unlocked ? '' : 'data-locked="true"'}>
                  <div class="st-bar" style="background: linear-gradient(90deg, ${s.skyTop}, ${s.railColor || s.skyHorizon}, ${s.grassA});"></div>
                  <div class="st-chip-top">
                    <span class="st-style-pill ${isCage ? 'cage' : 'pro'}">${isCage ? '5-a-Side Cage' : 'Pro Stadium'}</span>
                  </div>
                  <strong>${s.name}</strong>
                  <span>${unlocked ? `${s.city} · ${s.timeOfDay}` : `Unlock · ${s.cost} Coins`}</span>
                </button>
              `;
            }).join('')}
          </div>
        </section>

        <aside class="wizard-side-col">
          <div class="matchup-mini">
            <span>${homeClub.shortName} vs ${awayClub.shortName}</span>
            <strong>${stadium.name}</strong>
          </div>

          <div class="setup-field">
            <label>Difficulty</label>
            <div class="segmented-group">
              ${Object.entries(DIFFICULTIES)
                .map(
                  ([key, d]) => `
                <button class="seg-btn ${setup.difficulty === key ? 'selected' : ''}" data-pick-diff="${key}">
                  ${key === 'rookie' ? 'Rookie' : d.label}
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="setup-field">
            <label>Match Time</label>
            <div class="segmented-group">
              ${[120, 180, 300]
                .map(
                  (sec) => `
                <button class="seg-btn ${setup.durationSeconds === sec ? 'selected' : ''}" data-pick-duration="${sec}">
                  ${sec / 60} Min
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="wizard-nav-row">
            <button class="btn-secondary" id="wizard-prev-btn">← Back</button>
            <button class="btn-primary flex-1 kickoff-big-btn" id="setup-kickoff-btn">KICK OFF!</button>
          </div>
        </aside>
      </main>
    `;
  }

  return `
    <div class="menu-shell setup-shell">
      <div class="setup-header-bar">
        ${renderTopBar(profile, true, '')}
        ${renderStepper()}
      </div>
      ${bodyHtml}
    </div>
  `;
}

export function renderShopScreen(profile, activeTab = 'myteam', previewStadiumId = 'olembe', selectedSlot = 4) {
  const customClub = buildCustomClubFromProfile(profile);
  const ct = profile.customTeam;
  const pool = getAvailablePlayersForProfile(profile, selectedSlot === 0 ? 'gk' : 'outfield');
  const activeSlotPlayerId = ct.rosterIds[selectedSlot];

  return `
    <div class="menu-shell shop-shell">
      ${renderTopBar(profile, true, `${profile.username}’s Locker Room`)}

      <div class="shop-tabs">
        <button class="tab-btn ${activeTab === 'myteam' ? 'active' : ''}" data-shop-tab="myteam">
          Build My Team (${customClub.name} · ${customClub.rating})
        </button>
        <button class="tab-btn ${activeTab === 'players' ? 'active' : ''}" data-shop-tab="players">
          Unlock Legends (${profile.unlockedPlayers.length}/${UNLOCKABLE_PLAYERS.length})
        </button>
        <button class="tab-btn ${activeTab === 'stadiums' ? 'active' : ''}" data-shop-tab="stadiums">
          3D Stadiums (${profile.unlockedStadiums.length}/${STADIUMS.length})
        </button>
      </div>

      ${
        activeTab === 'myteam'
          ? `
        <main class="builder-layout">
          <section class="setup-panel builder-left">
            <div class="builder-club-bar">
              ${renderClubBadgeSVG(customClub, 46)}
              <div class="builder-name-wrap">
                <input id="custom-team-name-input" type="text" maxlength="18" value="${ct.name}" placeholder="Your Club Name" />
                <div class="builder-ovr-sub">Team OVR <strong>${customClub.rating}</strong> · Owner: ${profile.username}</div>
              </div>
              <button class="btn-gold small" id="builder-autopick-btn" title="Fill with your highest-rated stars">Auto Best 5</button>
            </div>

            <div class="kit-picker-row">
              ${KIT_PRESETS.map(
                (k) => `
                <button class="kit-swatch ${ct.kitId === k.id ? 'selected' : ''}"
                        data-pick-kit="${k.id}"
                        title="${k.name}"
                        style="background: linear-gradient(135deg, ${k.primary} 50%, ${k.secondary} 50%);">
                </button>
              `
              ).join('')}
            </div>

            <div class="slots-grid">
              ${customClub.roster
                .map(
                  (p, idx) => `
                <button class="slot-card ${selectedSlot === idx ? 'selected' : ''}" data-select-slot="${idx}">
                  <span class="slot-role">${SLOT_LABELS[idx]}</span>
                  <strong>${p.name}</strong>
                  <em>OVR ${p.ovr}</em>
                </button>
              `
                )
                .join('')}
            </div>

            <button class="btn-primary full-btn" id="play-my-team-now">
              Play Match with ${customClub.name} →
            </button>
          </section>

          <section class="setup-panel builder-right">
            <div class="panel-header">
              <h3>Pick ${SLOT_LABELS[selectedSlot]} (${pool.length} Stars Ready)</h3>
              <span class="selected-club-tag">Tap any player to equip</span>
            </div>
            <div class="pool-grid">
              ${pool
                .map((p) => {
                  const isEquippedHere = p.id === activeSlotPlayerId;
                  const isInTeam = ct.rosterIds.includes(p.id);
                  return `
                    <button class="pool-card ${isEquippedHere ? 'selected' : ''} ${p.isUnlockable ? 'icon-pick' : ''}"
                            data-equip-player="${p.id}">
                      <div class="pool-ovr">${p.ovr}</div>
                      <div class="pool-info">
                        <strong>${p.name}</strong>
                        <span>${p.clubLabel || p.tier} · PAC ${p.pac} SHO ${p.sho}</span>
                      </div>
                      ${isInTeam ? `<span class="in-team-dot">✓</span>` : ''}
                    </button>
                  `;
                })
                .join('')}
            </div>
          </section>
        </main>
      `
          : activeTab === 'players'
            ? `
        <div class="shop-grid">
          ${UNLOCKABLE_PLAYERS.map((p) => {
            const isUnlocked = profile.unlockedPlayers.includes(p.id);
            const canAfford = profile.coins >= p.cost;
            return `
              <article class="player-card tier-${p.tier.toLowerCase()} ${isUnlocked ? 'unlocked' : ''}">
                <div class="pc-head">
                  <div class="pc-ovr">${p.ovr}</div>
                  <div class="pc-meta">
                    <span class="pc-tier">${p.tier} · ${p.role}</span>
                    <h4>${p.name}</h4>
                    <div class="pc-club">${p.clubLabel} · #${p.number}</div>
                  </div>
                </div>
                <p class="pc-bio">${p.bio}</p>
                <div class="pc-stats">
                  <div><span>PAC</span><strong>${p.pac}</strong></div>
                  <div><span>SHO</span><strong>${p.sho}</strong></div>
                  <div><span>PAS</span><strong>${p.pas}</strong></div>
                  <div><span>DRI</span><strong>${p.dri}</strong></div>
                </div>
                <div class="pc-footer">
                  ${
                    isUnlocked
                      ? `<button class="btn-primary full-btn" data-equip-unlocked-to-team="${p.id}">
                          Unlocked ✓ — Add to ${customClub.name}
                        </button>`
                      : `<button class="btn-gold full-btn ${canAfford ? '' : 'disabled'}" data-unlock-player="${p.id}" ${canAfford ? '' : 'disabled'}>
                          ${canAfford ? `Unlock for ${p.cost} Coins` : `Need ${p.cost} Coins`}
                        </button>`
                  }
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `
            : `
        <div class="shop-grid stadium-shop-grid">
          ${STADIUMS.map((s) => {
            const isUnlocked = profile.unlockedStadiums.includes(s.id);
            const canAfford = profile.coins >= s.cost;
            const isPreviewing = previewStadiumId === s.id;
            const isCage = s.style === 'cage';
            return `
              <article class="stadium-card ${isPreviewing ? 'previewing' : ''}" data-preview-stadium="${s.id}">
                <div class="sc-swatch" style="background: linear-gradient(135deg, ${s.skyTop} 0%, ${s.railColor || s.skyHorizon} 52%, ${s.grassA} 52%, ${s.grassB} 100%);">
                  <span class="sc-time">${isCage ? '5-a-Side Cage' : 'Pro Stadium'} · ${s.timeOfDay}</span>
                  ${s.fireworksOnGoal ? `<span class="sc-fx">Fireworks!</span>` : ''}
                </div>
                <div class="sc-body">
                  <h4>${s.name}</h4>
                  <div class="sc-city">${s.city}</div>
                  <p>${s.description}</p>
                  <div class="sc-actions">
                    <button class="btn-ghost small" data-preview-stadium="${s.id}">
                      ${isPreviewing ? 'Previewing Live' : 'Preview 3D'}
                    </button>
                    ${
                      isUnlocked
                        ? `<span class="unlocked-tag">Unlocked ✓</span>`
                        : `<button class="btn-gold small ${canAfford ? '' : 'disabled'}" data-unlock-stadium="${s.id}" ${canAfford ? '' : 'disabled'}>
                            Unlock · ${s.cost} Coins
                          </button>`
                    }
                  </div>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      `
      }
    </div>
  `;
}

export function renderMultiplayerEntry(profile, defaultName, prefillCode = '', errorMsg = '') {
  return `
    <div class="menu-shell mp-shell">
      ${renderTopBar(profile, true, '3-Device Wi-Fi Multiplayer')}
      <main class="mp-entry-card">
        <h3>Play Together on Up to 3 Devices</h3>
        <p class="mp-intro">
          Connect laptops, tablets, and phones on the same home Wi-Fi. Every device gets its own live 3D pitch view and touch/keyboard controls!
        </p>

        ${errorMsg ? `<div class="mp-error">${errorMsg}</div>` : ''}

        <div class="mp-field">
          <label for="mp-player-name">Your Display Name</label>
          <input id="mp-player-name" type="text" maxlength="14" value="${defaultName}" placeholder="e.g. Leo, Max, Dad" />
        </div>

        <div class="mp-split">
          <div class="mp-box">
            <h4>Host a Match Room</h4>
            <p>Start a room and show a QR code + 4-letter code for Devices 2 &amp; 3 to join.</p>
            <button class="btn-primary full-btn" id="mp-create-btn">Create Room</button>
          </div>

          <div class="mp-box">
            <h4>Join a Room</h4>
            <p>Enter the 4-letter code shown on the host screen.</p>
            <div class="mp-join-row">
              <input id="mp-room-code-input" type="text" maxlength="4" value="${prefillCode}" placeholder="CODE" />
              <button class="btn-gold" id="mp-join-btn">Join</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;
}

export function renderMultiplayerLobby(profile, lobby, mySlotId, networkInfo, qrDataUrl) {
  const isHost = lobby.hostSlotId === mySlotId;
  const joinUrl = networkInfo?.joinBaseUrl
    ? `${networkInfo.joinBaseUrl}?room=${lobby.code}`
    : `${window.location.origin}?room=${lobby.code}`;

  const homeCount = lobby.members.filter((m) => m.team === 'home').length;
  const awayCount = lobby.members.filter((m) => m.team === 'away').length;
  const modeSummary =
    awayCount === 0
      ? `${homeCount}-Player Co-op vs AI`
      : `${homeCount}v${awayCount} Family Match (+ AI Teammates)`;

  const slots = [0, 1, 2];

  return `
    <div class="menu-shell mp-shell">
      ${renderTopBar(profile, true, `Room ${lobby.code} · ${modeSummary}`)}
      <main class="lobby-grid">
        <!-- Left: Share Code + QR Code + Connected Devices -->
        <section class="setup-panel">
          <div class="room-code-banner">
            <div>
              <span class="room-code-label">ROOM CODE</span>
              <div class="room-code-big">${lobby.code}</div>
              <div class="room-url-hint">Open on phone/tablet Wi-Fi:<br/><code>${joinUrl}</code></div>
            </div>
            <div class="qr-box">
              ${qrDataUrl ? `<img src="${qrDataUrl}" alt="Scan to join Wi-Fi match" />` : `<div class="qr-loading">QR...</div>`}
              <span>Scan to Join</span>
            </div>
          </div>

          <h4 class="lobby-section-title">Connected Devices (${lobby.members.length}/3)</h4>
          <div class="member-list">
            ${slots
              .map((idx) => {
                const m = lobby.members[idx];
                if (!m) {
                  return `
                    <div class="member-row empty">
                      <span class="member-dot empty-dot"></span>
                      <span class="member-empty-text">Open Seat — Scan QR or enter ${lobby.code} on Device ${idx + 1}</span>
                    </div>
                  `;
                }
                const isMe = m.slotId === mySlotId;
                return `
                  <div class="member-row ${isMe ? 'me' : ''}">
                    <span class="member-dot" style="background:${m.color}"></span>
                    <div class="member-info">
                      <strong>${m.name} ${isMe ? '(You)' : ''} ${m.isHost ? '★ Host' : ''}</strong>
                      <span>Playing on ${m.team === 'home' ? getClubById(lobby.config.homeClubId).name : getClubById(lobby.config.awayClubId).name}</span>
                    </div>
                    ${
                      isMe
                        ? `<div class="team-toggle">
                            <button class="seg-btn small ${m.team === 'home' ? 'selected' : ''}" data-mp-team="home">Home</button>
                            <button class="seg-btn small ${m.team === 'away' ? 'selected' : ''}" data-mp-team="away">Away</button>
                          </div>`
                        : `<span class="team-badge ${m.team}">${m.team.toUpperCase()}</span>`
                    }
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <!-- Right: Match Settings (Editable by Host, live previewed by guests) -->
        <section class="setup-panel">
          <h4 class="lobby-section-title">Match Settings ${isHost ? '(You are Host)' : '(Controlled by Host)'}</h4>

          <div class="lobby-select-group">
            <label>Home Club</label>
            <select id="mp-home-club" ${isHost ? '' : 'disabled'}>
              ${CLUBS.map((c) => `<option value="${c.id}" ${c.id === lobby.config.homeClubId ? 'selected' : ''}>${c.name} (OVR ${c.rating})</option>`).join('')}
            </select>
          </div>

          <div class="lobby-select-group">
            <label>Away Club</label>
            <select id="mp-away-club" ${isHost ? '' : 'disabled'}>
              ${CLUBS.map((c) => `<option value="${c.id}" ${c.id === lobby.config.awayClubId ? 'selected' : ''}>${c.name} (OVR ${c.rating})</option>`).join('')}
            </select>
          </div>

          <div class="lobby-select-group">
            <label>Stadium</label>
            <select id="mp-stadium" ${isHost ? '' : 'disabled'}>
              ${STADIUMS.filter((s) => profile.unlockedStadiums.includes(s.id) || s.id === lobby.config.stadiumId)
                .map((s) => `<option value="${s.id}" ${s.id === lobby.config.stadiumId ? 'selected' : ''}>${s.name} (${s.timeOfDay})</option>`)
                .join('')}
            </select>
          </div>

          <div class="lobby-select-row">
            <div class="lobby-select-group">
              <label>Difficulty</label>
              <select id="mp-difficulty" ${isHost ? '' : 'disabled'}>
                ${Object.entries(DIFFICULTIES)
                  .map(([k, d]) => `<option value="${k}" ${k === lobby.config.difficulty ? 'selected' : ''}>${d.label}</option>`)
                  .join('')}
              </select>
            </div>
            <div class="lobby-select-group">
              <label>Match Length</label>
              <select id="mp-duration" ${isHost ? '' : 'disabled'}>
                ${[120, 180, 300]
                  .map((s) => `<option value="${s}" ${s === lobby.config.durationSeconds ? 'selected' : ''}>${s / 60} Min</option>`)
                  .join('')}
              </select>
            </div>
          </div>

          <div class="lobby-kickoff-area">
            ${
              isHost
                ? `<button class="btn-primary kickoff-big-btn" id="mp-start-match-btn">KICK OFF WITH ${lobby.members.length} ${lobby.members.length === 1 ? 'DEVICE' : 'DEVICES'}!</button>`
                : `<div class="waiting-host-box">Ready! Waiting for the Host to tap Kick Off...</div>`
            }
          </div>
        </section>
      </main>
    </div>
  `;
}
