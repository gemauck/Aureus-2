-- Dedupe public movementId values, then enforce uniqueness (idempotent).
UPDATE "StockMovement" AS sm
SET "movementId" = sm."movementId" || '-DEDUP-' || LEFT(sm."id", 8)
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "movementId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "StockMovement"
) AS ranked
WHERE sm.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_movementId_key" ON "StockMovement"("movementId");
