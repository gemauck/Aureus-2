-- Progress Tracker: default column false; one-time bulk set (all off, then allowlist on).
-- Re-running is a no-op after the marker row exists.

CREATE TABLE IF NOT EXISTS "_erp_data_migrations" (
  "id" TEXT PRIMARY KEY,
  "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "_erp_data_migrations" WHERE "id" = 'progress_tracker_allowlist_v1') THEN
    -- Already applied
    NULL;
  ELSE
    ALTER TABLE "Project" ALTER COLUMN "includeInProgressTracker" SET DEFAULT false;

    UPDATE "Project" SET "includeInProgressTracker" = false;

    UPDATE "Project" SET "includeInProgressTracker" = true
    WHERE
      (name ILIKE '%Exxaro%' AND name ILIKE '%Grootegeluk%')
      OR (name ILIKE '%Exxaro%' AND name ILIKE '%Leeuwpan%')
      OR (name ILIKE '%Exxaro%' AND name ILIKE '%Belfast%')
      OR name ILIKE '%Kwhezela%'
      OR name ILIKE '%Zibulo%'
      OR name ILIKE '%Chromex%'
      OR name ILIKE '%Bultfontein%'
      OR name ILIKE '%Mondi%'
      OR name ILIKE '%Mafube%';

    INSERT INTO "_erp_data_migrations" ("id") VALUES ('progress_tracker_allowlist_v1');
  END IF;
END $$;
