/**
 * Endpoint to seed inventory with stock items
 * POST /api/seed-inventory
 * 
 * This endpoint imports all stock items to populate initial inventory
 */

import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { ok, badRequest, serverError } from './_lib/response.js'
import { stockItems } from './seed-inventory-data.js'

async function handler(req, res) {
  if (req.method !== 'POST') {
    return badRequest(res, 'Only POST method allowed')
  }

  try {
    console.log(`📦 Starting bulk import of ${stockItems.length} inventory items...`)

    // Get current max SKU number
    const allItems = await prisma.inventoryItem.findMany({
      where: { sku: { startsWith: 'SKU' } },
      select: { sku: true }
    })
    
    let maxNumber = 0
    for (const item of allItems) {
      const match = item.sku.match(/^SKU(\d+)$/)
      if (match) {
        const num = parseInt(match[1])
        if (num > maxNumber) maxNumber = num
      }
    }

    let nextSkuNumber = maxNumber + 1
    const created = []
    const errors = []

    // Helper functions
    const determineCategory = (partNumber, description) => {
      const partLower = (partNumber || '').toLowerCase()
      const descLower = (description || '').toLowerCase()
      
      if (partLower.includes('fuse') || partLower.includes('led') || partLower.includes('diode') || 
          partLower.includes('transistor') || partLower.includes('capacitor') || partLower.includes('resistor') ||
          partLower.includes('ic') || partLower.includes('op amp') || partLower.includes('regulator') ||
          partLower.includes('sensor') || partLower.includes('switch') || partLower.includes('connector') ||
          partLower.includes('header') || partLower.includes('socket') || partLower.includes('relay') ||
          partLower.includes('inductor') || partLower.includes('zener') || partLower.includes('schottky')) {
        return 'components'
      }
      
      if (partLower.includes('enclosure') || partLower.includes('box') || partLower.includes('housing') ||
          partLower.includes('panel') || partLower.includes('gland') || partLower.includes('junction')) {
        return 'accessories'
      }
      
      if (partLower.includes('battery') || partLower.includes('power') || partLower.includes('psu')) {
        return 'accessories'
      }
      
      if (partLower.includes('screw') || partLower.includes('nut') || partLower.includes('washer') ||
          partLower.includes('spacer') || partLower.includes('tape') || partLower.includes('pipe') ||
          partLower.includes('joiner') || partLower.includes('valve')) {
        return 'accessories'
      }
      
      if (partLower.includes('completed unit') || partLower.includes('fuel track completed')) {
        return 'finished_goods'
      }
      
      return 'components'
    }

    const determineType = (partNumber, description) => {
      const partLower = (partNumber || '').toLowerCase()
      
      if (partLower.includes('completed unit') || partLower.includes('finished')) {
        return 'finished_good'
      }
      
      if (partLower.includes('housing') || partLower.includes('card rev')) {
        return 'work_in_progress'
      }
      
      return 'raw_material'
    }

    // Process items in batch
    for (const itemData of stockItems) {
      try {
        const name = itemData.description || itemData.partNumber
        if (!name) {
          errors.push({ item: itemData.partNumber || 'Unknown', error: 'name/description required' })
          continue
        }

        const quantity = parseFloat(itemData.quantity) || 0
        const totalValue = parseFloat(itemData.totalValue) || 0
        const unitCost = quantity > 0 ? Math.round((totalValue / quantity) * 100) / 100 : 0
        const reorderPoint = Math.max(1, Math.floor(quantity * 0.2))
        const reorderQty = Math.max(10, Math.floor(quantity * 0.3))
        
        let status = 'out_of_stock'
        if (quantity > reorderPoint) {
          status = 'in_stock'
        } else if (quantity > 0 && quantity <= reorderPoint) {
          status = 'low_stock'
        }

        const sku = `SKU${String(nextSkuNumber).padStart(4, '0')}`
        nextSkuNumber++

        const inventoryItem = await prisma.inventoryItem.create({
          data: {
            sku,
            name,
            thumbnail: '',
            category: determineCategory(itemData.partNumber, itemData.description),
            type: determineType(itemData.partNumber, itemData.description),
            quantity,
            unit: 'pcs',
            reorderPoint,
            reorderQty,
            location: '',
            unitCost,
            totalValue,
            supplier: '',
            status,
            lastRestocked: new Date(),
            ownerId: null
          }
        })

        created.push({ sku: inventoryItem.sku, name: inventoryItem.name })
      } catch (error) {
        errors.push({ 
          item: itemData.partNumber || itemData.name || 'Unknown', 
          error: error.message 
        })
      }
    }

    console.log(`✅ Bulk import completed: ${created.length} created, ${errors.length} errors`)
    return ok(res, {
      message: `Bulk import completed: ${created.length} items created, ${errors.length} errors`,
      created: created.length,
      errors: errors.length,
      createdItems: created.slice(0, 10), // Return first 10 as sample
      errorItems: errors.slice(0, 10) // Return first 10 errors as sample
    })
  } catch (error) {
    console.error('❌ Bulk import failed:', error)
    return serverError(res, 'Failed to bulk import inventory items', error.message)
  }
}

export default authRequired(handler)
