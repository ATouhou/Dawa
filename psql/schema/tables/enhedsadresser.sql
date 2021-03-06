DROP TABLE IF EXISTS enhedsadresser CASCADE;
CREATE TABLE IF NOT EXISTS enhedsadresser (
  id uuid NOT NULL PRIMARY KEY,
  adgangsadresseid UUID NOT NULL,
  objekttype smallint,
  oprettet timestamp,
  ikraftfra timestamp,
  aendret timestamp,
  etage VARCHAR(3),
  doer VARCHAR(4),
  kilde smallint,
  esdhreference text,
  journalnummer text,
  tsv tsvector,
  FOREIGN KEY (adgangsadresseid) REFERENCES adgangsadresser(id)
);
CREATE INDEX ON enhedsadresser(adgangsadresseid);
CREATE INDEX ON enhedsadresser USING gin(tsv);
CREATE INDEX ON enhedsadresser(etage, id);
CREATE INDEX ON enhedsadresser(doer, id);
CREATE INDEX ON enhedsadresser(objekttype);

DROP TABLE IF EXISTS enhedsadresser_history CASCADE;
CREATE TABLE IF NOT EXISTS enhedsadresser_history (
  valid_from integer,
  valid_to integer,
  id uuid NOT NULL,
  adgangsadresseid UUID NOT NULL,
  objekttype smallint,
  oprettet timestamp,
  ikraftfra timestamp,
  aendret timestamp,
  etage VARCHAR(3),
  doer VARCHAR(4),
  kilde smallint,
  esdhreference text,
  journalnummer text
);

CREATE INDEX ON enhedsadresser_history(valid_to);
CREATE INDEX ON enhedsadresser_history(valid_from);
CREATE INDEX ON enhedsadresser_history(id);
