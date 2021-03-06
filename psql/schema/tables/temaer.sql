DROP TABLE IF EXISTS temaer CASCADE;
CREATE TABLE temaer (
  tema tema_type not null,
  id serial not null,
  aendret timestamptz not null,
  geo_version integer not null,
  geo_aendret timestamptz,
  fields json not null,
  tsv tsvector,
  geom  geometry(MultiPolygon, 25832),
  slettet timestamptz,
  PRIMARY KEY(id)
);

CREATE INDEX ON temaer(tema);
CREATE INDEX ON temaer USING GIN(tsv);
CREATE INDEX ON temaer USING GIST(geom);

-- Support lookup using string
CREATE INDEX ON temaer((fields->>'kode')) WHERE ((fields->>'kode') is not null);
CREATE INDEX ON temaer((fields->>'nr')) WHERE ((fields->>'nr') is not null);

-- Support lookup using integer type
CREATE INDEX ON temaer(((fields->>'kode')::integer)) WHERE ((fields->>'kode')::integer is not null);
CREATE INDEX ON temaer(((fields->>'nr')::integer)) WHERE ((fields->>'nr')::integer is not null);

-- More efficient if tema is already given
CREATE INDEX ON temaer(tema,(fields->>'kode')) WHERE ((fields->>'kode') is not null);
CREATE INDEX ON temaer(tema,(fields->>'nr')) WHERE ((fields->>'nr') is not null);
CREATE INDEX ON temaer(tema,((fields->>'kode')::integer)) WHERE ((fields->>'kode')::integer is not null);
CREATE INDEX ON temaer(tema,((fields->>'nr')::integer)) WHERE ((fields->>'nr')::integer is not null);

-- Jordstykker
CREATE INDEX ON temaer((fields->>'ejerlavkode'), (fields->>'matrikelnr')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer(((fields->>'ejerlavkode')::integer), (fields->>'matrikelnr')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'matrikelnr')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'kommunekode')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'regionskode')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'retskredskode')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'sognekode')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'esrejendomsnr')) WHERE tema = 'jordstykke';
CREATE INDEX ON temaer((fields->>'sfeejendomsnr')) WHERE tema = 'jordstykke';
