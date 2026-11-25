BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.request_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  kind VARCHAR(10) NOT NULL,
  leave_type_id UUID NULL,
  name VARCHAR(100) NOT NULL,
  recipients JSONB NOT NULL,
  subject_template VARCHAR(200) NOT NULL,
  body_template TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_request_email_template_org" FOREIGN KEY (organization_id)
    REFERENCES public.organizations (organization_id) ON DELETE CASCADE,
  CONSTRAINT "FK_request_email_template_leave_type" FOREIGN KEY (leave_type_id)
    REFERENCES public.leave_types (id) ON DELETE CASCADE,
  CONSTRAINT "CHK_request_email_template_kind" CHECK (
    (kind = 'leave' AND leave_type_id IS NOT NULL)
    OR (kind = 'wfh' AND leave_type_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS "IDX_request_email_templates_scope"
  ON public.request_email_templates (organization_id, kind, leave_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_request_email_default_leave"
  ON public.request_email_templates (organization_id, leave_type_id)
  WHERE enabled = true AND is_default = true AND kind = 'leave';
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_request_email_default_wfh"
  ON public.request_email_templates (organization_id)
  WHERE enabled = true AND is_default = true AND kind = 'wfh';

CREATE TABLE IF NOT EXISTS public.request_email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  kind VARCHAR(10) NOT NULL,
  request_id UUID NOT NULL,
  user_id UUID NOT NULL,
  employee_name VARCHAR(400) NOT NULL,
  template_id UUID NULL,
  recipients JSONB NOT NULL,
  reply_to VARCHAR(254) NULL,
  subject VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FK_request_email_delivery_org" FOREIGN KEY (organization_id)
    REFERENCES public.organizations (organization_id) ON DELETE CASCADE,
  CONSTRAINT "FK_request_email_delivery_user" FOREIGN KEY (user_id)
    REFERENCES public.users (user_id) ON DELETE CASCADE,
  CONSTRAINT "FK_request_email_delivery_template" FOREIGN KEY (template_id)
    REFERENCES public.request_email_templates (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_request_email_delivery_request"
  ON public.request_email_deliveries (kind, request_id);
CREATE INDEX IF NOT EXISTS "IDX_request_email_delivery_due"
  ON public.request_email_deliveries (status, next_attempt_at);

COMMIT;
