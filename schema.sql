-- UNIVIA üretim veritabanı şeması (PostgreSQL + PostGIS önerilir)
-- Tüm dinamik kayıtlar kaynak + tarih taşır; "son güncel veri" mantığı için fetched_at / checked_at tutulur.
CREATE TABLE translations (key TEXT, lang TEXT, value TEXT, PRIMARY KEY (key, lang));
CREATE TABLE sources (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, kind TEXT CHECK (kind IN ('official','news','local_media','open_web','user','demo')), url TEXT, reliability NUMERIC(3,2), verified BOOLEAN DEFAULT FALSE);
CREATE TABLE countries (cc CHAR(2) PRIMARY KEY, name TEXT, capital TEXT, population BIGINT, population_year INT, area_km2 NUMERIC, currency TEXT, languages TEXT[], source_id BIGINT REFERENCES sources, checked_at TIMESTAMPTZ);
-- Esnek idari hiyerarşi: Country → Admin1 → Admin2 → Admin3 → Locality
CREATE TABLE regions    (id TEXT PRIMARY KEY, cc CHAR(2) REFERENCES countries, name TEXT, level_name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, source_id BIGINT REFERENCES sources);
CREATE TABLE cities     (id TEXT PRIMARY KEY, region_id TEXT REFERENCES regions, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, timezone TEXT, population BIGINT, population_year INT, population_official BOOLEAN, source_id BIGINT REFERENCES sources);
CREATE TABLE districts  (id TEXT PRIMARY KEY, city_id TEXT REFERENCES cities, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, population BIGINT, population_year INT, source_id BIGINT REFERENCES sources);
CREATE TABLE localities (id TEXT PRIMARY KEY, district_id TEXT REFERENCES districts, name TEXT, kind TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, population BIGINT, population_year INT, population_official BOOLEAN, source_id BIGINT REFERENCES sources);
CREATE TABLE places (id BIGSERIAL PRIMARY KEY, area_id TEXT NOT NULL, name TEXT, category TEXT, description TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, address TEXT, website TEXT,
  rating NUMERIC(2,1), review_count INT, cultural_importance NUMERIC(3,2), accessibility NUMERIC(3,2), kids BOOLEAN, wheelchair BOOLEAN, parking BOOLEAN, transit TEXT,
  visit_min INT, visit_recommended INT, visit_detailed INT, best_time TEXT, opening_hours TEXT, entry_fee TEXT, price_level SMALLINT, source_id BIGINT REFERENCES sources, checked_at TIMESTAMPTZ);
CREATE TABLE museums (place_id BIGINT PRIMARY KEY REFERENCES places, collection TEXT, history TEXT);
CREATE TABLE restaurants (place_id BIGINT PRIMARY KEY REFERENCES places, cuisine TEXT);
CREATE TABLE hotels (place_id BIGINT PRIMARY KEY REFERENCES places, stars SMALLINT);
CREATE TABLE historical_sites (place_id BIGINT PRIMARY KEY REFERENCES places, period TEXT);
CREATE TABLE foods (id BIGSERIAL PRIMARY KEY, area_id TEXT, name TEXT, description TEXT, ingredients TEXT, where_to_eat TEXT, price_level SMALLINT, rating NUMERIC(2,1), significance TEXT, source_id BIGINT REFERENCES sources);
CREATE TABLE events (id BIGSERIAL PRIMARY KEY, area_id TEXT, title TEXT, type TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, place TEXT, url TEXT, source_id BIGINT REFERENCES sources, checked_at TIMESTAMPTZ);
-- Haberler: tek olay altında birden çok kaynak; kişi haberlerinde iddia/karar ayrımı
CREATE TABLE news (id BIGSERIAL PRIMARY KEY, area_id TEXT, story_id BIGINT, title TEXT, summary TEXT, url TEXT, published_at TIMESTAMPTZ, source_id BIGINT REFERENCES sources,
  legal_status TEXT CHECK (legal_status IN ('none','allegation','court_decision','final_decision')) DEFAULT 'none', fetched_at TIMESTAMPTZ);
CREATE TABLE photos (id BIGSERIAL PRIMARY KEY, area_id TEXT, url TEXT, taken_at TIMESTAMPTZ, uploaded_at TIMESTAMPTZ, lat DOUBLE PRECISION, lon DOUBLE PRECISION, license TEXT, author TEXT, source_id BIGINT REFERENCES sources);
CREATE TABLE reviews (id BIGSERIAL PRIMARY KEY, place_id BIGINT REFERENCES places, user_id BIGINT, rating SMALLINT, text TEXT, created_at TIMESTAMPTZ);
CREATE TABLE weather (area_id TEXT PRIMARY KEY, payload JSONB, fetched_at TIMESTAMPTZ, kept_fields JSONB);
CREATE TABLE alerts (id BIGSERIAL PRIMARY KEY, area_id TEXT, title TEXT, level TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, source_id BIGINT REFERENCES sources, official BOOLEAN);
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(), lang TEXT, device_hash TEXT);
CREATE TABLE favorites (user_id BIGINT REFERENCES users, area_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (user_id, area_id));
CREATE TABLE notifications (id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users, area_id TEXT, text TEXT, created_at TIMESTAMPTZ DEFAULT now(), read_at TIMESTAMPTZ);
-- Kullanıcı katkı modülü
CREATE TABLE user_profiles (user_id BIGINT PRIMARY KEY REFERENCES users, display_name TEXT, anonymous_default BOOLEAN DEFAULT FALSE, reputation NUMERIC(4,3) DEFAULT 0.5);
CREATE TABLE contribution_categories (key TEXT PRIMARY KEY, label TEXT, emergency BOOLEAN DEFAULT FALSE);
CREATE TABLE user_contributions (id BIGSERIAL PRIMARY KEY, area_id TEXT NOT NULL, user_id BIGINT REFERENCES users, category TEXT REFERENCES contribution_categories, title TEXT, description TEXT,
  occurred_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ, lat DOUBLE PRECISION, lon DOUBLE PRECISION, source_type TEXT, observed BOOLEAN, anonymous BOOLEAN,
  status TEXT CHECK (status IN ('pending','published','review','rejected','hidden')), risk_score NUMERIC, cluster_id BIGINT, reporters INT DEFAULT 1);
CREATE TABLE contribution_media (id BIGSERIAL PRIMARY KEY, contribution_id BIGINT REFERENCES user_contributions, url TEXT, kind TEXT, taken_at TIMESTAMPTZ, uploaded_at TIMESTAMPTZ, old_photo_flag BOOLEAN);
CREATE TABLE contribution_sources (id BIGSERIAL PRIMARY KEY, contribution_id BIGINT REFERENCES user_contributions, type TEXT, url TEXT, note TEXT, added_by BIGINT, verified BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE contribution_votes (contribution_id BIGINT REFERENCES user_contributions, user_id BIGINT REFERENCES users, value SMALLINT CHECK (value IN (-1,1)), created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (contribution_id, user_id));
CREATE TABLE contribution_reports (id BIGSERIAL PRIMARY KEY, contribution_id BIGINT REFERENCES user_contributions, user_id BIGINT, reason TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE contribution_updates (id BIGSERIAL PRIMARY KEY, contribution_id BIGINT REFERENCES user_contributions, user_id BIGINT, status TEXT, text TEXT, created_at TIMESTAMPTZ DEFAULT now(), approved BOOLEAN);
CREATE TABLE locality_followers (user_id BIGINT REFERENCES users, area_id TEXT, categories TEXT[], created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (user_id, area_id));
CREATE TABLE locality_notifications (id BIGSERIAL PRIMARY KEY, area_id TEXT, contribution_id BIGINT, category TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE moderation_queue (id BIGSERIAL PRIMARY KEY, contribution_id BIGINT REFERENCES user_contributions, reasons TEXT[], risk NUMERIC, origin TEXT CHECK (origin IN ('auto','reports','update','source')), created_at TIMESTAMPTZ DEFAULT now(), resolved_at TIMESTAMPTZ);
CREATE TABLE moderation_actions (id BIGSERIAL PRIMARY KEY, queue_id BIGINT REFERENCES moderation_queue, moderator_id BIGINT, action TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE trust_scores (contribution_id BIGINT PRIMARY KEY REFERENCES user_contributions, class TEXT, level TEXT, points NUMERIC, computed_at TIMESTAMPTZ);
CREATE TABLE badges (key TEXT PRIMARY KEY, label TEXT, rule TEXT);
CREATE TABLE user_badges (user_id BIGINT REFERENCES users, badge_key TEXT REFERENCES badges, awarded_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (user_id, badge_key));
