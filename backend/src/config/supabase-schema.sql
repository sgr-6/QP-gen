-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants (colleges/institutions)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  org_code TEXT UNIQUE NOT NULL, -- e.g. 'SJBIT', used for login routing
  domain TEXT, -- optional email domain for auto-tenant detection
  logo_url TEXT,
  plan TEXT DEFAULT 'free', -- future billing: free/starter/pro/enterprise
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users with explicit roles (NO default fallback)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('professor', 'hod', 'controller_of_exams', 'print_admin', 'tenant_admin', 'super_admin')),
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  user_email TEXT NOT NULL,
  user_role TEXT,
  action TEXT NOT NULL, -- 'LOGIN', 'UPLOAD', 'GENERATE_DRAFT', 'DOWNLOAD', 'APPROVE', 'REJECT', 'FINALIZE', 'VIEW'
  resource_type TEXT, -- 'question_bank', 'draft_paper', 'final_paper'
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OTP store (replaces Firestore OTPs collection)
CREATE TABLE otp_store (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_store ENABLE ROW LEVEL SECURITY;

-- Index for performance
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_otp_store_email ON otp_store(email);

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Question Embeddings (for duplicate detection)
CREATE TABLE question_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  firestore_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE question_embeddings ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON question_embeddings USING hnsw (embedding vector_cosine_ops);

-- Similarity search function
CREATE OR REPLACE FUNCTION match_questions(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_tenant_id UUID
)
RETURNS TABLE (
  firestore_id TEXT,
  question_text TEXT,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    question_embeddings.firestore_id,
    question_embeddings.question_text,
    1 - (question_embeddings.embedding <=> query_embedding) AS similarity
  FROM question_embeddings
  WHERE question_embeddings.tenant_id = p_tenant_id
    AND 1 - (question_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY question_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
