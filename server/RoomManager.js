import { MatchEngine, HUMAN_COLORS } from '../shared/MatchEngine.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(existing) {
  for (let tries = 0; tries < 50; tries++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!existing.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Manages local Wi-Fi multiplayer rooms for up to 3 devices.
 * Each room runs an authoritative 60Hz MatchEngine and broadcasts snapshots at 30Hz.
 */
export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.clientToRoom = new Map();
  }

  _send(ws, payload) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  _broadcast(room, payload) {
    const raw = JSON.stringify(payload);
    for (const member of room.members) {
      if (member.ws && member.ws.readyState === 1) {
        member.ws.send(raw);
      }
    }
  }

  _serializeLobby(room) {
    return {
      code: room.code,
      hostSlotId: room.hostSlotId,
      status: room.status,
      config: room.config,
      members: room.members.map((m) => ({
        slotId: m.slotId,
        name: m.name,
        team: m.team,
        color: m.color,
        isHost: m.slotId === room.hostSlotId,
      })),
    };
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'create_room':
        this.createRoom(ws, msg);
        break;
      case 'join_room':
        this.joinRoom(ws, msg);
        break;
      case 'update_member':
        this.updateMember(ws, msg);
        break;
      case 'update_config':
        this.updateConfig(ws, msg);
        break;
      case 'start_match':
        this.startMatch(ws);
        break;
      case 'input':
        this.handleInput(ws, msg);
        break;
      case 'rematch':
        this.startMatch(ws);
        break;
      case 'back_to_lobby':
        this.backToLobby(ws);
        break;
      case 'leave_room':
        this.handleDisconnect(ws);
        break;
      default:
        break;
    }
  }

  createRoom(ws, msg) {
    this.handleDisconnect(ws);
    const code = generateRoomCode(this.rooms);
    const slotId = 'p1';
    const room = {
      code,
      hostSlotId: slotId,
      status: 'lobby', // 'lobby' | 'playing'
      config: {
        homeClubId: msg.config?.homeClubId || 'real-madrid',
        awayClubId: msg.config?.awayClubId || 'man-city',
        stadiumId: msg.config?.stadiumId || 'sunlit-park',
        difficulty: msg.config?.difficulty || 'rookie',
        durationSeconds: msg.config?.durationSeconds || 120,
        homeDraft: Array.isArray(msg.config?.homeDraft) ? msg.config.homeDraft : [],
        awayDraft: [],
      },
      members: [
        {
          slotId,
          name: (msg.name || 'Player 1').slice(0, 14),
          team: 'home',
          color: HUMAN_COLORS[0],
          ws,
        },
      ],
      engine: null,
      simInterval: null,
      tickCount: 0,
    };

    this.rooms.set(code, room);
    this.clientToRoom.set(ws, { code, slotId });
    this._send(ws, {
      type: 'room_joined',
      slotId,
      lobby: this._serializeLobby(room),
    });
  }

  joinRoom(ws, msg) {
    this.handleDisconnect(ws);
    const code = String(msg.code || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      this._send(ws, { type: 'error', message: `Room "${code}" not found. Check the 4-letter code!` });
      return;
    }
    if (room.members.length >= 3) {
      this._send(ws, { type: 'error', message: 'This room already has 3 players!' });
      return;
    }
    if (room.status === 'playing') {
      this._send(ws, { type: 'error', message: 'Match already in progress! Wait for fulltime or rematch.' });
      return;
    }

    const usedSlots = new Set(room.members.map((m) => m.slotId));
    const slotOrder = ['p1', 'p2', 'p3'];
    const slotId = slotOrder.find((s) => !usedSlots.has(s)) || 'p3';
    const colorIdx = slotOrder.indexOf(slotId);

    // Default 2nd player to Home (co-op!) or Away if 2 already on Home
    const homeCount = room.members.filter((m) => m.team === 'home').length;
    const defaultTeam = homeCount >= 2 ? 'away' : 'home';

    room.members.push({
      slotId,
      name: (msg.name || `Player ${colorIdx + 1}`).slice(0, 14),
      team: defaultTeam,
      color: HUMAN_COLORS[colorIdx % HUMAN_COLORS.length],
      ws,
    });

    this.clientToRoom.set(ws, { code, slotId });
    this._send(ws, {
      type: 'room_joined',
      slotId,
      lobby: this._serializeLobby(room),
    });
    this._broadcast(room, {
      type: 'lobby_update',
      lobby: this._serializeLobby(room),
    });
  }

  updateMember(ws, msg) {
    const info = this.clientToRoom.get(ws);
    if (!info) return;
    const room = this.rooms.get(info.code);
    if (!room || room.status !== 'lobby') return;

    const member = room.members.find((m) => m.slotId === info.slotId);
    if (!member) return;

    if (typeof msg.name === 'string' && msg.name.trim()) {
      member.name = msg.name.trim().slice(0, 14);
    }
    if (msg.team === 'home' || msg.team === 'away') {
      member.team = msg.team;
    }

    this._broadcast(room, {
      type: 'lobby_update',
      lobby: this._serializeLobby(room),
    });
  }

  updateConfig(ws, msg) {
    const info = this.clientToRoom.get(ws);
    if (!info) return;
    const room = this.rooms.get(info.code);
    if (!room || room.status !== 'lobby') return;
    if (info.slotId !== room.hostSlotId) return;

    room.config = {
      ...room.config,
      ...msg.config,
    };
    this._broadcast(room, {
      type: 'lobby_update',
      lobby: this._serializeLobby(room),
    });
  }

  startMatch(ws) {
    const info = this.clientToRoom.get(ws);
    if (!info) return;
    const room = this.rooms.get(info.code);
    if (!room) return;
    if (info.slotId !== room.hostSlotId) return;

    this._stopSim(room);
    room.status = 'playing';
    room.engine = new MatchEngine({
      ...room.config,
      humans: room.members.map((m) => ({
        slotId: m.slotId,
        name: m.name,
        team: m.team,
        color: m.color,
      })),
    });
    room.tickCount = 0;

    this._broadcast(room, {
      type: 'match_started',
      meta: room.engine.getMeta(),
      snapshot: room.engine.getSnapshot(),
      lobby: this._serializeLobby(room),
    });

    // Authoritative 60Hz simulation, broadcasting 30Hz snapshots
    const dt = 1 / 60;
    room.simInterval = setInterval(() => {
      if (!room.engine) return;
      room.engine.step(dt);
      room.tickCount++;
      const events = room.engine.consumeEvents();

      if (room.tickCount % 2 === 0 || events.length > 0 || room.engine.phase === 'fulltime') {
        this._broadcast(room, {
          type: 'state',
          snapshot: room.engine.getSnapshot(),
          events,
        });
      }

      if (room.engine.phase === 'fulltime') {
        this._stopSim(room);
      }
    }, 1000 / 60);
  }

  handleInput(ws, msg) {
    const info = this.clientToRoom.get(ws);
    if (!info) return;
    const room = this.rooms.get(info.code);
    if (!room || !room.engine || room.status !== 'playing') return;
    room.engine.setHumanInput(info.slotId, msg.input);
  }

  backToLobby(ws) {
    const info = this.clientToRoom.get(ws);
    if (!info) return;
    const room = this.rooms.get(info.code);
    if (!room) return;
    if (info.slotId !== room.hostSlotId) return;

    this._stopSim(room);
    room.status = 'lobby';
    room.engine = null;
    this._broadcast(room, {
      type: 'returned_to_lobby',
      lobby: this._serializeLobby(room),
    });
  }

  _stopSim(room) {
    if (room.simInterval) {
      clearInterval(room.simInterval);
      room.simInterval = null;
    }
  }

  handleDisconnect(ws) {
    const info = this.clientToRoom.get(ws);
    if (!info) return;
    this.clientToRoom.delete(ws);

    const room = this.rooms.get(info.code);
    if (!room) return;

    room.members = room.members.filter((m) => m.ws !== ws);
    if (room.members.length === 0) {
      this._stopSim(room);
      this.rooms.delete(info.code);
      return;
    }

    if (room.hostSlotId === info.slotId) {
      room.hostSlotId = room.members[0].slotId;
    }

    this._broadcast(room, {
      type: 'lobby_update',
      lobby: this._serializeLobby(room),
    });
  }
}
