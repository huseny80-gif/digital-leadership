-- Phase 5 (Database Implementation) — migration 1 of 11.
-- Implements DATABASE_MIGRATION_PLAN.md §3 step 1: extensions & shared types.
-- This is the approved DATABASE_DESIGN.md as-is; no schema decisions are
-- made here beyond what that document already specified.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email

create type user_status as enum ('active', 'suspended');
create type content_status as enum ('draft', 'published');
create type lecture_item_type as enum ('pdf', 'summary', 'assignment', 'exercise');
create type question_type as enum ('multiple_choice', 'true_false', 'short_answer');
create type quiz_attempt_status as enum ('in_progress', 'submitted', 'graded');
create type file_status as enum ('active', 'archived');
