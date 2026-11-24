import { CLUBS, UNLOCKABLE_PLAYERS, buildEffectiveRoster, getClubById } from '../../shared/teamsData.js';
import { STADIUMS, getStadiumById } from '../../shared/stadiumsData.js';
import { DIFFICULTIES } from '../../shared/MatchEngine.js';
import { renderClubBadgeSVG } from './ClubBadge.js';

export function renderTopBar(profile, backAction = null, title = '') {
  const unlockedPlayersCount = profile.unlockedPlayers.length;
  const unlockedStadiumsCount = profile.unlockedStadiums.length;

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
                  <div class="brand-sub">Local &amp; 3-Device Wi-Fi Edition</div>
                </div>
              </div>`
        }
        ${title ? `<h2 class="topbar-screen-title">${title}</h2>` : ''}
      </div>
      <div class="topbar-stats">
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

export function renderHomeScreen(profile) {
  const activeDraftCount = profile.activeDraft.length;
  return `
    <div class="menu-shell home-shell">
      ${renderTopBar(profile)}
      <main class="home-hero">
        <div class="hero-copy">
          <h1>Play Real Clubs.<br/>Unlock Legends.</h1>
          <p class="hero-lead">
            Jump into fast, kid-friendly 5v5 3D football with real stars, unlockable stadiums,
            and live 3-device Wi-Fi matches on phones, tablets &amp; laptops.
          </p>
        </div>

        <div class="home-cards">
          <button class="action-card primary-card" id="home-play-solo">
            <div class="card-kicker">1 Player vs AI</div>
            <h3>Play Match</h3>
            <p>Pick Real Madrid, Man City, Barcelona, Liverpool &amp; more. Kid-friendly Rookie mode ready!</p>
            <span class="card-cta">Kick Off →</span>
          </button>

          <button class="action-card wifi-card" id="home-play-multi">
            <div class="card-kicker">Up to 3 Devices on Wi-Fi</div>
            <h3>Play with Friends</h3>
            <p>Scan a QR code on phones, tablets or laptops for 3-player Co-op or 2v1 on your home Wi-Fi.</p>
            <span class="card-cta">Open Wi-Fi Lobby →</span>
          </button>

          <button class="action-card shop-card" id="home-open-shop">
            <div class="card-kicker">${profile.coins} Coins Ready${activeDraftCount > 0 ? ` · ${activeDraftCount} Stars Drafted` : ''}</div>
            <h3>Unlock Players &amp; Stadiums</h3>
            <p>Unlock Cristiano Ronaldo, Pelé, Ronaldinho, Maradona, Camp Nou, Anfield &amp; Maracanã!</p>
            <span class="card-cta">Open Locker Room →</span>
          </button>
        </div>
      </main>
    </div>
  `;
}

export function renderMatchSetupScreen(profile, setup) {
  const homeClub = getClubById(setup.homeClubId);
  const awayClub = getClubById(setup.awayClubId);
  const homeRoster = buildEffectiveRoster(setup.homeClubId, profile.activeDraft);
  const awayRoster = buildEffectiveRoster(setup.awayClubId, []);

  const renderClubOption = (club, selectedId, side) => `
    <button class="club-pill ${club.id === selectedId ? 'selected' : ''}" data-pick-club="${side}" data-club-id="${club.id}">
      ${renderClubBadgeSVG(club, 34)}
      <div class="club-pill-info">
        <strong>${club.name}</strong>
        <span>${club.league} · OVR ${club.rating}</span>
      </div>
    </button>
  `;

  const renderRosterLine = (roster, isCustom) => `
    <div class="roster-preview">
      <div class="roster-preview-title">Starting 5 ${isCustom && profile.activeDraft.length > 0 ? `(Includes ${profile.activeDraft.length} Unlocked Stars!)` : ''}</div>
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

  return `
    <div class="menu-shell setup-shell">
      ${renderTopBar(profile, true, 'Match Setup')}
      <main class="setup-grid">
        <section class="setup-panel">
          <div class="panel-header">
            <h3>Your Club (Home)</h3>
            <span class="selected-club-tag">${homeClub.name}</span>
          </div>
          <div class="club-grid">
            ${CLUBS.map((c) => renderClubOption(c, setup.homeClubId, 'home')).join('')}
          </div>
          ${renderRosterLine(homeRoster, true)}
        </section>

        <section class="setup-panel">
          <div class="panel-header">
            <h3>Opponent Club (Away)</h3>
            <span class="selected-club-tag">${awayClub.name}</span>
          </div>
          <div class="club-grid">
            ${CLUBS.map((c) => renderClubOption(c, setup.awayClubId, 'away')).join('')}
          </div>
          ${renderRosterLine(awayRoster, false)}
        </section>

        <section class="setup-panel setup-bottom-panel">
          <div class="setup-row-split">
            <div class="setup-field">
              <label>Stadium (Live 3D Preview)</label>
              <div class="stadium-picker">
                ${STADIUMS.map((s) => {
                  const unlocked = profile.unlockedStadiums.includes(s.id);
                  const active = setup.stadiumId === s.id;
                  return `
                    <button class="stadium-chip ${active ? 'selected' : ''} ${unlocked ? '' : 'locked'}"
                            data-pick-stadium="${s.id}" ${unlocked ? '' : 'data-locked="true"'}>
                      <strong>${s.name}</strong>
                      <span>${unlocked ? s.timeOfDay : `Locked · ${s.cost} Coins`}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="setup-controls-col">
              <div class="setup-field">
                <label>Difficulty</label>
                <div class="segmented-group">
                  ${Object.entries(DIFFICULTIES)
                    .map(
                      ([key, d]) => `
                    <button class="seg-btn ${setup.difficulty === key ? 'selected' : ''}" data-pick-diff="${key}">
                      ${d.label}
                    </button>
                  `
                    )
                    .join('')}
                </div>
              </div>

              <div class="setup-field">
                <label>Match Length</label>
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

              <button class="btn-primary kickoff-big-btn" id="setup-kickoff-btn">
                KICK OFF MATCH!
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;
}

export function renderShopScreen(profile, activeTab = 'players', previewStadiumId = 'bernabeu') {
  const draftedPlayers = profile.activeDraft
    .map((id) => UNLOCKABLE_PLAYERS.find((p) => p.id === id))
    .filter(Boolean);

  return `
    <div class="menu-shell shop-shell">
      ${renderTopBar(profile, true, 'Locker Room & Unlocks')}

      <div class="shop-tabs">
        <button class="tab-btn ${activeTab === 'players' ? 'active' : ''}" data-shop-tab="players">
          Superstars &amp; Legends (${profile.unlockedPlayers.length}/${UNLOCKABLE_PLAYERS.length})
        </button>
        <button class="tab-btn ${activeTab === 'stadiums' ? 'active' : ''}" data-shop-tab="stadiums">
          3D Stadiums (${profile.unlockedStadiums.length}/${STADIUMS.length})
        </button>
      </div>

      ${
        activeTab === 'players'
          ? `
        <div class="draft-banner">
          <div>
            <strong>Active Squad Draft (${draftedPlayers.length}/4):</strong>
            <span>${
              draftedPlayers.length > 0
                ? draftedPlayers.map((p) => `${p.name} (${p.ovr})`).join(' · ')
                : 'Unlock a superstar below and tap "Add to Squad" to play with them in any club!'
            }</span>
          </div>
          ${
            draftedPlayers.length > 0
              ? `<button class="btn-ghost small" id="shop-clear-draft">Clear Draft</button>`
              : ''
          }
        </div>

        <div class="shop-grid">
          ${UNLOCKABLE_PLAYERS.map((p) => {
            const isUnlocked = profile.unlockedPlayers.includes(p.id);
            const isDrafted = profile.activeDraft.includes(p.id);
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
                      ? `<button class="${isDrafted ? 'btn-secondary' : 'btn-primary'} full-btn" data-toggle-draft="${p.id}">
                          ${isDrafted ? 'In Your Squad ✓ (Remove)' : 'Add to Your Squad'}
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
            return `
              <article class="stadium-card ${isPreviewing ? 'previewing' : ''}" data-preview-stadium="${s.id}">
                <div class="sc-swatch" style="background: linear-gradient(135deg, ${s.skyTop} 0%, ${s.skyHorizon} 52%, ${s.grassA} 52%, ${s.grassB} 100%);">
                  <span class="sc-time">${s.timeOfDay}</span>
                  ${s.fireworksOnGoal ? `<span class="sc-fx">Fireworks on Goals!</span>` : ''}
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
