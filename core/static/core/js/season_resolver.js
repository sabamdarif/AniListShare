/**
 * SeasonResolver: season/extra -> total episodes, via /api/v4/ Sequel walking.
 *
 * Split cours (Part 2 / Cour 2) share a base title with their season and are
 * summed into it; movie/special sequels are passed through uncounted. Extras
 * (OVA, Special) resolve by release date: the nth extra row after season K
 * takes the nth matching relation whose start date is at or after season K's.
 *
 * Usage:
 *   window.SeasonResolver.resolveSeasonEpisodes(malId, name, season)
 *   window.SeasonResolver.resolveExtraEpisodes(malId, name, kind, afterSeason, ordinal)
 *     .then(function (total) { ... });   // 0 when unresolvable
 */
window.SeasonResolver = (function () {
  "use strict";

  var JIKAN = "/api/v4/anime";
  var COUNTABLE = { TV: true, TV_SHORT: true, ONA: true };
  var COUR_MARKER_RE =
    /\b(part\s*\d+|cour\s*\d+|zenpen|kouhen|kanketsu(-hen)?)\b/gi;
  var PUNCT_RE = /[^\p{L}\p{N}]+/gu;

  // Markers go before punctuation stripping: "Kanketsu-hen" would otherwise
  // become "kanketsu hen" and the kanketsu(-hen)? rule could never match.
  function baseTitle(name) {
    return String(name || "")
      .toLowerCase()
      .replace(COUR_MARKER_RE, " ")
      .replace(PUNCT_RE, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // /full responses are memoized because the banner batch fill re-walks
  // shared prefixes once per target season of the same show.
  var fullCache = new Map();

  function fetchFull(id) {
    if (!fullCache.has(id)) {
      var promise = fetch(JIKAN + "/" + id + "/full").then(function (resp) {
        if (!resp.ok) throw new Error("Anime API HTTP " + resp.status);
        return resp.json().then(function (payload) {
          return payload.data || {};
        });
      });
      promise.catch(function () {
        fullCache.delete(id);
      });
      fullCache.set(id, promise);
    }
    return fullCache.get(id);
  }

  function animeSequels(data) {
    var out = [];
    (data.relations || []).forEach(function (group) {
      if (group.relation !== "Sequel") return;
      (group.entry || []).forEach(function (entry) {
        if (entry.type === "anime" && entry.mal_id != null) out.push(entry);
      });
    });
    return out;
  }

  function resolveSeasonId(name) {
    return fetch(JIKAN + "?q=" + encodeURIComponent(name) + "&limit=1")
      .then(function (resp) {
        if (!resp.ok) throw new Error("Anime API HTTP " + resp.status);
        return resp.json();
      })
      .then(function (payload) {
        var first = (payload.data || [])[0];
        return first && first.mal_id != null ? first.mal_id : null;
      });
  }

  function positive(n) {
    return typeof n === "number" && n > 0;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function dateKey(parts) {
    if (!parts || !parts.year) return null;
    return parts.year * 10000 + (parts.month || 1) * 100 + (parts.day || 1);
  }

  // The cour-absorb step shared by both walks: returns the summed episodes of
  // `data` plus its same-base-title Sequel chain, and the chain's last entry.
  async function absorbCours(data, visited) {
    var total = positive(data.episodes) ? data.episodes : null;
    while (true) {
      var base = baseTitle(data.title);
      var cour = animeSequels(data).find(function (e) {
        var entryBase = baseTitle(e.name);
        return base !== "" && entryBase === base;
      });
      if (!cour) break;
      var courEps = hasOwn(cour, "episodes")
        ? cour.episodes
        : (await fetchFull(cour.mal_id)).episodes;
      if (!positive(courEps) || visited.has(cour.mal_id)) return null;
      total = (total || 0) + courEps;
      visited.add(cour.mal_id);
      data = await fetchFull(cour.mal_id);
    }
    return { total: total, tail: data };
  }

  async function walk(id, season) {
    var visited = new Set([id]);
    var data = await fetchFull(id);
    var seasonsSeen = 1;

    while (true) {
      var absorbed = await absorbCours(data, visited);
      if (!absorbed) return 0;
      data = absorbed.tail;

      if (seasonsSeen === season) return absorbed.total || 0;

      // Advance one season, passing through movies/specials uncounted.
      var next = null;
      while (true) {
        var entries = animeSequels(data);
        // Cached /full payloads from before format existed degrade to the
        // legacy first-sequel pick instead of failing the whole walk.
        if (
          !entries.some(function (e) {
            return hasOwn(e, "format");
          })
        ) {
          next = entries[0] || null;
          break;
        }
        var currentBase = baseTitle(data.title);
        var cand = entries.find(function (e) {
          return currentBase === "" || baseTitle(e.name) !== currentBase;
        });
        if (!cand || visited.has(cand.mal_id)) break;
        if (COUNTABLE[cand.format]) {
          next = cand;
          break;
        }
        visited.add(cand.mal_id);
        data = await fetchFull(cand.mal_id);
      }
      if (!next || visited.has(next.mal_id)) return 0;
      visited.add(next.mal_id);
      seasonsSeen += 1;
      data = await fetchFull(next.mal_id);
    }
  }

  // The nth extra (ova|special) after season K: the nth matching relation by
  // release date at or after K's start date. Split extras sum their cours.
  async function walkExtras(id, kind, afterSeason, ordinal) {
    var FORMATS =
      kind === "ova" ? { OVA: true } : { SPECIAL: true, ONA: true, TV_SHORT: true };
    // Character links are cameos (Isekai Quartet), not extras of this show.
    var RELATIONS = {
      Sequel: true,
      "Side story": true,
      Alternative: true,
      Other: true,
      Prequel: true,
    };

    var visited = new Set([id]);
    var data = await fetchFull(id);
    var anchor = null;
    var candidates = [];
    var seasonsSeen = 1;

    while (true) {
      var absorbed = await absorbCours(data, visited);
      if (!absorbed) return 0;
      data = absorbed.tail;

      (data.relations || []).forEach(function (group) {
        if (!RELATIONS[group.relation]) return;
        (group.entry || []).forEach(function (entry) {
          if (
            entry.type === "anime" &&
            entry.mal_id != null &&
            FORMATS[entry.format] &&
            !visited.has(entry.mal_id)
          ) {
            candidates.push(entry);
          }
        });
      });

      var start =
        data.aired && data.aired.prop && data.aired.prop.from
          ? data.aired.prop.from
          : null;
      if (seasonsSeen === afterSeason) {
        anchor = dateKey(start);
        break;
      }

      // Advance to the next season (cour-absorbed), same rule as the walk.
      var entries = animeSequels(data);
      var currentBase = baseTitle(data.title);
      var next = null;
      for (var i = 0; i < entries.length; i++) {
        var cand = entries[i];
        if (visited.has(cand.mal_id)) continue;
        if (currentBase !== "" && baseTitle(cand.name) === currentBase)
          continue;
        if (hasOwn(cand, "format") && !COUNTABLE[cand.format]) continue;
        next = cand;
        break;
      }
      if (!next) {
        anchor = dateKey(start);
        break;
      }
      visited.add(next.mal_id);
      seasonsSeen += 1;
      data = await fetchFull(next.mal_id);
    }

    // Entries without a date sort last so they never shadow a dated one.
    candidates.sort(function (a, b) {
      return (dateKey(a.start_date) || Infinity) - (dateKey(b.start_date) || Infinity);
    });
    var eligible = candidates.filter(function (entry) {
      var key = dateKey(entry.start_date);
      return anchor == null || key == null || key >= anchor;
    });
    var pick = eligible[ordinal - 1];
    if (!pick) return 0;

    var picked = await fetchFull(pick.mal_id);
    var split = await absorbCours(picked, visited);
    if (!split) return 0;
    return split.total || 0;
  }

  async function resolveId(malId, name) {
    return malId != null ? malId : name ? await resolveSeasonId(name) : null;
  }

  return {
    // Resolves the total episode count of 1-based `season`, absorbing split
    // cours and skipping non-TV sequels. Resolves 0 on any failure.
    resolveSeasonEpisodes: async function (malId, name, season) {
      try {
        var id = await resolveId(malId, name);
        if (id == null || !(season >= 1)) return 0;
        return await walk(id, season);
      } catch (_) {
        return 0;
      }
    },

    // Resolves the total of the `ordinal`-th `kind` extra ("ova"/"special")
    // released at or after season `afterSeason`. Resolves 0 on any failure.
    resolveExtraEpisodes: async function (
      malId,
      name,
      kind,
      afterSeason,
      ordinal,
    ) {
      try {
        var id = await resolveId(malId, name);
        if (id == null || !(afterSeason >= 1) || !(ordinal >= 1)) return 0;
        return await walkExtras(id, kind, afterSeason, ordinal);
      } catch (_) {
        return 0;
      }
    },
  };
})();
