-- Fees management + bursar role (idempotent)

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin', 'head_teacher', 'teacher', 'bursar', 'learner',
    'ADMIN', 'TEACHER', 'LEARNER', 'STUDENT'
  ));

CREATE TABLE IF NOT EXISTS fee_structures (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  term_id       UUID REFERENCES terms(id) ON DELETE SET NULL,
  term_name     TEXT NOT NULL,
  academic_year INT  NOT NULL,
  amount        BIGINT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'UGX',
  description   TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, class_id, term_name, academic_year)
);

CREATE TABLE IF NOT EXISTS student_fee_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_structure_id  UUID NOT NULL REFERENCES fee_structures(id) ON DELETE RESTRICT,
  amount_owed       BIGINT NOT NULL,
  amount_paid       BIGINT NOT NULL DEFAULT 0,
  balance           BIGINT GENERATED ALWAYS AS (amount_owed - amount_paid) STORED,
  status            TEXT NOT NULL DEFAULT 'unpaid'
                      CHECK (status IN ('unpaid', 'partial', 'paid', 'waived', 'overpaid')),
  waived_by         UUID REFERENCES users(id),
  waived_reason     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, fee_structure_id)
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_account_id      UUID NOT NULL REFERENCES student_fee_accounts(id) ON DELETE RESTRICT,
  receipt_number      TEXT NOT NULL,
  amount              BIGINT NOT NULL CHECK (amount > 0),
  payment_method      TEXT NOT NULL DEFAULT 'cash'
                        CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'other')),
  payment_reference   TEXT,
  payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  notes               TEXT,
  recorded_by         UUID REFERENCES users(id),
  voided              BOOLEAN DEFAULT false,
  voided_at           TIMESTAMPTZ,
  voided_by           UUID REFERENCES users(id),
  void_reason         TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS receipt_number_sequences (
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  next_seq    INT  NOT NULL DEFAULT 1,
  PRIMARY KEY (school_id, year)
);

CREATE INDEX IF NOT EXISTS idx_fee_structures_school   ON fee_structures(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_class    ON fee_structures(class_id);
CREATE INDEX IF NOT EXISTS idx_sfa_student             ON student_fee_accounts(student_id);
CREATE INDEX IF NOT EXISTS idx_sfa_school              ON student_fee_accounts(school_id);
CREATE INDEX IF NOT EXISTS idx_sfa_status              ON student_fee_accounts(status);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student    ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_school     ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_account    ON fee_payments(fee_account_id);
