#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function usage() {
  console.log('Usage: node scripts/convert-sa-to-env.js /path/to/service-account.json')
  process.exit(1)
}

const arg = process.argv[2]
if (!arg) usage()

const saPath = path.resolve(process.cwd(), arg)
if (!fs.existsSync(saPath)) {
  console.error('Service account file not found:', saPath)
  process.exit(2)
}

let saJson
try {
  saJson = JSON.parse(fs.readFileSync(saPath, 'utf8'))
} catch (e) {
  console.error('Failed to parse JSON:', e.message)
  process.exit(3)
}

const projectId = saJson.project_id || saJson.projectId || ''
const clientEmail = saJson.client_email || saJson.clientEmail || ''
const privateKey = saJson.private_key || saJson.privateKey || ''

if (!projectId || !clientEmail || !privateKey) {
  console.error('Required fields missing in service account JSON. Found keys:', Object.keys(saJson).join(', '))
  process.exit(4)
}

const envPath = path.resolve(process.cwd(), '.env.local')
// backup
if (fs.existsSync(envPath)) {
  const bak = envPath + '.bak'
  fs.copyFileSync(envPath, bak)
  console.log('Existing .env.local backed up to', bak)
}

// prepare private key with escaped newlines
const escapedKey = privateKey.replace(/\n/g, '\\n')

const block = [
  '',
  '# Firebase Admin service account (added by convert-sa-to-env.js)',
  `FIREBASE_PROJECT_ID=${projectId}`,
  `FIREBASE_CLIENT_EMAIL=${clientEmail}`,
  `FIREBASE_PRIVATE_KEY="${escapedKey}"`,
  ''
].join('\n')

fs.appendFileSync(envPath, block, { encoding: 'utf8' })
console.log('Appended FIREBASE_* entries to .env.local')
console.log('Done.')
