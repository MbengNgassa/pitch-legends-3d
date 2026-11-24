import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { RoomManager } from './RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 3000);
const IS_DEV = process.argv.includes('--dev');

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const roomManager = new RoomManager();

  // API: Discover host's local Wi-Fi URL so phones & tablets can join easily
  app.get('/api/network-info', (_req, res) => {
    const ips = getLanAddresses();
    const primaryIp = ips[0] || 'localhost';
    res.json({
      port: PORT,
      ips,
      joinBaseUrl: `http://${primaryIp}:${PORT}`,
    });
  });

  // API: Generate a scannable QR code data URL for instant 3-device Wi-Fi join
  app.get('/api/qr', async (req, res) => {
    const text = String(req.query.text || `http://localhost:${PORT}`);
    try {
      const dataUrl = await QRCode.toDataURL(text, {
        width: 240,
        margin: 2,
        color: { dark: '#0B1218', light: '#FFFFFF' },
      });
      res.json({ dataUrl, text });
    } catch (err) {
      res.status(500).json({ error: 'QR generation failed' });
    }
  });

  // WebSocket Multiplayer channel
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        roomManager.handleMessage(ws, msg);
      } catch {
        // Ignore malformed messages
      }
    });
    ws.on('close', () => {
      roomManager.handleDisconnect(ws);
    });
  });

  if (IS_DEV) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: ROOT_DIR,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.use((_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      app.get('/', (_req, res) => {
        res.status(500).send('Run "npm run build" first or use "npm run dev".');
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    const ips = getLanAddresses();
    console.log('');
    console.log('=====================================================');
    console.log('  PITCH LEGENDS 3D — Local & 3-Device Wi-Fi Server');
    console.log('=====================================================');
    console.log(`  Local:    http://localhost:${PORT}`);
    if (ips.length > 0) {
      ips.forEach((ip) => {
        console.log(`  Wi-Fi:    http://${ip}:${PORT}   <-- Open on phones/tablets!`);
      });
    }
    console.log('=====================================================');
    console.log('');
  });
}

startServer();
