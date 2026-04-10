// core/static/core/js/jwt_auth.js

let jwtAccessToken = window.__INITIAL_JWT_ACCESS__ || null; // fallback
let jwtRefreshToken = window.__INITIAL_JWT_REFRESH__ || null; // fallback

let initialTokenPromise = null;

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

// Custom fetch wrapper for API calls
async function apiFetch(url, options = {}) {
  if (!options.headers) {
    options.headers = {};
  }

  // Await the token strictly if this is an internal API call
  if (url.startsWith("/api/")) {
    await ensureToken();
  }

  // Attach access token only for internal API edges
  if (jwtAccessToken && url.startsWith("/api/")) {
    options.headers["Authorization"] = `Bearer ${jwtAccessToken}`;
  }

  let response = await fetch(url, options);

  // If 401 Unauthorized, token might be expired. Try to refresh.
  if (response.status === 401 && jwtRefreshToken && url.startsWith("/api/")) {
    try {
      const refreshResponse = await fetch("/api/v1/token/refresh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: jwtRefreshToken }),
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        jwtAccessToken = refreshData.access;
        if (refreshData.refresh) {
          jwtRefreshToken = refreshData.refresh; // Update if rotation is on
        }

        // Retry the original request
        options.headers["Authorization"] = `Bearer ${jwtAccessToken}`;
        response = await fetch(url, options);
      } else {
        console.warn("Refresh token expired. Cannot refresh.");
        jwtAccessToken = null;
        jwtRefreshToken = null;
        // Optional: redirect to login if required, but let the caller handle 401 otherwise.
        if (window.location.pathname !== "/accounts/login/") {
          window.location.href = "/accounts/login/";
        }
      }
    } catch (error) {
      console.error("Error during token refresh:", error);
    }
  }

  return response;
}

window.apiFetch = apiFetch;
