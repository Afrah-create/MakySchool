-- Extended accounts: chart of accounts, invoicing, other income, budget (idempotent)

CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  account_type  TEXT NOT NULL
                  CHECK (account_type IN ('income', 'expense')),
  category      TEXT,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS income_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  category    TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS other_income (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  source_id       UUID REFERENCES income_sources(id) ON DELETE SET NULL,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  reference_number TEXT NOT NULL,
  description     TEXT NOT NULL,
  income_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount    BIGINT NOT NULL CHECK (total_amount > 0),
  payment_method  TEXT NOT NULL DEFAULT 'cash'
                    CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'other')),
  payment_reference TEXT,
  notes           TEXT,
  recorded_by     UUID REFERENCES users(id),
  voided          BOOLEAN NOT NULL DEFAULT false,
  voided_at       TIMESTAMPTZ,
  voided_by       UUID REFERENCES users(id),
  void_reason     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS other_income_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  other_income_id UUID NOT NULL REFERENCES other_income(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  description     TEXT NOT NULL,
  amount          BIGINT NOT NULL CHECK (amount > 0),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  fee_structure_id  UUID REFERENCES fee_structures(id) ON DELETE SET NULL,
  invoice_number    TEXT NOT NULL,
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  term_name         TEXT NOT NULL,
  academic_year     INT  NOT NULL,
  status            TEXT NOT NULL DEFAULT 'unpaid'
                      CHECK (status IN ('unpaid', 'partial', 'paid', 'cancelled', 'voided')),
  total_amount      BIGINT NOT NULL CHECK (total_amount > 0),
  amount_paid       BIGINT NOT NULL DEFAULT 0,
  balance           BIGINT GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES users(id),
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity    INT  NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount BIGINT NOT NULL CHECK (unit_amount > 0),
  total_amount BIGINT GENERATED ALWAYS AS (quantity * unit_amount) STORED,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS budget_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  term_name       TEXT NOT NULL,
  academic_year   INT  NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT,
  budget_type     TEXT NOT NULL DEFAULT 'expense'
                    CHECK (budget_type IN ('income', 'expense')),
  budgeted_amount BIGINT NOT NULL CHECK (budgeted_amount >= 0),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, account_id, term_name, academic_year)
);

CREATE TABLE IF NOT EXISTS invoice_number_sequences (
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  next_seq  INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (school_id, year)
);

CREATE TABLE IF NOT EXISTS income_reference_sequences (
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  next_seq  INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (school_id, year)
);

CREATE INDEX IF NOT EXISTS idx_invoices_school     ON invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student    ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_other_income_school ON other_income(school_id);
CREATE INDEX IF NOT EXISTS idx_budget_school       ON budget_items(school_id);
CREATE INDEX IF NOT EXISTS idx_accounts_school     ON accounts(school_id);
