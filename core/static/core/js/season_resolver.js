/**
 * SeasonResolver: season number -> total episodes, via /api/v4/ Sequel walking.
 *
 * Split cours (Part 2 / Cour 2) share a base title with their season and are
 * summed into it; movie/special sequels are passed through uncounted.
 *
 * Usage:
 *   window.SeasonResolver.resolveSeasonEpisodes(malId, name, season)
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

  async function walk(id, season) {
    var visited = new Set([id]);
    var data = await fetchFull(id);
    var seasonsSeen = 1;

    while (true) {
      var total = positive(data.episodes) ? data.episodes : null;

      // Absorb cour continuations (Part 2, Cour 2, ...) into this season.
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
        if (!positive(courEps) || visited.has(cour.mal_id)) return 0;
        total = (total || 0) + courEps;
        visited.add(cour.mal_id);
        data = await fetchFull(cour.mal_id);
      }

      if (seasonsSeen === season) return total || 0;

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

  return {
    // Resolves the total episode count of 1-based `season`, absorbing split
    // cours and skipping non-TV sequels. Resolves 0 on any failure.
    resolveSeasonEpisodes: async function (malId, name, season) {
      try {
        var id =
          malId != null ? malId : name ? await resolveSeasonId(name) : null;
        if (id == null || !(season >= 1)) return 0;
        return await walk(id, season);
      } catch (_) {
        return 0;
      }
    },
  };
})();
