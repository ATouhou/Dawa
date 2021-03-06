DROP VIEW IF EXISTS dar1_adgangsadresser_view CASCADE;

CREATE VIEW dar1_adgangsadresser_view AS
  SELECT
    hn.id,
    k.kommunekode,
    nvk.vejkode,
    hn.husnummertekst                                           AS husnr,
    s.navn                                                      AS supplerendebynavn,
    p.postnr,
    dar1_status_til_dawa_status(hn.status)
                                                                AS objekttype,
    (SELECT min(lower(virkning) AT TIME ZONE 'Europe/Copenhagen')
     FROM dar1_husnummer hn2
     WHERE hn.id = hn2.id)
                                                                AS oprettet,
    GREATEST((SELECT max(lower(ap2.virkning)) AT TIME ZONE 'Europe/Copenhagen'
              FROM dar1_adressepunkt_current ap2
              WHERE ap2.id = hn.adgangspunkt_id),
             (SELECT max(lower(hn2.virkning)) AT TIME ZONE 'Europe/Copenhagen'
              FROM dar1_husnummer_current hn2
              WHERE hn.id = hn2.id))
                                                                AS aendret,
    ap.id                                                       AS adgangspunktid,
    ST_X(ap.position)                                           AS etrs89oest,
    ST_Y(ap.position)                                           AS etrs89nord,
    ap.oprindelse_nøjagtighedsklasse                            AS noejagtighed,
    CASE ap.oprindelse_kilde
    WHEN 'Grundkort'
      THEN 1
    WHEN 'Matrikelkort'
      THEN 2
    WHEN 'Ekstern'
      THEN 4
    WHEN 'Adressemyn'
      THEN 5 END                                                AS adgangspunktkilde,
    ap.oprindelse_tekniskstandard                               AS tekniskstandard,
    hn.husnummerretning                                         AS tekstretning,
    ap.oprindelse_registrering AT TIME ZONE 'Europe/Copenhagen' AS adressepunktaendringsdato,
    nv.id                                                       AS navngivenvej_id,
    ap.position                                                 AS geom
  FROM dar1_husnummer_current hn
    JOIN dar1_darkommuneinddeling_current k
      ON hn.darkommune_id = k.id
    JOIN dar1_navngivenvej_current nv
      ON hn.navngivenvej_id = nv.id
    JOIN dar1_navngivenvejkommunedel_current nvk
      ON nv.id = nvk.navngivenvej_id AND
         k.kommunekode = nvk.kommune
    LEFT JOIN dar1_supplerendebynavn_current s
      ON hn.supplerendebynavn_id = s.id
    JOIN dar1_postnummer_current p
      ON hn.postnummer_id = p.id
    LEFT JOIN dar1_adressepunkt_current ap
      ON hn.adgangspunkt_id = ap.id
  WHERE dar1_status_til_dawa_status(hn.status) IN (1, 3);

-- This view is used for dirty-checking (computing which adgangsadresser has changed
-- due to changes in DAR 1.0 entities)

DROP VIEW IF EXISTS dar1_adgangsadresser_dirty_view CASCADE;
CREATE VIEW dar1_adgangsadresser_dirty_view AS
  SELECT
    hn.id  AS id,
    hn.id  AS husnummer_id,
    k.id   AS darkommuneinddeling_id,
    nv.id  AS navngivenvej_id,
    nvk.id AS navngivenvejkommunedel_id,
    p.id   AS postnummer_id,
    ap.id  AS adressepunkt_id,
    s.id   AS supplerendebynavn_id
  FROM dar1_husnummer_current hn
    JOIN dar1_darkommuneinddeling_current k
      ON hn.darkommune_id = k.id
    JOIN dar1_navngivenvej_current nv
      ON hn.navngivenvej_id = nv.id
    JOIN dar1_navngivenvejkommunedel_current nvk
      ON nv.id = nvk.navngivenvej_id AND
         k.kommunekode = nvk.kommune
    LEFT JOIN dar1_supplerendebynavn_current s
      ON hn.supplerendebynavn_id = s.id
    JOIN dar1_postnummer_current p
      ON hn.postnummer_id = p.id
    JOIN dar1_adressepunkt_current ap
      ON hn.adgangspunkt_id = ap.id
  WHERE dar1_status_til_dawa_status(hn.status) IN (1, 3);
