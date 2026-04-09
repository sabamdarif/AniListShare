(function () {
  "use strict";

  // State
  let queue = [];
  let syncTimer = null;
  const SYNC_DELAY = 1500; // 1.5 seconds

  // Temporary ID generator
  function generateTempId() {
    return "temp_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  }

  // Save to persistence
  function saveToLocal() {
    if (queue.length > 0) {
      localStorage.setItem("anime_sync_queue", JSON.stringify(queue));
    } else {
      localStorage.removeItem("anime_sync_queue");
    }
  }

  // Load from persistence on startup
  function loadFromLocal() {
    try {
      const stored = localStorage.getItem("anime_sync_queue");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          queue = parsed;
          // Trigger immediate flush since it's from a previous session
          flushQueue();
        }
      }
    } catch (e) {
      console.error("Failed to load sync queue", e);
    }
  }

  // The Bulk Sync API Caller
  async function performSync(actionsPayload) {
    if (!actionsPayload || actionsPayload.length === 0) return;

    try {
      const resp = await window.apiFetch("/api/v1/animes/bulk_sync/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: actionsPayload }),
      });

      if (!resp.ok) throw new Error("Bulk API failed");

      const data = await resp.json();

      // Update local storage ID mapping
      const map = data.created_ids || {};
      if (typeof window.resolveAnimeIds === "function") {
        window.resolveAnimeIds(map);
      }
    } catch (err) {
      console.error("Sync failed", err);
      // Revert UI to match server
      if (typeof window.refreshCurrentCategory === "function") {
        window.refreshCurrentCategory();
      }
      // Re-throw to caller context if needed, but this is background
      if (typeof window.AnimeModalBase !== "undefined") {
        // generic toast
      }
    }
  }

  // Flush logic
  function flushQueue() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = null;

    if (queue.length === 0) return;

    const payload = queue.slice();
    queue = []; // clear immediately
    saveToLocal(); // clear local storage

    performSync(payload);
  }

  // Before unload handler to guarantee transmission
  window.addEventListener("beforeunload", function () {
    if (queue.length > 0) {
      const payload = JSON.stringify({ actions: queue });
      const token =
        window.__INITIAL_JWT_ACCESS__ ||
        localStorage.getItem("anime_jwt_access");

      // CRITICAL: We clear localStorage here because we are handing off the payload
      // to the browser's native background keepalive fetch. If the browser crashed
      // instead of closing gracefully, this event wouldn't fire, preserving the queue!
      localStorage.removeItem("anime_sync_queue");

      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      queue = [];

      fetch("/api/v1/animes/bulk_sync/", {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? "Bearer " + token : "",
        },
        body: payload,
      }).catch(() => {});
    }
  });

  window.SyncQueue = {
    generateTempId: generateTempId,
    pushAction: function (action) {
      // Squash logic
      if (action.type === "UPDATE") {
        const targetId = action.id || action.temp_id;
        let found = false;
        for (let i = 0; i < queue.length; i++) {
          const q = queue[i];
          const qTargetId = q.id || q.temp_id;
          if (qTargetId === targetId) {
            if (q.type === "CREATE" || q.type === "UPDATE") {
              Object.assign(q.data, action.data);
              found = true;
              break;
            }
          }
        }
        if (!found) queue.push(action);
      } else if (action.type === "DELETE") {
        const targetId = action.id || action.temp_id;
        let removedFromQueue = false;
        for (let i = queue.length - 1; i >= 0; i--) {
          const q = queue[i];
          const qTargetId = q.id || q.temp_id;
          if (qTargetId === targetId) {
            if (q.type === "CREATE") {
              queue.splice(i, 1);
              removedFromQueue = true;
            } else if (q.type === "UPDATE") {
              queue.splice(i, 1);
            }
          }
        }
        if (!removedFromQueue && action.id) {
          queue.push(action);
        }
      } else {
        queue.push(action);
      }

      saveToLocal();

      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(flushQueue, SYNC_DELAY);
    },
    flushNow: function () {
      flushQueue();
    },
  };

  document.addEventListener("DOMContentLoaded", loadFromLocal);
})();
