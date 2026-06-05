/**
 * Self-hosted Expo Updates assets — GET /api/public/mobile-ota/assets
 */
import fs from 'fs/promises'
import path from 'path'
import {
  contentTypeForExt,
  getLatestUpdateBundlePathForRuntimeVersionAsync,
  getMetadataAsync,
  resolveAssetPath
} from '../_lib/mobileOta/helpers.js'
import { badRequest, serverError } from '../_lib/response.js'

async function handler(req, res) {
  if (req.method !== 'GET') {
    return badRequest(res, 'Method not allowed')
  }

  try {
    const { asset: assetName, runtimeVersion, platform } = req.query || {}

    if (!assetName || typeof assetName !== 'string') {
      return badRequest(res, 'No asset name provided.')
    }
    if (platform !== 'ios' && platform !== 'android') {
      return badRequest(res, 'No platform provided. Expected ios or android.')
    }
    if (!runtimeVersion || typeof runtimeVersion !== 'string') {
      return badRequest(res, 'No runtimeVersion provided.')
    }

    const updateBundlePath = await getLatestUpdateBundlePathForRuntimeVersionAsync(runtimeVersion)
    const { metadataJson } = await getMetadataAsync({ updateBundlePath, runtimeVersion })

    const assetPath = resolveAssetPath(assetName)
    const relativeInBundle = path.relative(updateBundlePath, assetPath).split(path.sep).join('/')
    const platformMeta = metadataJson.fileMetadata[platform]
    const assetMetadata = (platformMeta.assets || []).find((a) => a.path === relativeInBundle)
    const isLaunchAsset = platformMeta.bundle === relativeInBundle

    const asset = await fs.readFile(assetPath)
    res.statusCode = 200
    res.setHeader(
      'content-type',
      isLaunchAsset
        ? 'application/javascript'
        : contentTypeForExt(assetMetadata?.ext || path.extname(assetPath))
    )
    return res.end(asset)
  } catch (error) {
    if (error?.message?.includes('Unsupported runtime') || error?.message?.includes('Invalid asset')) {
      return res.status(404).json({ error: error.message })
    }
    return serverError(res, 'Mobile OTA asset failed', error?.message || 'Unknown error')
  }
}

export default handler
