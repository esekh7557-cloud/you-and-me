const onReady = (callback) => {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
    return;
  }
  callback();
};

onReady(() => {
  window.requestAnimationFrame(() => {
    document.body.classList.remove("loading");
  });

  initMobileNav();
  initActiveNavigation();
  initRevealAnimations();
  initMenuFilters();
  initGalleryFilters();
  initLightbox();
  initForms();
  initYear();
});

function initMobileNav() {
  const toggle = document.querySelector("[data-mobile-toggle]");
  const nav = document.querySelector("[data-site-nav]");

  if (!toggle || !nav) {
    return;
  }

  const closeNav = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
  };

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("nav-open", isOpen);
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeNav);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNav();
    }
  });
}

function initActiveNavigation() {
  const page = location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll("[data-site-nav] a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === page || (page === "" && href === "index.html")) {
      link.setAttribute("aria-current", "page");
    }
  });
}

function initRevealAnimations() {
  const items = document.querySelectorAll(".reveal");

  if (!items.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  let delayCounter = 0;
  let delayTimer = null;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const target = entry.target;
        target.style.transitionDelay = `${delayCounter * 100}ms`;
        target.classList.add("is-visible");
        observer.unobserve(target);

        delayCounter++;

        clearTimeout(delayTimer);
        delayTimer = setTimeout(() => {
          delayCounter = 0;
        }, 100);
      });
    },
    { threshold: 0.14 }
  );

  items.forEach((item) => observer.observe(item));
}

function initMenuFilters() {
  const menuRoot = document.querySelector("[data-menu-root]");
  if (!menuRoot) {
    return;
  }

  const searchInput = menuRoot.querySelector("[data-menu-search]");
  const filterButtons = [...menuRoot.querySelectorAll("[data-menu-filter]")];
  const items = [...menuRoot.querySelectorAll("[data-menu-item]")];
  const emptyState = menuRoot.querySelector("[data-menu-empty]");

  let currentFilter = "all";

  const render = () => {
    const query = (searchInput?.value || "").trim().toLowerCase();
    let visibleCount = 0;

    items.forEach((item) => {
      const category = item.dataset.category || "";
      const haystack = [
        item.dataset.name || "",
        item.dataset.keywords || "",
        item.textContent || "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesFilter = currentFilter === "all" || category === currentFilter;
      const matchesQuery = haystack.includes(query);
      const isVisible = matchesFilter && matchesQuery;

      item.classList.toggle("hidden-card", !isVisible);
      if (isVisible) {
        visibleCount += 1;
      }
    });

    menuRoot.querySelectorAll("[data-menu-section]").forEach((section) => {
      const visibleItems = section.querySelectorAll("[data-menu-item]:not(.hidden-card)");
      section.classList.toggle("hidden-card", visibleItems.length === 0);
    });

    if (emptyState) {
      emptyState.style.display = visibleCount === 0 ? "block" : "none";
    }
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.menuFilter || "all";
      filterButtons.forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
      render();
    });
  });

  searchInput?.addEventListener("input", render);
  render();
}

function initGalleryFilters() {
  const galleryRoot = document.querySelector("[data-gallery-root]");
  if (!galleryRoot) {
    return;
  }

  const filterButtons = [...galleryRoot.querySelectorAll("[data-gallery-filter]")];
  const items = [...galleryRoot.querySelectorAll("[data-gallery-item]")];

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.galleryFilter || "all";

      filterButtons.forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });

      items.forEach((item) => {
        const category = item.dataset.category || "";
        const isVisible = filter === "all" || filter === category;
        item.classList.toggle("hidden-card", !isVisible);
      });
    });
  });
}

function initLightbox() {
  const lightbox = document.querySelector("[data-lightbox]");
  const triggers = document.querySelectorAll("[data-lightbox-src]");

  if (!lightbox || !triggers.length) {
    return;
  }

  const image = lightbox.querySelector("[data-lightbox-image]");
  const caption = lightbox.querySelector("[data-lightbox-caption]");
  const closeButtons = lightbox.querySelectorAll("[data-lightbox-close]");

  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nav-open");
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const src = trigger.dataset.lightboxSrc;
      const alt = trigger.dataset.lightboxAlt || "";
      const text = trigger.dataset.lightboxCaption || "";

      if (!src || !image || !caption) {
        return;
      }

      image.src = src;
      image.alt = alt;
      caption.textContent = text;
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("nav-open");
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeLightbox);
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
    }
  });
}

function initForms() {
  document.querySelectorAll("[data-demo-form]").forEach((form) => {
    const status = form.querySelector("[data-form-status]");

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      if (!form.reportValidity()) {
        return;
      }

      const firstName = form.querySelector("input[name='name']");
      const nameValue = firstName instanceof HTMLInputElement ? firstName.value.trim() : "";
      const label = form.dataset.successLabel || "Thanks";

      if (status) {
        status.textContent = `${label}${nameValue ? `, ${nameValue}` : ""}. We will get back to you shortly.`;
      }

      form.reset();
    });
  });
}

function initYear() {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
}
