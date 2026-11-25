BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.designations
  ADD COLUMN IF NOT EXISTS department_id UUID NULL;

CREATE INDEX IF NOT EXISTS "IDX_designations_department_id"
  ON public.designations (department_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'FK_designations_department_id'
      AND conrelid = 'public.designations'::regclass
  ) THEN
    ALTER TABLE public.designations
      ADD CONSTRAINT "FK_designations_department_id"
      FOREIGN KEY (department_id) REFERENCES public.departments (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;
