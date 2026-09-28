-- One row per mushroom find. GeoServer publishes this table as
-- mushroom:observations and accepts WFS-T inserts/deletes against it.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS observations (
  id          serial PRIMARY KEY,
  species     text NOT NULL CHECK (species IN (
                'chanterelle', 'hericium', 'hen_of_the_woods', 'hedgehog')),
  -- Optional species within a genus-level `species`; ids come from VARIANTS in
  -- web/shared.js. Left unconstrained so the list can grow without a migration.
  variant     text,
  observed_at timestamptz NOT NULL,
  accuracy_m  real CHECK (accuracy_m >= 0),
  quantity    integer CHECK (quantity > 0),
  notes       text,
  -- JSON array of JPEG data URLs, shrunk on the phone before saving. The map
  -- leaves this out of the list and fetches it one find at a time.
  photos      text,
  geom        geometry(Point, 4326) NOT NULL
);

-- Added after the first install; CREATE TABLE above skips an existing table.
ALTER TABLE observations ADD COLUMN IF NOT EXISTS photos text;

CREATE INDEX IF NOT EXISTS observations_geom_idx ON observations USING gist (geom);
CREATE INDEX IF NOT EXISTS observations_species_idx ON observations (species);
