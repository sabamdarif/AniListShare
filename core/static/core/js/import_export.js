// ── ODS Import / Export ─────────────────────────────────────────────────
(function () {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     Helpers
     ═══════════════════════════════════════════════════════════════════ */

  var profileBtn = document.getElementById("user_profile_btn");
  var ringFill = document.querySelector(".export_ring_fill");
  var CIRCUMFERENCE = 113; // 2*π*18 ≈ 113

  function setExportProgress(pct) {
    if (!ringFill) return;
    var offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
    ringFill.style.strokeDashoffset = offset;
  }

  /* ═══════════════════════════════════════════════════════════════════
     EXPORT
     ═══════════════════════════════════════════════════════════════════ */
  var exportBtn = document.getElementById("export_btn");
  var _exportAbort = null;
  var _exporting = false;

  function formatSeasons(seasons) {
    if (!seasons || !seasons.length) return "";
    return seasons
      .map(function (s) {
        var label;
        if (s.number % 1 !== 0) {
          var after = Math.floor(s.number);
          label = "OVA(after S" + after + ")";
        } else {
          label = "S" + Math.floor(s.number);
        }
        var text = label + ": " + s.watched_episodes + "/" + s.total_episodes;
        if (s.comment) text += " [" + s.comment + "]";
        return text;
      })
      .join(", ");
  }

  async function doExport() {
    if (_exporting) return;
    _exporting = true;
    _exportAbort = new AbortController();
    var signal = _exportAbort.signal;

    profileBtn.classList.add("exporting");
    setExportProgress(0);

    try {
      // 1. Fetch categories
      var catRes = await apiFetch("/api/anime/category/", {
        credentials: "same-origin",
        signal: signal,
      });
      if (!catRes.ok) throw new Error("Failed to fetch categories");
      var categories = await catRes.json();
      if (!Array.isArray(categories)) categories = categories.results || [];

      if (categories.length === 0) {
        throw new Error("No categories to export");
      }

      var wb = XLSX.utils.book_new();
      var total = categories.length;

      // 2. For each category, fetch anime and build a sheet
      for (var i = 0; i < total; i++) {
        if (signal.aborted) throw new Error("Cancelled");

        var cat = categories[i];
        var animeRes = await apiFetch(
          "/api/anime/list/category/" + cat.id + "/",
          {
            credentials: "same-origin",
            signal: signal,
          },
        );
        if (!animeRes.ok) throw new Error("Failed to fetch anime");
        var animeList = await animeRes.json();
        if (!Array.isArray(animeList)) animeList = animeList.results || [];

        // Build sheet data
        var sheetData = [
          ["Name", "Season", "Language", "Stars", "Thumbnail URL"],
        ];

        for (var j = 0; j < animeList.length; j++) {
          var a = animeList[j];
          sheetData.push([
            a.name || "",
            formatSeasons(a.seasons),
            a.language || "",
            a.stars != null ? a.stars : "",
            a.thumbnail_url || "",
          ]);
        }

        var ws = XLSX.utils.aoa_to_sheet(sheetData);

        // Set column widths for readability
        ws["!cols"] = [
          { wch: 30 }, // Name
          { wch: 45 }, // Season
          { wch: 12 }, // Language
          { wch: 6 }, // Stars
          { wch: 50 }, // Thumbnail URL
        ];

        // Sanitize sheet name (max 31 chars, no special chars)
        var sheetName = cat.name
          .replace(/[\\\/\?\*\[\]]/g, "_")
          .substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Update progress
        setExportProgress(((i + 1) / total) * 100);
      }

      if (signal.aborted) throw new Error("Cancelled");

      // 3. Write and download
      XLSX.writeFile(wb, "animelist.ods", { bookType: "ods" });

      // Flash done animation
      profileBtn.classList.remove("exporting");
      profileBtn.classList.add("export_done");
      setTimeout(function () {
        profileBtn.classList.remove("export_done");
      }, 600);
    } catch (e) {
      if (e.name !== "AbortError" && e.message !== "Cancelled") {
        console.error("Export failed:", e);
        // Show a simple toast-style alert, if a global toast function exists
        if (typeof window.showToast === "function") {
          window.showToast("Export failed: " + e.message, "error");
        }
      }
      profileBtn.classList.remove("exporting");
      setExportProgress(0);
    } finally {
      _exporting = false;
      _exportAbort = null;
    }
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", function (e) {
      e.preventDefault();
      // Close dropdown
      var dropdown = document.getElementById("user_dropdown_menu");
      if (dropdown) dropdown.classList.remove("open");
      doExport();
    });
  }

  // Cancel export if user closes tab
  window.addEventListener("beforeunload", function () {
    if (_exportAbort) {
      _exportAbort.abort();
      _exportAbort = null;
      _exporting = false;
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     IMPORT
     ═══════════════════════════════════════════════════════════════════ */
  var importBtn = document.getElementById("import_btn");
  var importOverlay = document.getElementById("import_overlay");
  var importModal = document.getElementById("import_modal");
  var importCloseBtn = document.getElementById("import_close_btn");
  var importDropzone = document.getElementById("import_dropzone");
  var importFileInput = document.getElementById("import_file_input");
  var importFileInfo = document.getElementById("import_file_info");
  var importFileName = document.getElementById("import_file_name");
  var importFileRemove = document.getElementById("import_file_remove");
  var importStartBtn = document.getElementById("import_start_btn");
  var importProgressWrapper = document.getElementById(
    "import_progress_wrapper",
  );
  var importProgressFill = document.getElementById("import_progress_fill");
  var importProgressText = document.getElementById("import_progress_text");
  var importProgressPct = document.getElementById("import_progress_pct");
  var importStatus = document.getElementById("import_status");

  var _importFile = null;
  var _importing = false;

  function openImportModal() {
    if (!importOverlay || !importModal) return;
    importOverlay.classList.add("open");
    importModal.classList.add("open");
    resetImportState();
  }

  function closeImportModal() {
    if (_importing) return; // don't close during import
    if (importOverlay) importOverlay.classList.remove("open");
    if (importModal) importModal.classList.remove("open");
    resetImportState();
  }

  function resetImportState() {
    _importFile = null;
    if (importFileInput) importFileInput.value = "";
    if (importFileInfo) importFileInfo.classList.remove("visible");
    if (importStartBtn) importStartBtn.classList.remove("visible");
    if (importProgressWrapper)
      importProgressWrapper.classList.remove("visible");
    if (importProgressFill) importProgressFill.style.width = "0%";
    if (importStatus) {
      importStatus.classList.remove("visible", "success", "error");
      importStatus.textContent = "";
    }
    if (importDropzone) importDropzone.style.display = "";
  }

  function selectFile(file) {
    if (!file) return;
    var ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "ods") {
      if (importStatus) {
        importStatus.textContent = "Please select an .ods file";
        importStatus.classList.remove("success");
        importStatus.classList.add("visible", "error");
      }
      return;
    }
    _importFile = file;
    if (importFileName) importFileName.textContent = file.name;
    if (importFileInfo) importFileInfo.classList.add("visible");
    if (importStartBtn) importStartBtn.classList.add("visible");
    if (importStatus) importStatus.classList.remove("visible");
  }

  // Open modal
  if (importBtn) {
    importBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var dropdown = document.getElementById("user_dropdown_menu");
      if (dropdown) dropdown.classList.remove("open");
      openImportModal();
    });
  }

  // Close modal
  if (importCloseBtn)
    importCloseBtn.addEventListener("click", closeImportModal);
  if (importOverlay) importOverlay.addEventListener("click", closeImportModal);

  // Dropzone click → trigger file input
  if (importDropzone && importFileInput) {
    importDropzone.addEventListener("click", function () {
      importFileInput.click();
    });

    importFileInput.addEventListener("change", function () {
      if (this.files && this.files[0]) selectFile(this.files[0]);
    });

    // Drag & drop
    importDropzone.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.add("dragover");
    });

    importDropzone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove("dragover");
    });

    importDropzone.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Remove selected file
  if (importFileRemove) {
    importFileRemove.addEventListener("click", function (e) {
      e.stopPropagation();
      _importFile = null;
      if (importFileInput) importFileInput.value = "";
      if (importFileInfo) importFileInfo.classList.remove("visible");
      if (importStartBtn) importStartBtn.classList.remove("visible");
    });
  }

  // Parse season string back to objects
  function parseSeasons(seasonStr) {
    if (!seasonStr || !seasonStr.trim()) return [];
    var seasons = [];
    var ovaCounters = {}; // Maps season number to how many OVAs we've seen

    // Matches e.g. "S1: 5/12 [comment]" or "OVA(after S1): 2/3"
    var regex =
      /(?:S(\d+)|OVA\(after S(\d+)\)):\s*(\d+)\/(\d+)(?:\s*\[([^\]]*)\])?/gi;
    var match;

    while ((match = regex.exec(seasonStr)) !== null) {
      var sMatch = match[1];
      var ovaMatch = match[2];
      var watched = parseInt(match[3]);
      var total = parseInt(match[4]);
      var comment = match[5] ? match[5].trim() : "";
      var number;

      if (ovaMatch !== undefined) {
        var baseNum = parseInt(ovaMatch);
        ovaCounters[baseNum] = (ovaCounters[baseNum] || 0) + 1;
        number = Number((baseNum + ovaCounters[baseNum] * 0.01).toFixed(2));
      } else if (sMatch !== undefined) {
        number = parseInt(sMatch);
      } else {
        continue;
      }

      seasons.push({
        number: number,
        total_episodes: total,
        watched_episodes: watched,
        comment: comment,
      });
    }
    return seasons;
  }

  // Start import
  if (importStartBtn) {
    importStartBtn.addEventListener("click", async function () {
      if (!_importFile || _importing) return;
      _importing = true;
      importStartBtn.disabled = true;
      importStartBtn.classList.add("btn_loading");
      importStartBtn.innerHTML =
        '<span class="btn_spinner"></span> Importing\u2026';
      if (importDropzone) importDropzone.style.display = "none";
      if (importFileRemove) importFileRemove.style.display = "none";
      if (importProgressWrapper) importProgressWrapper.classList.add("visible");

      try {
        // Read file
        var buffer = await _importFile.arrayBuffer();
        var wb = XLSX.read(new Uint8Array(buffer), { type: "array" });

        var sheetNames = wb.SheetNames;
        if (!sheetNames.length) throw new Error("No sheets found in the file");

        // Count total anime across all sheets for progress
        var totalAnime = 0;
        var sheetDataMap = [];

        for (var s = 0; s < sheetNames.length; s++) {
          var ws = wb.Sheets[sheetNames[s]];
          var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
          // Skip header row
          var dataRows = rows.slice(1).filter(function (r) {
            return r && r.length > 0 && r[0];
          });
          totalAnime += dataRows.length;
          sheetDataMap.push({ name: sheetNames[s], rows: dataRows });
        }

        var processed = 0;

        function updateProgress(text) {
          if (importProgressText) importProgressText.textContent = text;
          var pct =
            totalAnime > 0 ? Math.round((processed / totalAnime) * 100) : 0;
          if (importProgressFill) importProgressFill.style.width = pct + "%";
          if (importProgressPct) importProgressPct.textContent = pct + "%";
        }

        // Fetch existing categories to check for duplicates
        var existingCatRes = await apiFetch("/api/anime/category/", {
          credentials: "same-origin",
        });
        var existingCats = await existingCatRes.json();
        if (!Array.isArray(existingCats))
          existingCats = existingCats.results || [];

        for (var si = 0; si < sheetDataMap.length; si++) {
          var sheetInfo = sheetDataMap[si];
          var categoryName = sheetInfo.name;

          updateProgress("Creating category: " + categoryName + "…");

          // Find or create category
          var catId = null;
          for (var c = 0; c < existingCats.length; c++) {
            if (existingCats[c].name === categoryName) {
              catId = existingCats[c].id;
              break;
            }
          }

          if (!catId) {
            var catCreateRes = await apiFetch("/api/anime/category/", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ name: categoryName }),
            });
            if (!catCreateRes.ok)
              throw new Error("Failed to create category: " + categoryName);
            var newCat = await catCreateRes.json();
            catId = newCat.id;
            existingCats.push(newCat);
          }

          // Fetch existing anime in this category for duplicate check
          var existingAnimeRes = await apiFetch(
            "/api/anime/list/category/" + catId + "/",
            { credentials: "same-origin" },
          );
          var existingAnime = await existingAnimeRes.json();
          if (!Array.isArray(existingAnime))
            existingAnime = existingAnime.results || [];

          // Build name→anime map for duplicate detection
          var animeByName = {};
          for (var ea = 0; ea < existingAnime.length; ea++) {
            animeByName[existingAnime[ea].name] = existingAnime[ea];
          }

          // Process each row
          for (var ri = 0; ri < sheetInfo.rows.length; ri++) {
            var row = sheetInfo.rows[ri];
            var animeName = String(row[0] || "").trim();
            if (!animeName) {
              processed++;
              updateProgress("Skipping empty row…");
              continue;
            }

            var seasonStr = row[1] != null ? String(row[1]) : "";
            var language = row[2] != null ? String(row[2]).trim() : "";
            var stars =
              row[3] != null && row[3] !== "" ? parseFloat(row[3]) : null;
            var thumbnailUrl = row[4] != null ? String(row[4]).trim() : "";

            var seasons = parseSeasons(seasonStr);
            if (isNaN(stars)) stars = null;

            var payload = {
              name: animeName,
              thumbnail_url: thumbnailUrl,
              language: language,
              stars: stars,
              seasons: seasons,
            };

            var existing = animeByName[animeName];
            if (existing) {
              // Update existing anime
              await apiFetch(
                "/api/anime/list/category/" + catId + "/" + existing.id + "/",
                {
                  method: "PUT",
                  credentials: "same-origin",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                },
              );
            } else {
              // Create new anime
              await apiFetch("/api/anime/list/category/" + catId + "/", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
              });
            }

            processed++;
            updateProgress("Importing: " + animeName);
          }
        }

        // Done
        updateProgress("Import complete!");
        if (importProgressFill) importProgressFill.style.width = "100%";
        if (importProgressPct) importProgressPct.textContent = "100%";
        if (importStatus) {
          importStatus.textContent =
            "✓ Successfully imported " +
            processed +
            " anime entries. Reloading…";
          importStatus.classList.remove("error");
          importStatus.classList.add("visible", "success");
        }

        setTimeout(function () {
          window.location.reload();
        }, 1200);
      } catch (e) {
        console.error("Import failed:", e);
        if (importStatus) {
          importStatus.textContent = "Import failed: " + e.message;
          importStatus.classList.remove("success");
          importStatus.classList.add("visible", "error");
        }
        importStartBtn.disabled = false;
        importStartBtn.classList.remove("btn_loading");
        importStartBtn.textContent = "Start Import";
        if (importFileRemove) importFileRemove.style.display = "";
      } finally {
        _importing = false;
      }
    });
  }

  // Close on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeImportModal();
  });
})();
