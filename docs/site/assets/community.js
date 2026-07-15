"use strict";

const catalog = document.querySelector("[data-ugc-catalog]");

if (catalog) {
  const search = catalog.querySelector("[data-ugc-search]");
  const filters = [...catalog.querySelectorAll("[data-ugc-filter]")];
  const items = [...catalog.querySelectorAll("[data-ugc-item]")];
  const count = catalog.querySelector("[data-ugc-count]");
  const empty = catalog.querySelector("[data-ugc-empty]");
  const locale = document.documentElement.lang === "en" ? "en-US" : "ko-KR";
  const countLabel = catalog.dataset.countLabel || "items";
  let activeFilter = "all";

  function updateCatalog() {
    const query = (search?.value || "").trim().toLocaleLowerCase(locale);
    let visibleCount = 0;

    for (const item of items) {
      const kind = item.dataset.kind || "";
      const searchable = (item.dataset.search || "").toLocaleLowerCase(locale);
      const matchesType = activeFilter === "all" || kind === activeFilter;
      const matchesQuery = !query || searchable.includes(query);
      const visible = matchesType && matchesQuery;
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    }

    if (count) count.textContent = `${visibleCount}${countLabel}`;
    if (empty) empty.hidden = visibleCount !== 0;
  }

  for (const button of filters) {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.ugcFilter || "all";
      for (const candidate of filters) {
        const selected = candidate === button;
        candidate.classList.toggle("active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      }
      updateCatalog();
    });
  }

  search?.addEventListener("input", updateCatalog);
  updateCatalog();
}
