-- Quick check for duplicate branches
SELECT 
  organization_id,
  LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))) as normalized_name,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as branch_ids,
  STRING_AGG(name, ' | ') as branch_names
FROM branches
GROUP BY organization_id, LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
