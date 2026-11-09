CREATE TABLE users (id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, token TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE entries (id UUID PRIMARY KEY, user_id UUID REFERENCES users, type TEXT CHECK (type IN ('text','voice','video')),
  text TEXT, transcript TEXT, tags TEXT[], duration_sec INT DEFAULT 0, media_path TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE scores (id UUID PRIMARY KEY, entry_id UUID REFERENCES entries, user_id UUID REFERENCES users, month CHAR(7),
  communication INT, pace INT, clarity INT, vocabulary INT, grammar INT, details JSONB, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE reminders (id UUID PRIMARY KEY, user_id UUID REFERENCES users, time CHAR(5), label TEXT, enabled BOOLEAN DEFAULT true);
CREATE TABLE streaks (user_id UUID PRIMARY KEY REFERENCES users, current INT, longest INT, last_entry_date DATE);
