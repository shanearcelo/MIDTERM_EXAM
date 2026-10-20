# Student Scholarship Monitoring and Academic Compliance System

A web-based scholarship management and verification portal built using **HTML5, CSS3, JavaScript (ES Modules)**, and **Supabase (Auth & PostgreSQL Database)**.

---

## 📌 Features

### 🎓 Scholar Portal
- **Academic Summary Submission:** Submit semester metrics including GWA, enrolled units, and counts for failed, incomplete (INC), and dropped subjects.
- **Evidence Verification Link:** Attach online grade document URLs (e.g., Google Drive links) for staff review.
- **Submission Tracking:** Track verification status (`Pending verification`, `Verified`, `Returned`), compliance status (`Compliant`, `With Deficiency`), and renewal decisions (`Approved`, `Held`).
- **User Authentication:** Secure Sign-In and Log Out capability with persistent session handling.

### 🛡️ Staff Verification Dashboard
- **Verification Gateway:** Review submitted evidence links and set status to `Verified` or `Returned` with decision notes.
- **Automated Policy Checks:** Run automated compliance evaluations against program-specific policy thresholds (e.g., Merit Scholar vs. Community Scholar).
- **Controlled Renewal Authorization:** Authorize `Approved` or `Held` decisions (renewal approval is restricted for deficient or unverified records).
- **Real-time Metrics & Filtering:** View aggregate statistics (Total, Pending, Compliant, Deficient) and filter records by scholar name or ID.
- **Audit Logging:** Record history for verification, compliance checks, and final renewal decisions in `evaluation_history`.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3 (Flexbox/Grid layout with custom variables), JavaScript (ES6 Modules)
- **Backend & Database:** Supabase Auth, PostgreSQL with Row-Level Security (RLS)
- **Icons:** Lucide Icons CDN (`unpkg.com/lucide`)

---

## 🗄️ Database Setup (`schema.sql`)

Run the following SQL script inside your **Supabase SQL Editor** to establish the core tables, policies, and policy seed data:

```sql
-- 1. EXTENSIONS & SCHEMAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE TABLES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('scholar', 'staff')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scholarship_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_name TEXT UNIQUE NOT NULL,
    max_gwa NUMERIC(3,2) NOT NULL,
    min_units INTEGER NOT NULL,
    max_failed INTEGER NOT NULL DEFAULT 0,
    max_inc INTEGER NOT NULL DEFAULT 0,
    max_dropped INTEGER NOT NULL DEFAULT 0,
    deadline_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scholar_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scholar_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES public.scholarship_policies(id) ON DELETE RESTRICT,
    award_status TEXT NOT NULL DEFAULT 'Active' CHECK (award_status IN ('Active', 'Suspended', 'Terminated')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.semester_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scholar_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL,
    semester INTEGER NOT NULL CHECK (semester IN (1, 2)),
    gwa NUMERIC(3,2) NOT NULL CHECK (gwa BETWEEN 1.00 AND 5.00),
    enrolled_units INTEGER NOT NULL CHECK (enrolled_units >= 0),
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    inc_count INTEGER NOT NULL DEFAULT 0 CHECK (inc_count >= 0),
    dropped_count INTEGER NOT NULL DEFAULT 0 CHECK (dropped_count >= 0),
    evidence_url TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    verification_status TEXT NOT NULL DEFAULT 'Pending verification' CHECK (verification_status IN ('Pending verification', 'Verified', 'Returned')),
    verification_reason TEXT,
    compliance_status TEXT NOT NULL DEFAULT 'Not Evaluated' CHECK (compliance_status IN ('Not Evaluated', 'Compliant', 'With Deficiency')),
    deficiency_reasons TEXT[],
    renewal_decision TEXT NOT NULL DEFAULT 'Pending' CHECK (renewal_decision IN ('Pending', 'Approved', 'Held')),
    decision_notes TEXT,
    CONSTRAINT unique_scholar_semester UNIQUE (scholar_id, academic_year, semester)
);

CREATE TABLE IF NOT EXISTS public.evaluation_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES public.semester_submissions(id) ON DELETE CASCADE,
    performed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SEED SCHOLARSHIP POLICIES
INSERT INTO public.scholarship_policies (program_name, max_gwa, min_units, max_failed, max_inc, max_dropped, deadline_at)
VALUES 
    ('Merit Scholar', 1.75, 18, 0, 0, 0, '2026-10-30 17:00:00+08'),
    ('Community Scholar', 2.25, 15, 0, 0, 1, '2026-10-30 17:00:00+08')
ON CONFLICT (program_name) DO NOTHING;

-- 4. DISABLE RLS FOR TESTING (OR CONFIGURE PERMISSIVE POLICIES)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarship_policies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholar_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.semester_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_history DISABLE ROW LEVEL SECURITY;
