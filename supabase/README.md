# EduOS — Supabase Setup Guide

## Prerequisites

- Supabase project created at [supabase.com](https://supabase.com)
- `.env` file configured (copy from `.env.example`)

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

## Running Migrations

1. Go to Supabase Dashboard → SQL Editor
2. Run `migrations/001_initial_schema.sql`

## Row Level Security

All tables have RLS enabled with the following isolation rules:

| Role        | Institute Data     | User Data          |
| ----------- | ------------------ | ------------------ |
| super_admin | All institutes     | All users          |
| admin       | Own institute only | Own institute only |
| staff       | Own institute only | Read only          |
| student     | Own data only      | Own profile only   |
| parent      | Linked children    | Own profile only   |

## Auth Trigger

A database trigger (`on_auth_user_created`) automatically creates a user profile
in `public.users` when a new Supabase Auth user signs up.

## Schema ERD

```
institutes
    │
    ├── users (institute_id FK)
    │       │
    │       ├── students (user_id FK)
    │       │       │
    │       │       └── student_parents (student_id FK) ←─┐
    │       │                                              │
    │       ├── parents (user_id FK) ─── student_parents (parent_id FK)
    │       │
    │       └── staff (user_id FK)
```

## Security Architecture

- RLS enforced at database level (cannot be bypassed from client)
- Helper functions: `get_my_institute_id()`, `get_my_role()`, `is_super_admin()`
- Parent-child isolation via `student_parents` junction table
- JWT tokens scoped to Supabase session
