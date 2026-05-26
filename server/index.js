const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ── Firebase Admin ──────────────────────────────────────────────
if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
  } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    console.error('No Firebase credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL + FIREBASE_PROJECT_ID');
    process.exit(1);
  }
}

const ESP_GATE_SECRET = process.env.ESP_GATE_SECRET;
if (!ESP_GATE_SECRET) {
  console.error('Missing ESP_GATE_SECRET environment variable');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// ── POST /api/uid ───────────────────────────────────────────────
app.post('/api/uid', async (req, res) => {
  const { uid, gateId, secret } = req.body || {};

  if (secret !== ESP_GATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!uid || !gateId) {
    return res.status(400).json({ error: 'Missing uid or gateId' });
  }

  try {
    const db = admin.firestore();
    const cardRef = db.collection('rfidCards').doc(uid);
    const cardSnap = await cardRef.get();

    if (!cardSnap.exists) {
      return res.status(404).json({ result: 'FAIL', reason: 'UID not registered' });
    }

    const card = cardSnap.data() || {};
    let expiryValid = true;
    if (card.expiryDate) {
      if (card.expiryDate.toDate && typeof card.expiryDate.toDate === 'function') {
        expiryValid = card.expiryDate.toDate() > new Date();
      } else {
        expiryValid = new Date(card.expiryDate).getTime() > new Date().getTime();
      }
    }

    const isActive = Boolean(card.active && expiryValid);
    const valid = Boolean(isActive && !card.used && !card.blocked);

    if (!valid) {
      return res.status(400).json({ result: 'FAIL', reason: card.blocked ? 'Card blocked' : 'Ticket invalid or expired' });
    }

    await db.collection('pendingScans').doc(uid).set({
      uid,
      gateId,
      ticketType: card.ticketType ?? 'Unknown',
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      cardData: card,
    });

    await cardRef.update({
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      used: true,
    });

    return res.status(200).json({ result: 'OPEN' });
  } catch (error) {
    console.error('/api/uid error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// ── POST /api/gate-heartbeat ────────────────────────────────────
function normalizeErrors(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).slice(0, 20);
}

app.post('/api/gate-heartbeat', async (req, res) => {
  const { gateId, secret, ipAddress, firmwareVersion, name, errors, scanAck } = req.body || {};

  if (secret !== ESP_GATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!gateId) {
    return res.status(400).json({ error: 'Missing gateId' });
  }

  try {
    const db = admin.firestore();
    const id = String(gateId);
    const remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;

    const batch = db.batch();

    batch.set(db.collection('gateDevices').doc(id), {
      gateId: id,
      name: name ? String(name) : id,
      status: 'ONLINE',
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: ipAddress ? String(ipAddress) : String(remoteAddress || ''),
      firmwareVersion: firmwareVersion ? String(firmwareVersion) : '',
      errors: normalizeErrors(errors),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();

    if (scanAck) {
      const scanUid = String(scanAck);
      const pendingRef = db.collection('pendingScans').doc(scanUid);
      const pendingSnap = await pendingRef.get();
      if (pendingSnap.exists) {
        const data = pendingSnap.data() || {};
        await db.collection('scanLogs').add({
          uid: scanUid,
          gateId: id,
          status: 'VALID',
          ticketType: data.ticketType ?? 'Unknown',
          scannedAt: data.scannedAt || admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await pendingRef.delete();
      }
    }

    return res.status(200).json({ result: 'OK', gateId: id });
  } catch (error) {
    console.error('/api/gate-heartbeat error:', error);
    return res.status(500).json({ error: error.message || 'Failed to update gate heartbeat' });
  }
});

// ── Health check ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`KolamRenang API server running on port ${PORT}`);
});
