-- Cleanup duplicate branches script
-- This script removes duplicate branches keeping the most recently updated one

-- Step 1: Show duplicates before cleanup
SELECT 
  organization_id,
  LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))) as normalized_name,
  COUNT(*) as count,
  STRING_AGG(id::text || ' (' || name || ')', ', ') as branch_ids
FROM branches
GROUP BY organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
HAVING COUNT(*) > 1;

-- Step 2: Update employees to point to the kept branch (most recent)
WITH duplicates AS (
  SELECT 
    id,
    organization_id,
    name,
    LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))) as normalized_name,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    ) as rn
  FROM branches
),
branches_to_keep AS (
  SELECT id, organization_id, normalized_name
  FROM duplicates
  WHERE rn = 1
),
branches_to_remove AS (
  SELECT id, organization_id, normalized_name
  FROM duplicates
  WHERE rn > 1
)
UPDATE employees e
SET branch_id = k.id
FROM branches_to_remove r
JOIN branches_to_keep k ON k.organization_id = r.organization_id AND k.normalized_name = r.normalized_name
WHERE e.branch_id = r.id;

-- Step 3: Delete duplicate branches (keeping the most recent)
WITH duplicates AS (
  SELECT 
    id,
    organization_id,
    name,
    LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))) as normalized_name,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
    ) as rn
  FROM branches
)
DELETE FROM branches
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 4: Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_org_normalized_name 
ON branches (organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))));

-- Step 5: Verify cleanup
SELECT 
  organization_id,
  LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))) as normalized_name,
  COUNT(*) as count,
  STRING_AGG(id::text || ' (' || name || ')', ', ') as branch_ids
FROM branches
GROUP BY organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
HAVING COUNT(*) > 1;
