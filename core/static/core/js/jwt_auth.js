// core/static/core/js/jwt_auth.js

let jwtAccessToken = window.__INITIAL_JWT_ACCESS__ || null;
let jwtRefreshToken = window.__INITIAL_JWT_REFRESH__ || null;

// Custom fetch wrapper for API calls
async function apiFetch(url, options = {}) {
  if (!options.headers) {
    options.headers = {};
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
