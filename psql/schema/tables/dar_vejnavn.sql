DROP TABLE IF EXISTS dar_vejnavn CASCADE;
CREATE TABLE  dar_vejnavn (
  versionid integer NOT NULL PRIMARY KEY DEFAULT nextval('id_sequence'),
  vejkode smallint NOT NULL,
  kommunekode smallint NOT NULL,
  registrering tstzrange not null default tstzrange(current_timestamp, null, '[)'),
--  tx_created integer NOT NULL,
--  tx_expired integer NOT NULL,
  navn text,
  adresseringsnavn text,
  aendringstimestamp timestamptz,
  oprettimestamp timestamptz,
  ophoerttimestamp timestamptz
);

CREATE INDEX ON dar_vejnavn(vejkode, kommunekode);