import { CLUBS, UNLOCKABLE_PLAYERS } from '../../shared/teamsData.js';
import { STADIUMS } from '../../shared/stadiumsData.js';

const HOUSEHOLD_KEY = 'pitch_legends_3d_household_v2';
const LEGACY_KEY = 'pitch_legends_3d_profile_v1';

export const AVATAR_COLORS = ['#22C55E', '#38BDF8', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];

export const KIT_PRESETS = [
  { id: 'emerald-lions', name: 'Emerald Lions', primary: '#007A5E', secondary: '#FCD116', accent: '#CE1126', shorts: '#CE1126', socks: '#FCD116', pattern: 'solid-trim', crestStyle: 'shield' },
  { id: 'royal-gold', name: 'Royal White & Gold', primary: '#F8FAFC', secondary: '#D4AF37', accent: '#1E3A8A', shorts: '#F8FAFC', socks: '#F8FAFC', pattern: 'solid-trim', crestStyle: 'crown' },
  { id: 'blaugrana', name: 'Striped Titans', primary: '#004D98', secondary: '#A50044', accent: '#EDBB00', shorts: '#004D98', socks: '#A50044', pattern: 'stripes', crestStyle: 'shield' },
  { id: 'sky-hawks', name: 'Sky Blue', primary: '#38BDF8', secondary: '#FFFFFF', accent: '#0F172A', shorts: '#FFFFFF', socks: '#38BDF8', pattern: 'solid-trim', crestStyle: 'circle' },
  { id: 'solar-orange', name: 'Solar Elephants', primary: '#F97316', secondary: '#FFFFFF', accent: '#16A34A', shorts: '#F97316', socks: '#16A34A', pattern: 'solid-trim', crestStyle: 'shield' },
  { id: 'golden-stars', name: 'Golden Stars', primary: '#FACC15', secondary: '#007A4D', accent: '#0F172A', shorts: '#007A4D', socks: '#FACC15', pattern: 'solid-trim', crestStyle: 'circle' },
  { id: 'crimson-fire', name: 'Crimson Fire', primary: '#DC2626', secondary: '#FFFFFF', accent: '#FACC15', shorts: '#111827', socks: '#DC2626', pattern: 'sleeves', crestStyle: 'shield' },
  { id: 'electric-pink', name: 'Electric Pink', primary: '#F472B6', secondary: '#18181B', accent: '#FFFFFF', shorts: '#18181B', socks: '#F472B6', pattern: 'solid-trim', crestStyle: 'circle' },
];

export const SLOT_LABELS = ['GK', 'DEF', 'MID', 'FWD', 'ST'];

// Build a deduplicated catalog of every real starter player across all 20 built-in teams
let _starterCatalog = null;
export function getStarterPlayerCatalog() {
  if (_starterCatalog) return _starterCatalog;
  const byFullName = new Map();
  for (const club of CLUBS) {
    for (const p of club.roster) {
      const key = (p.fullName || p.name).toLowerCase();
      if (!byFullName.has(key) || p.ovr > byFullName.get(key).ovr) {
        byFullName.set(key, {
          ...p,
          clubLabel: club.name,
          isUnlockable: false,
        });
      }
    }
  }
  _starterCatalog = Array.from(byFullName.values()).sort((a, b) => b.ovr - a.ovr);
  return _starterCatalog;
}

export function findAnyPlayerById(playerId) {
  const unlock = UNLOCKABLE_PLAYERS.find((p) => p.id === playerId);
  if (unlock) return { ...unlock, isUnlockable: true };
  for (const club of CLUBS) {
    const found = club.roster.find((p) => p.id === playerId);
    if (found) return { ...found, clubLabel: club.name, isUnlockable: false };
  }
  return getStarterPlayerCatalog()[0];
}

export function getAvailablePlayersForProfile(profile, roleFilter = 'outfield') {
  const unlocked = (profile.unlockedPlayers || [])
    .map((id) => UNLOCKABLE_PLAYERS.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({ ...p, isUnlockable: true }));

  const starters = getStarterPlayerCatalog();
  const combined = [...unlocked, ...starters];

  if (roleFilter === 'gk') {
    return combined.filter((p) => p.role === 'GK').sort((a, b) => b.ovr - a.ovr);
  }
  return combined.filter((p) => p.role !== 'GK').sort((a, b) => b.ovr - a.ovr);
}

export function makeShortName(name) {
  const clean = String(name || 'FC').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return (clean.slice(0, 3) || 'UFC').padEnd(3, 'X');
}

export function createNewProfile(username = 'Player 1', index = 0) {
  const cleanName = String(username || `Player ${index + 1}`).trim().slice(0, 14) || `Player ${index + 1}`;
  const teamName = `${cleanName} FC`;
  const kit = KIT_PRESETS[index % KIT_PRESETS.length];
  return {
    id: `prof_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}`,
    username: cleanName,
    avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
    coins: 220,
    wins: 0,
    goals: 0,
    matchesPlayed: 0,
    unlockedPlayers: [],
    unlockedStadiums: STADIUMS.filter((s) => s.unlocked).map((s) => s.id),
    activeDraft: [],
    customTeam: {
      name: teamName,
      shortName: makeShortName(cleanName),
      kitId: kit.id,
      rosterIds: ['onana', 'hakimi', 'bellingham', 'mbeumo', 'osimhen'],
    },
  };
}

export function buildCustomClubFromProfile(profile) {
  const ct = profile.customTeam || {
    name: `${profile.username} FC`,
    shortName: makeShortName(profile.username),
    kitId: 'emerald-lions',
    rosterIds: ['onana', 'hakimi', 'bellingham', 'mbeumo', 'osimhen'],
  };
  const kit = KIT_PRESETS.find((k) => k.id === ct.kitId) || KIT_PRESETS[0];
  const roster = (ct.rosterIds || []).slice(0, 5).map((id, idx) => {
    const p = findAnyPlayerById(id);
    return {
      ...p,
      role: SLOT_LABELS[idx] || p.role,
    };
  });
  while (roster.length < 5) {
    roster.push({ ...getStarterPlayerCatalog()[roster.length], role: SLOT_LABELS[roster.length] });
  }
  const avgOvr = Math.round(roster.reduce((sum, p) => sum + (p.ovr || 84), 0) / roster.length);

  return {
    id: `custom_${profile.id}`,
    profileId: profile.id,
    region: 'house',
    isCustom: true,
    ownerName: profile.username,
    name: ct.name || `${profile.username} FC`,
    shortName: (ct.shortName || makeShortName(ct.name)).toUpperCase().slice(0, 3),
    league: `Dream Team · ${profile.username}`,
    country: 'Home House',
    rating: avgOvr,
    primary: kit.primary,
    secondary: kit.secondary,
    accent: kit.accent,
    shorts: kit.shorts,
    socks: kit.socks,
    pattern: kit.pattern,
    crestStyle: kit.crestStyle,
    unlocked: true,
    cost: 0,
    roster,
  };
}

export function autoPickBestRosterIds(profile) {
  const bestGK = getAvailablePlayersForProfile(profile, 'gk')[0];
  const bestOut = getAvailablePlayersForProfile(profile, 'outfield').slice(0, 4);
  return [bestGK.id, ...bestOut.map((p) => p.id)];
}

export function loadHouseholdStore() {
  const defaultUnlockedStadiums = STADIUMS.filter((s) => s.unlocked).map((s) => s.id);
  try {
    const raw = localStorage.getItem(HOUSEHOLD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) {
        parsed.profiles.forEach((p, idx) => {
          p.unlockedStadiums = Array.from(new Set([...defaultUnlockedStadiums, ...(p.unlockedStadiums || [])]));
          p.unlockedPlayers = Array.isArray(p.unlockedPlayers) ? p.unlockedPlayers : [];
          p.activeDraft = Array.isArray(p.activeDraft) ? p.activeDraft : [];
          if (!p.customTeam) {
            const fresh = createNewProfile(p.username || `Player ${idx + 1}`, idx);
            p.customTeam = fresh.customTeam;
          }
        });
        if (!parsed.profiles.some((p) => p.id === parsed.activeProfileId)) {
          parsed.activeProfileId = parsed.profiles[0].id;
        }
        return parsed;
      }
    }

    // Migrate legacy v1 save seamlessly into the first household profile
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    const first = createNewProfile('Player 1', 0);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      first.username = legacy.playerName || 'Player 1';
      first.coins = typeof legacy.coins === 'number' ? legacy.coins : 220;
      first.matchesPlayed = legacy.matchesPlayed || 0;
      first.unlockedPlayers = Array.isArray(legacy.unlockedPlayers) ? legacy.unlockedPlayers : [];
      first.unlockedStadiums = Array.from(new Set([...defaultUnlockedStadiums, ...(legacy.unlockedStadiums || [])]));
      first.activeDraft = Array.isArray(legacy.activeDraft) ? legacy.activeDraft : [];
      first.customTeam.name = `${first.username} FC`;
      first.customTeam.shortName = makeShortName(first.username);
    }
    const store = { activeProfileId: first.id, profiles: [first] };
    saveHouseholdStore(store);
    return store;
  } catch {
    const fallback = createNewProfile('Player 1', 0);
    return { activeProfileId: fallback.id, profiles: [fallback] };
  }
}

export function saveHouseholdStore(store) {
  try {
    localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota errors
  }
}
