-- =============================================================================
-- Goa Guide Buddy (Safr) - Consolidated Supabase Schema
-- =============================================================================

-- 1. Profiles Table & Trigger
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'own profile'
  ) THEN
    CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

-- 2. Trips Table
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  travel_style TEXT NOT NULL DEFAULT 'solo',
  traveller_name TEXT NOT NULL,
  phone_number TEXT,
  destination TEXT NOT NULL,
  start_date DATE,
  days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trips' AND policyname = 'own trips'
  ) THEN
    CREATE POLICY "own trips" ON public.trips FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 3. Travellers Table
CREATE TABLE IF NOT EXISTS public.travellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER,
  category TEXT NOT NULL DEFAULT 'adult',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travellers TO authenticated;
GRANT ALL ON public.travellers TO service_role;
ALTER TABLE public.travellers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'travellers' AND policyname = 'own travellers'
  ) THEN
    CREATE POLICY "own travellers" ON public.travellers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Safety Tags Table
CREATE TABLE IF NOT EXISTS public.safety_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  person_name TEXT NOT NULL,
  person_age INTEGER,
  category TEXT NOT NULL DEFAULT 'kid',
  description TEXT,
  guardian_name TEXT NOT NULL,
  guardian_phone TEXT NOT NULL,
  alt_phone TEXT,
  medical_notes TEXT,
  staying_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_tags TO authenticated;
GRANT ALL ON public.safety_tags TO service_role;
ALTER TABLE public.safety_tags ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'safety_tags' AND policyname = 'own safety tags'
  ) THEN
    CREATE POLICY "own safety tags" ON public.safety_tags FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Itineraries Table
CREATE TABLE IF NOT EXISTS public.itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  place TEXT NOT NULL,
  hours INTEGER NOT NULL DEFAULT 6,
  interests TEXT[] NOT NULL DEFAULT '{}',
  pace TEXT NOT NULL DEFAULT 'balanced',
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itineraries TO authenticated;
GRANT ALL ON public.itineraries TO service_role;
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'itineraries' AND policyname = 'own itineraries'
  ) THEN
    CREATE POLICY "own itineraries" ON public.itineraries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 6. Emergency Contacts Table (Public read)
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
GRANT SELECT ON public.emergency_contacts TO anon, authenticated;
GRANT ALL ON public.emergency_contacts TO service_role;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'emergency_contacts' AND policyname = 'emergency contacts are public'
  ) THEN
    CREATE POLICY "emergency contacts are public" ON public.emergency_contacts FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

INSERT INTO public.emergency_contacts (name, phone, category, note, sort_order) VALUES
('Police', '100', 'police', 'All-India police emergency line', 1),
('Ambulance', '108', 'medical', 'Free 108 emergency ambulance service in Goa', 2),
('Fire Brigade', '101', 'fire', 'Fire and rescue services', 3),
('Emergency Helpline', '112', 'police', 'Single national emergency number', 4),
('Goa Tourist Police', '+918322428383', 'police', 'Help for tourists: scams, harassment, lost items', 5),
('Drishti Marine Lifeguards', '+918322520717', 'coastal', 'Beach lifeguard control room for drowning and sea rescue', 6),
('Women Helpline', '1091', 'helpline', 'Women in distress', 7),
('Child Helpline', '1098', 'helpline', 'Missing or distressed children', 8),
('Goa Medical College Hospital, Bambolim', '+918322495000', 'medical', 'Largest government hospital in Goa', 9),
('Traffic / Highway Accident', '1073', 'road', 'Road accident and highway assistance', 10),
('Disaster Management, Goa', '1077', 'helpline', 'Floods, cyclones and other disasters', 11)
ON CONFLICT DO NOTHING;

-- 7. SafeTag Scans & Privacy Functions
CREATE TABLE IF NOT EXISTS public.safety_tag_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  safety_tag_id UUID NOT NULL REFERENCES public.safety_tags(id) ON DELETE CASCADE,
  finder_note TEXT,
  finder_contact TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  delivery_status JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.safety_tag_scans TO authenticated;
GRANT INSERT ON public.safety_tag_scans TO anon, authenticated;
GRANT ALL ON public.safety_tag_scans TO service_role;
ALTER TABLE public.safety_tag_scans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'safety_tag_scans' AND policyname = 'owner reads own tag scans'
  ) THEN
    CREATE POLICY "owner reads own tag scans" ON public.safety_tag_scans
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.safety_tags t
          WHERE t.id = safety_tag_id AND t.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'safety_tag_scans' AND policyname = 'owner updates own tag scans'
  ) THEN
    CREATE POLICY "owner updates own tag scans" ON public.safety_tag_scans
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.safety_tags t
          WHERE t.id = safety_tag_id AND t.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.safety_tags t
          WHERE t.id = safety_tag_id AND t.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'safety_tag_scans' AND policyname = 'anyone can log a scan'
  ) THEN
    CREATE POLICY "anyone can log a scan" ON public.safety_tag_scans
      FOR INSERT TO anon, authenticated
      WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_safety_tag(_token TEXT)
RETURNS TABLE (
  tag_id UUID,
  category TEXT,
  is_active BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.category, true
  FROM public.safety_tags t
  WHERE t.token = _token;
$$;
GRANT EXECUTE ON FUNCTION public.check_safety_tag(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_safety_tag(
  _token TEXT,
  _finder_note TEXT DEFAULT NULL,
  _finder_contact TEXT DEFAULT NULL,
  _lat DOUBLE PRECISION DEFAULT NULL,
  _lng DOUBLE PRECISION DEFAULT NULL,
  _delivery_status JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tag RECORD;
  _scan_id UUID;
BEGIN
  SELECT id, person_name, token INTO _tag FROM public.safety_tags WHERE token = _token;
  IF _tag.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.safety_tag_scans (
    safety_tag_id,
    finder_note,
    finder_contact,
    lat,
    lng,
    delivery_status
  ) VALUES (
    _tag.id,
    _finder_note,
    _finder_contact,
    _lat,
    _lng,
    COALESCE(_delivery_status, '{}'::jsonb)
  ) RETURNING id INTO _scan_id;

  RETURN jsonb_build_object(
    'scan_id', _scan_id,
    'tag_id', _tag.id,
    'person_name', _tag.person_name,
    'token', _tag.token
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.notify_safety_tag(TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB) TO anon, authenticated, service_role;

-- 8. Saved Places Table
CREATE TABLE IF NOT EXISTS public.saved_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'sight',
  notes TEXT,
  image_url TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'planned', 'visited')),
  visited_at TIMESTAMPTZ,
  priority SMALLINT NOT NULL DEFAULT 0,
  planned_date DATE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_places TO authenticated;
GRANT ALL ON public.saved_places TO service_role;
ALTER TABLE public.saved_places ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_places_user_place_name
  ON public.saved_places (user_id, lower(place_name));

CREATE INDEX IF NOT EXISTS idx_saved_places_user_created_at
  ON public.saved_places (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_saved_places_updated_at ON public.saved_places;
CREATE TRIGGER trigger_saved_places_updated_at
  BEFORE UPDATE ON public.saved_places
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_places' AND policyname = 'Users can manage their own saved places'
  ) THEN
    CREATE POLICY "Users can manage their own saved places"
      ON public.saved_places
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 8b. Saved Routes Table
CREATE TABLE IF NOT EXISTS public.saved_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'car',
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_routes TO authenticated;
GRANT ALL ON public.saved_routes TO service_role;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_saved_routes_user_created_at
  ON public.saved_routes (user_id, created_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'saved_routes' AND policyname = 'Users can manage their own saved routes'
  ) THEN
    CREATE POLICY "Users can manage their own saved routes"
      ON public.saved_routes
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 9. Age Category Validation Constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'safety_tags_age_category_check'
  ) THEN
    ALTER TABLE public.safety_tags ADD CONSTRAINT safety_tags_age_category_check CHECK (
      person_age IS NOT NULL AND person_age BETWEEN 0 AND 120 AND (
        (category = 'kid' AND person_age < 18) OR
        (category IN ('adult', 'member') AND person_age >= 18 AND person_age < 60) OR
        (category = 'senior' AND person_age >= 60)
      )
    ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'travellers_age_category_check'
  ) THEN
    ALTER TABLE public.travellers ADD CONSTRAINT travellers_age_category_check CHECK (
      age IS NOT NULL AND age BETWEEN 0 AND 120 AND (
        (category = 'kid' AND age < 18) OR
        (category = 'adult' AND age >= 18 AND age < 60) OR
        (category = 'senior' AND age >= 60)
      )
    ) NOT VALID;
  END IF;
END $$;
