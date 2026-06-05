/**
 * Self-hosted Expo Updates helpers (adapted from expo/custom-expo-updates-server).
 */
import crypto from 'crypto'
import fsSync from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const EXT_CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2'
}

function contentTypeForExt(ext) {
  if (!ext) return 'application/octet-stream'
  return EXT_CONTENT_TYPES[String(ext).replace(/^\./, '').toLowerCase()] || 'application/octet-stream'
}

export { contentTypeForExt }

export class NoUpdateAvailableError extends Error {}

function updatesRoot() {
  return path.join(__dirname, '..', '..', '..', 'public', 'mobile-ota', 'updates')
}

export function getOtaPublicBaseUrl() {
  return (
    process.env.MOBILE_OTA_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    'https://abcoafrica.co.za'
  ).replace(/\/$/, '')
}

function createHash(file, algorithm, encoding) {
  return crypto.createHash(algorithm).update(file).digest(encoding)
}

function getBase64URLEncoding(base64EncodedString) {
  return base64EncodedString.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion) {
  const updatesDirectoryForRuntimeVersion = path.join(updatesRoot(), runtimeVersion)
  if (!fsSync.existsSync(updatesDirectoryForRuntimeVersion)) {
    throw new Error(`Unsupported runtime version: ${runtimeVersion}`)
  }

  const filesInUpdatesDirectory = await fs.readdir(updatesDirectoryForRuntimeVersion)
  const directoriesInUpdatesDirectory = (
    await Promise.all(
      filesInUpdatesDirectory.map(async (file) => {
        const fileStat = await fs.stat(path.join(updatesDirectoryForRuntimeVersion, file))
        return fileStat.isDirectory() ? file : null
      })
    )
  )
    .filter(Boolean)
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))

  if (!directoriesInUpdatesDirectory.length) {
    throw new Error(`No OTA bundles published for runtime ${runtimeVersion}`)
  }

  return path.join(updatesDirectoryForRuntimeVersion, directoriesInUpdatesDirectory[0])
}

export async function getAssetMetadataAsync(arg) {
  const assetFilePath = path.join(arg.updateBundlePath, arg.filePath)
  const asset = await fs.readFile(assetFilePath)
  const assetHash = getBase64URLEncoding(createHash(asset, 'sha256', 'base64'))
  const key = createHash(asset, 'md5', 'hex')
  const keyExtensionSuffix = arg.isLaunchAsset ? 'bundle' : arg.ext
  const contentType = arg.isLaunchAsset ? 'application/javascript' : contentTypeForExt(arg.ext)
  const relativeAssetPath = path.relative(updatesRoot(), assetFilePath).split(path.sep).join('/')

  return {
    hash: assetHash,
    key,
    fileExtension: `.${keyExtensionSuffix}`,
    contentType,
    url: `${getOtaPublicBaseUrl()}/api/public/mobile-ota/assets?asset=${encodeURIComponent(relativeAssetPath)}&runtimeVersion=${encodeURIComponent(arg.runtimeVersion)}&platform=${encodeURIComponent(arg.platform)}`
  }
}

export async function getMetadataAsync({ updateBundlePath }) {
  const metadataPath = path.join(updateBundlePath, 'metadata.json')
  const updateMetadataBuffer = await fs.readFile(metadataPath)
  const metadataJson = JSON.parse(updateMetadataBuffer.toString('utf-8'))
  const metadataStat = await fs.stat(metadataPath)

  return {
    metadataJson,
    createdAt: new Date(metadataStat.birthtime).toISOString(),
    id: createHash(updateMetadataBuffer, 'sha256', 'hex')
  }
}

export async function getExpoConfigAsync({ updateBundlePath, runtimeVersion }) {
  try {
    const expoConfigPath = path.join(updateBundlePath, 'expoConfig.json')
    const expoConfigBuffer = await fs.readFile(expoConfigPath)
    return JSON.parse(expoConfigBuffer.toString('utf-8'))
  } catch (error) {
    throw new Error(
      `No expoConfig.json for runtime ${runtimeVersion}. Run npm run mobile:ota:publish. (${error?.message || error})`
    )
  }
}

export async function createNoUpdateAvailableDirectiveAsync() {
  return { type: 'noUpdateAvailable' }
}

export function convertSHA256HashToUUID(value) {
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`
}

export function resolveAssetPath(relativeAssetPath) {
  const normalized = String(relativeAssetPath).replace(/^\/+/, '')
  const root = path.resolve(updatesRoot())
  const resolved = path.resolve(root, normalized)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Invalid asset path')
  }
  return resolved
}
