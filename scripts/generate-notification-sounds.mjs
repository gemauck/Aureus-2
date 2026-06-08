#!/usr/bin/env node
/** Generate short WAV chimes for ERP / chat in-app notification sounds. */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function writeToneWav(filePath, tones) {
  const sampleRate = 44100
  const samples = []
  for (const { freq, ms, gain = 0.35 } of tones) {
    const n = Math.floor((sampleRate * ms) / 1000)
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate
      const env = Math.min(1, i / 200) * Math.max(0, 1 - (i - n + 400) / 400)
      samples.push(Math.sin(2 * Math.PI * freq * t) * gain * env)
    }
  }
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.floor(v * 32767), 44 + i * 2)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buffer)
}

const targets = [
  [path.join(root, 'public/sounds/message.wav'), [
    { freq: 880, ms: 90, gain: 0.4 },
    { freq: 1175, ms: 120, gain: 0.38 }
  ]],
  [path.join(root, 'public/sounds/notification.wav'), [
    { freq: 660, ms: 100, gain: 0.38 },
    { freq: 880, ms: 140, gain: 0.36 }
  ]],
  [path.join(root, 'mobile-rn/assets/sounds/message.wav'), [
    { freq: 880, ms: 90, gain: 0.4 },
    { freq: 1175, ms: 120, gain: 0.38 }
  ]],
  [path.join(root, 'mobile-rn/assets/sounds/notification.wav'), [
    { freq: 660, ms: 100, gain: 0.38 },
    { freq: 880, ms: 140, gain: 0.36 }
  ]]
]

for (const [filePath, tones] of targets) {
  writeToneWav(filePath, tones)
  console.log('Wrote', filePath)
}
