// core/static/core/js/jwt_auth.js

let jwtAccessToken = window.__INITIAL_JWT_ACCESS__ || null; // fallback
let jwtRefreshToken = window.__INITIAL_JWT_REFRESH__ || null; // fallback

let initialTokenPromise = null;
let refreshTokenPromise = null; // Prevent concurrent refresh requests

// Export token getter for sync_queue to use during beforeunload
window.getJwtAccessToken = function () {
  return jwtAccessToken;
};

function isTokenExpired(token) {
  if (!token) return true;
  try {
    let base64Url = token.split(".")[1];
    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    // Pad with '=' so length is a multiple of 4
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
    // 10 second buffer
    return payload.exp * 1000 <= Date.now() + 10000;
  } catch (e) {
    return true;
  }
}

// Helper to get CSRF cookie
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

async function ensureToken() {
  if (jwtAccessToken) return true;
  if (window.__USER_IS_AUTHENTICATED__ === false) return false;

  if (!initialTokenPromise) {
    const csrftoken = getCookie("csrftoken");
    initialTokenPromise = fetch("/api/v1/token/session/", {
      method: "POST", // Changed to POST for security
      headers: {
        Accept: "application/json",
        "X-CSRFToken": csrftoken,
      },
    })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data) {
          jwtAccessToken = data.access;
          jwtRefreshToken = data.refresh;
        }
        return !!data;
      })
      .catch((err) => {
        console.error("Failed to fetch session tokens:", err);
        return false;
      });
  }
  return await initialTokenPromise;
}

async function performRefresh() {
  if (refreshTokenPromise) return await refreshTokenPromise;

  refreshTokenPromise = fetch("/api/v1/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: jwtRefreshToken }),
  })
    .then(async (refreshResponse) => {
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        jwtAccessToken = refreshData.access;
        if (refreshData.refresh) {
          jwtRefreshToken = refreshData.refresh;
        }
        return true;
      } else {
        console.warn("Refresh token expired. Cannot refresh.");
        jwtAccessToken = null;
        jwtRefreshToken = null;
        if (window.location.pathname !== "/accounts/login/") {
          window.location.href = "/accounts/login/";
        }
        return false;
      }
    })
    .catch((error) => {
      console.error("Error during token refresh:", error);
      return false;
    })
    .finally(() => {
      refreshTokenPromise = null;
    });

  return await refreshTokenPromise;
}

// Parse DRF validation error response into human-readable messages
function parseDRFErrors(data) {
  const msgs = [];
  if (typeof data === "string") {
    msgs.push(data);
  } else if (Array.isArray(data)) {
    data.forEach((item) => msgs.push(String(item)));
  } else if (data && typeof data === "object") {
    // DRF returns { field: ["error1", ...], ... } or { detail: "..." }
    if (data.detail) {
      msgs.push(String(data.detail));
    } else {
      for (const [field, errors] of Object.entries(data)) {
        const errList = Array.isArray(errors) ? errors : [errors];
        errList.forEach((e) => {
          if (typeof e === "object" && e !== null) {
            // Nested errors (e.g. seasons -> watched_episodes)
            msgs.push(...parseDRFErrors(e));
          } else {
            const label = field === "non_field_errors" ? "" : `${field}: `;
            msgs.push(`${label}${e}`);
          }
        });
      }
    }
  }
  return msgs;
}

// Custom fetch wrapper for API calls
async function apiFetch(url, options = {}) {
  if (!options.headers) {
    options.headers = {};
  }

  // Await the token strictly if this is an internal API call
  if (url.startsWith("/api/")) {
    await ensureToken();

    // Proactively refresh if the token is expired/expiring soon
    if (jwtAccessToken && jwtRefreshToken && isTokenExpired(jwtAccessToken)) {
      await performRefresh();
    }
  }

  // Attach access token only for internal API edges
  if (jwtAccessToken && url.startsWith("/api/")) {
    options.headers["Authorization"] = `Bearer ${jwtAccessToken}`;
  }

  let response = await fetch(url, options);

  // If 401 Unauthorized, token might be expired. Try to refresh once more just in case.
  if (response.status === 401 && jwtRefreshToken && url.startsWith("/api/")) {
    const success = await performRefresh();
    if (success) {
      options.headers["Authorization"] = `Bearer ${jwtAccessToken}`;
      response = await fetch(url, options);
    }
  }

  // Auto-toast DRF validation errors (400) and server errors (405, 500, etc.)
  if (
    url.startsWith("/api/") &&
    response.status >= 400 &&
    response.status !== 401
  ) {
    try {
      const cloned = response.clone();
      const errData = await cloned.json();
      const msgs = parseDRFErrors(errData);
      if (msgs.length && typeof window._animeModalShowToast === "function") {
        msgs.forEach((m) => window._animeModalShowToast(m, "error"));
      }
    } catch (_) {
      // Response wasn't JSON — skip
    }
  }

  return response;
}

window.apiFetch = apiFetch;
