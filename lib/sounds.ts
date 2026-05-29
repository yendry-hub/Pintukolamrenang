let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function playSuccessSound() {
  const c = getCtx()
  const now = c.currentTime

  // Ding (C5)
  const osc1 = c.createOscillator()
  const gain1 = c.createGain()
  osc1.type = 'sine'
  osc1.frequency.value = 523.25
  gain1.gain.setValueAtTime(0.3, now)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc1.connect(gain1).connect(c.destination)
  osc1.start(now)
  osc1.stop(now + 0.4)

  // Dong (E5) — 200ms after ding
  const osc2 = c.createOscillator()
  const gain2 = c.createGain()
  osc2.type = 'sine'
  osc2.frequency.value = 659.25
  gain2.gain.setValueAtTime(0.001, now + 0.15)
  gain2.gain.linearRampToValueAtTime(0.3, now + 0.2)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8)
  osc2.connect(gain2).connect(c.destination)
  osc2.start(now + 0.15)
  osc2.stop(now + 0.8)
}

export function playFailSound() {
  const c = getCtx()
  const now = c.currentTime

  // Low buzz (sawtooth, descending)
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(300, now)
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.6)
  gain.gain.setValueAtTime(0.2, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
  osc.connect(gain).connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.6)
}
