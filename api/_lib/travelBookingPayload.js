import { z } from 'zod'

const flightLegSchema = z.object({
  fromLocation: z.string().trim().min(1).max(500),
  toLocation: z.string().trim().min(1).max(500),
  departDate: z.string().trim().min(1).max(32),
  returnDate: z.string().trim().max(32).optional(),
  tripType: z.enum(['one_way', 'return', 'multi_city']).optional(),
  timePreference: z.string().max(200).optional(),
  cabin: z.string().max(120).optional(),
  airlinePreference: z.string().max(500).optional(),
  avoidAirlines: z.string().max(500).optional(),
  baggageNotes: z.string().max(2000).optional(),
  frequentFlyerNotes: z.string().max(2000).optional(),
  flexibilityNotes: z.string().max(2000).optional()
})

const staySchema = z.object({
  location: z.string().trim().min(1).max(500),
  checkIn: z.string().trim().min(1).max(32),
  checkOut: z.string().trim().min(1).max(32),
  roomType: z.string().max(120).optional(),
  board: z.string().max(120).optional(),
  budgetNotes: z.string().max(500).optional(),
  parking: z.string().max(200).optional(),
  specialNeeds: z.string().max(2000).optional()
})

export const travelBookingPayloadSchema = z
  .object({
    tripStartDate: z.string().trim().min(1).max(32),
    tripEndDate: z.string().trim().min(1).max(32),
    costCentre: z.string().max(200).optional(),
    projectRef: z.string().max(200).optional(),
    passengers: z.array(z.string().trim().max(200)).max(20).default([]),
    generalConstraints: z.string().max(5000).optional(),
    flights: z.array(flightLegSchema).max(20).default([]),
    stays: z.array(staySchema).max(20).default([])
  })
  .refine((data) => data.flights.length > 0 || data.stays.length > 0, {
    message: 'Provide at least one flight leg or one accommodation stay'
  })

export const createTravelBookingBodySchema = z.object({
  assigneeId: z.string().min(1),
  tripTitle: z.string().trim().max(500).optional(),
  businessReason: z.string().trim().min(1).max(8000),
  payload: travelBookingPayloadSchema
})

export const TRAVEL_BOOKING_STATUSES = new Set([
  'submitted',
  'in_progress',
  'needs_info',
  'booked',
  'declined',
  'cancelled'
])

export const patchTravelBookingBodySchema = z.object({
  status: z.enum([
    'submitted',
    'in_progress',
    'needs_info',
    'booked',
    'declined',
    'cancelled'
  ]).optional(),
  assigneeInternalNotes: z.string().max(10000).optional(),
  messageToRequester: z.string().max(8000).optional()
})

export function parseTravelPayloadJson(payloadStr) {
  try {
    const o = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr
    return travelBookingPayloadSchema.parse(o)
  } catch {
    return null
  }
}
