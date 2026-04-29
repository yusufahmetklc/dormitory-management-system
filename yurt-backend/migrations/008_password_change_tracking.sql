-- Migration 008: Şifre değişikliği takibi
-- Kimin değiştirdiğini ('self' = öğrenci, 'admin' = yönetici) ve
-- ne zaman değiştirildiğini kaydeder.
-- Neon SQL Editor'da neondb_owner olarak çalıştırın.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_changed_by  VARCHAR(10)
    CHECK (password_changed_by IN ('self', 'admin')),
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ;
