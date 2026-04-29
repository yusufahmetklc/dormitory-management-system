-- Migration 010: departments tablosu + users.department_id FK
-- Neon SQL Editor'da neondb_owner olarak çalıştırın

CREATE TABLE IF NOT EXISTS public.departments (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  code       VARCHAR(6)   NOT NULL UNIQUE CHECK (code ~ '^[0-9]+$'),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES public.departments(id);
