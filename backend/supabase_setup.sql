-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- Create the question_embeddings table
create table public.question_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  firestore_id text not null,
  question_text text not null,
  embedding vector(768) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index for vector similarity search (optional but recommended for large datasets)
-- We use HNSW (Hierarchical Navigable Small World) for fast approximate nearest neighbor search
create index on public.question_embeddings using hnsw (embedding vector_cosine_ops);

-- Create a function to match questions based on cosine distance
create or replace function match_questions (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_tenant_id text
)
returns table (
  id uuid,
  firestore_id text,
  question_text text,
  similarity float
)
language sql stable
as $$
  select
    id,
    firestore_id,
    question_text,
    1 - (question_embeddings.embedding <=> query_embedding) as similarity
  from public.question_embeddings
  where tenant_id = p_tenant_id
    and 1 - (question_embeddings.embedding <=> query_embedding) > match_threshold
  order by question_embeddings.embedding <=> query_embedding
  limit match_count;
$$;
