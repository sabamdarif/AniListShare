"""GraphQL documents used by the Jikan-compatible API.

Two things about AniList's current schema shape this file:

* There is no longer a ``score`` field. ``averageScore`` and ``meanScore`` are
  0-100 integers that :mod:`animeapi.mappers` scales down to Jikan's 0-10
  ``score``.
* Airing times come from ``airingSchedules``, a time-ordered stream, so one
  day is a contiguous window — which makes weekday filtering exact and
  pageable rather than something to filter after the fact.

``MEDIA_FIELDS`` is shared by every endpoint so they all return one shape.
"""

MEDIA_FIELDS = """
  id
  idMal
  title { romaji english native }
  synonyms
  coverImage { extraLarge large medium color }
  bannerImage
  format
  status
  source
  description(asHtml: false)
  episodes
  duration
  averageScore
  meanScore
  popularity
  favourites
  season
  seasonYear
  genres
  isAdult
  siteUrl
  trailer { id site thumbnail }
  studios { edges { isMain node { name } } }
  startDate { year month day }
  endDate { year month day }
  nextAiringEpisode { airingAt episode }
"""

# Only fetched for /anime/{id}/full, where Jikan returns the related works and
# the official/streaming links alongside the entry itself.
EXTRA_DETAIL_FIELDS = """
  relations {
    edges {
      relationType(version: 2)
      node { id idMal type format title { romaji english native } }
    }
  }
  externalLinks { id url site type }
"""

PAGE_INFO = """
  pageInfo { total currentPage lastPage hasNextPage perPage }
"""

ANIME_SEARCH = """
query (
  $page: Int, $perPage: Int, $search: String, $format: MediaFormat,
  $status: MediaStatus, $genreIn: [String], $genreNotIn: [String],
  $scoreGreater: Int, $scoreLesser: Int, $isAdult: Boolean,
  $sort: [MediaSort], $startGreater: FuzzyDateInt, $startLesser: FuzzyDateInt,
  $type: MediaType
) {
  Page(page: $page, perPage: $perPage) {
    %(page_info)s
    media(
      type: $type,
      search: $search,
      format: $format,
      status: $status,
      genre_in: $genreIn,
      genre_not_in: $genreNotIn,
      averageScore_greater: $scoreGreater,
      averageScore_lesser: $scoreLesser,
      isAdult: $isAdult,
      sort: $sort,
      startDate_greater: $startGreater,
      startDate_lesser: $startLesser
    ) { %(media)s }
  }
}
""" % {"page_info": PAGE_INFO, "media": MEDIA_FIELDS}

TOP_ANIME = """
query (
  $page: Int, $perPage: Int, $sort: [MediaSort], $status: MediaStatus,
  $format: MediaFormat, $type: MediaType
) {
  Page(page: $page, perPage: $perPage) {
    %(page_info)s
    media(type: $type, format: $format, status: $status, sort: $sort) { %(media)s }
  }
}
""" % {"page_info": PAGE_INFO, "media": MEDIA_FIELDS}

SEASONAL_ANIME = """
query (
  $page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int,
  $format: MediaFormat, $type: MediaType
) {
  Page(page: $page, perPage: $perPage) {
    %(page_info)s
    media(
      type: $type, format: $format, season: $season, seasonYear: $seasonYear,
      sort: [POPULARITY_DESC]
    ) { %(media)s }
  }
}
""" % {"page_info": PAGE_INFO, "media": MEDIA_FIELDS}

SCHEDULE_WINDOW = """
query ($from: Int, $to: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    %(page_info)s
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      airingAt
      episode
      media { %(media)s }
    }
  }
}
""" % {"page_info": PAGE_INFO, "media": MEDIA_FIELDS}

MEDIA_BY_MAL_ID = """
query ($idMal: Int) { Media(idMal: $idMal) { %s } }
""" % MEDIA_FIELDS

MEDIA_BY_MAL_ID_FULL = """
query ($idMal: Int) { Media(idMal: $idMal) { %s %s } }
""" % (MEDIA_FIELDS, EXTRA_DETAIL_FIELDS)

MEDIA_BY_ID = """
query ($id: Int) { Media(id: $id) { %s } }
""" % MEDIA_FIELDS

MEDIA_BY_ID_FULL = """
query ($id: Int) { Media(id: $id) { %s %s } }
""" % (MEDIA_FIELDS, EXTRA_DETAIL_FIELDS)

# AniList has no random endpoint, so a page of the popularity ranking is
# sampled instead and one entry is taken from it.
RANDOM_ANIME = """
query ($page: Int) {
  Page(page: $page, perPage: 1) {
    media(type: ANIME, sort: [POPULARITY_DESC]) { %s }
  }
}
""" % MEDIA_FIELDS

GENRE_COLLECTION = """
query { GenreCollection }
"""
