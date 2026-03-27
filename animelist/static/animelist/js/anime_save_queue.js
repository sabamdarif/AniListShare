/**
 * AnimeSaveQueue — localStorage-backed queue that batches anime saves
 * and flushes them to the server periodically or on demand.
 *
 * Usage:
 *   AnimeSaveQueue.enqueue(animePayload);
 *   AnimeSaveQueue.getPending(categoryId?);  // for UI merge
 *   AnimeSaveQueue.hasPending();
 *   AnimeSaveQueue.flushNow();               // force-send
 */
(function () {
  "use strict";

  const STORAGE_KEY = "pending_anime_queue";
  const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
  const BULK_API = "/api/bulk-add-anime/";

  let _flushTimer = null;
  let _flushing = false;

  /* ── helpers ── */
  function getCSRF() {
    const el = document.querySelector("[name=csrfmiddlewaretoken]");
    if (el) return el.value;
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function readQueue() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch {
      /* storage full – very unlikely for small JSON */
    }
  }

  function clearQueue() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }

  /* ── notify UI about sync-state changes ── */
  function emitSyncEvent(type, detail) {
    window.dispatchEvent(
      new CustomEvent("anime-sync", { detail: { type, ...detail } }),
    );
  }

  /* ── timer management ── */
  function startTimer() {
    if (_flushTimer) return; // already ticking
    _flushTimer = setTimeout(() => {
      _flushTimer = null;
      flushNow();
    }, FLUSH_INTERVAL_MS);
  }

  function cancelTimer() {
    if (_flushTimer) {
      clearTimeout(_flushTimer);
      _flushTimer = null;
    }
  }

  /* ── core API ── */

  function enqueue(animeData) {
    const queue = readQueue();
    queue.push({
      ...animeData,
      _queuedAt: Date.now(),
      _tempId: "tmp_" + Math.random().toString(36).slice(2, 10),
    });
    writeQueue(queue);
    emitSyncEvent("enqueued", { pending: queue.length });
    startTimer();
  }

  async function flushNow() {
    if (_flushing) return;
    const queue = readQueue();
    if (!queue.length) return;

    _flushing = true;
    cancelTimer();
    emitSyncEvent("flush-start", { pending: queue.length });

    try {
      const resp = await fetch(BULK_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCSRF(),
        },
        body: JSON.stringify({ items: queue }),
      });

      if (resp.ok) {
        clearQueue();
        const data = await resp.json();
        emitSyncEvent("flush-ok", { created: data.created || [] });
      } else {
        // server error — keep queue, retry later
        emitSyncEvent("flush-fail", { status: resp.status });
        startTimer(); // retry after interval
      }
    } catch {
      // network error — keep queue, retry on next trigger
      emitSyncEvent("flush-fail", { status: 0 });
      startTimer();
    } finally {
      _flushing = false;
    }
  }

  /**
   * Use sendBeacon for unload events where async fetch isn't reliable.
   * Returns true if beacon was sent (queue had items).
   */
  function flushBeacon() {
    const queue = readQueue();
    if (!queue.length) return false;

    const blob = new Blob([JSON.stringify({ items: queue })], {
      type: "application/json",
    });

    const sent = navigator.sendBeacon(BULK_API, blob);
    if (sent) {
      clearQueue();
      cancelTimer();
    }
    return sent;
  }

  function getPending(categoryId) {
    const queue = readQueue();
    if (categoryId == null) return queue;
    return queue.filter((q) => String(q.category_id) === String(categoryId));
  }

  function hasPending() {
    return readQueue().length > 0;
  }

  /* ── auto-flush triggers ── */

  // 1. Tab close / navigate away
  window.addEventListener("beforeunload", () => {
    flushBeacon();
  });

  // 2. Page goes hidden (mobile tab switch, phone lock)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushBeacon();
    }
  });

  // 3. Browser comes back online
  window.addEventListener("online", () => {
    if (hasPending()) flushNow();
  });

  // 4. On page load — pick up any leftovers from a crash / previous session
  document.addEventListener("DOMContentLoaded", () => {
    if (hasPending()) flushNow();
  });

  // 5. Logout interception — handled in the module that owns the logout button
  //    (we expose flushNow so it can await it).

  /* ── public interface ── */
  window.AnimeSaveQueue = {
    enqueue,
    flushNow,
    flushBeacon,
    getPending,
    hasPending,
    FLUSH_INTERVAL_MS,
  };
})();
