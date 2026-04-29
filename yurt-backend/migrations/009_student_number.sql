-- Migration 009: Öğrenci numarası kolonu
-- public.users tablosuna student_number kolonu ekler
-- Neon SQL Editor'da neondb_owner olarak çalıştırın

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS student_number VARCHAR(20);
