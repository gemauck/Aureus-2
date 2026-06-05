/**
 * Self-hosted Expo Updates manifest — GET /api/public/mobile-ota/manifest
 * No Expo account required; serves bundles from public/mobile-ota/updates/
 */
import FormData from 'form-data'
import {
  NoUpdateAvailableError,
  convertSHA256HashToUUID,
  createNoUpdateAvailableDirectiveAsync,
  getAssetMetadataAsync,
  getExpoConfigAsync,
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getMetadataAsync
} from '../_lib/mobileOta/helpers.js'
import { badRequest, serverError } from '../_lib/response.js'

async function putNoUpdateAvailableInResponseAsync(res, protocolVersion) {
  if (protocolVersion === 0) {
    throw new Error('NoUpdateAvailable directive not available in protocol version 0')
  }
  const directive = await createNoUpdateAvailableDirectiveAsync()
  const form = new FormData()
  form.append('directive', JSON.stringify(directive), {
    contentType: 'application/json',
    header: { 'content-type': 'application/json; charset=utf-8' }
  })
  res.statusCode = 200
  res.setHeader('expo-protocol-version', String(protocolVersion))
  res.setHeader('expo-sfv-version', '0')
  res.setHeader('cache-control', 'private, max-age=0')
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`)
  res.end(form.getBuffer())
}

async function putUpdateInResponseAsync(req, res, updateBundlePath, runtimeVersion, platform, protocolVersion) {
  const currentUpdateId = req.headers['expo-current-update-id']
  const { metadataJson, createdAt, id } = await getMetadataAsync({ updateBundlePath, runtimeVersion })

  if (currentUpdateId === convertSHA256HashToUUID(id) && protocolVersion === 1) {
    throw new NoUpdateAvailableError()
  }

  const expoConfig = await getExpoConfigAsync({ updateBundlePath, runtimeVersion })
  const platformSpecificMetadata = metadataJson.fileMetadata[platform]
  const manifest = {
    id: convertSHA256HashToUUID(id),
    createdAt,
    runtimeVersion,
    assets: await Promise.all(
      (platformSpecificMetadata.assets || []).map((asset) =>
        getAssetMetadataAsync({
          updateBundlePath,
          filePath: asset.path,
          ext: asset.ext,
          runtimeVersion,
          platform,
          isLaunchAsset: false
        })
      )
    ),
    launchAsset: await getAssetMetadataAsync({
      updateBundlePath,
      filePath: platformSpecificMetadata.bundle,
      isLaunchAsset: true,
      runtimeVersion,
      platform,
      ext: null
    }),
    metadata: {},
    extra: { expoClient: expoConfig }
  }

  const assetRequestHeaders = {}
  ;[...manifest.assets, manifest.launchAsset].forEach((asset) => {
    assetRequestHeaders[asset.key] = {}
  })

  const form = new FormData()
  form.append('manifest', JSON.stringify(manifest), {
    contentType: 'application/json',
    header: { 'content-type': 'application/json; charset=utf-8' }
  })
  form.append('extensions', JSON.stringify({ assetRequestHeaders }), {
    contentType: 'application/json'
  })

  res.statusCode = 200
  res.setHeader('expo-protocol-version', String(protocolVersion))
  res.setHeader('expo-sfv-version', '0')
  res.setHeader('cache-control', 'private, max-age=0')
  res.setHeader('content-type', `multipart/mixed; boundary=${form.getBoundary()}`)
  res.end(form.getBuffer())
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed')
  }

  try {
    const protocolVersionHeader = req.headers['expo-protocol-version']
    if (Array.isArray(protocolVersionHeader)) {
      return badRequest(res, 'Unsupported protocol version header')
    }
    const protocolVersion = parseInt(protocolVersionHeader ?? '0', 10)

    const platform = req.headers['expo-platform'] ?? req.query?.platform
    if (platform !== 'ios' && platform !== 'android') {
      return badRequest(res, 'Unsupported platform. Expected ios or android.')
    }

    const runtimeVersion = req.headers['expo-runtime-version'] ?? req.query?.['runtime-version']
    if (!runtimeVersion || typeof runtimeVersion !== 'string') {
      return badRequest(res, 'No runtimeVersion provided.')
    }

    let updateBundlePath
    try {
      updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion)
    } catch (error) {
      return res.status(404).json({ error: error?.message || 'Update not found' })
    }

    try {
      await putUpdateInResponseAsync(req, res, updateBundlePath, runtimeVersion, platform, protocolVersion)
    } catch (error) {
      if (error instanceof NoUpdateAvailableError) {
        await putNoUpdateAvailableInResponseAsync(res, protocolVersion)
        return
      }
      throw error
    }
  } catch (error) {
    return serverError(res, 'Mobile OTA manifest failed', error?.message || 'Unknown error')
  }
}

export default handler
