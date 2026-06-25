if (!window.localStorage.getItem('isLoggedIn') && !window.location.pathname.endsWith('login.html')) {
  window.location.href = 'login.html';
}

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

  initLogin();
  initMobileNav();
  initActiveNavigation();
  initRevealAnimations();
  initMenuFilters();
  initMenuOrders();
  initGalleryFilters();
  initLightbox();
  initForms();
  initAdminPanel();
  initYear();
});

const RESTAURANT_DB_NAME = "you-and-me-restaurant-local";
const RESTAURANT_DB_VERSION = 1;
const RESTAURANT_DB_STORES = ["reservations", "orders", "messages"];
const RESTAURANT_DB_FALLBACK_KEY = "youAndMeRestaurantLocalDatabase";
let restaurantDatabasePromise = null;
const dbChannel = new BroadcastChannel("restaurant-db-updates");

const restaurantDatabase = {
  async add(storeName, record) {
    const preparedRecord = {
      ...record,
      id: record.id || createRecordId(storeName),
      status: record.status || "new",
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await writeDatabaseRecord(storeName, preparedRecord);
    dbChannel.postMessage({ type: "update" });
    return preparedRecord;
  },

  async list(storeName) {
    const records = await listDatabaseRecords(storeName);
    return records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  },

  async update(storeName, id, changes) {
    const records = await this.list(storeName);
    const current = records.find((record) => record.id === id);

    if (!current) {
      throw new Error("Record not found");
    }

    const updated = {
      ...current,
      ...changes,
      updatedAt: new Date().toISOString(),
    };

    await writeDatabaseRecord(storeName, updated);
    dbChannel.postMessage({ type: "update" });
    return updated;
  },

  async delete(storeName, id) {
    await deleteDatabaseRecord(storeName, id);
    dbChannel.postMessage({ type: "update" });
  },

  async clear(storeName) {
    await clearDatabaseStore(storeName);
    dbChannel.postMessage({ type: "update" });
  },

  async mode() {
    try {
      await openRestaurantDatabase();
      return "IndexedDB";
    } catch (error) {
      return "localStorage fallback";
    }
  },
};

window.restaurantDatabase = restaurantDatabase;

function createRecordId(storeName) {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${storeName}-${Date.now()}-${randomPart}`;
}

function openRestaurantDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (restaurantDatabasePromise) {
    return restaurantDatabasePromise;
  }

  restaurantDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(RESTAURANT_DB_NAME, RESTAURANT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      RESTAURANT_DB_STORES.forEach((storeName) => {
        if (db.objectStoreNames.contains(storeName)) {
          return;
        }

        const store = db.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Database failed to open"));
    request.onblocked = () => reject(new Error("Database upgrade was blocked"));
  });

  return restaurantDatabasePromise;
}

function withDatabaseStore(storeName, mode, operation) {
  return openRestaurantDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      if (request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Database request failed"));
      } else {
        transaction.oncomplete = () => resolve();
      }

      transaction.onerror = () => reject(transaction.error || new Error("Database transaction failed"));
    });
  });
}

async function writeDatabaseRecord(storeName, record) {
  // Always write to localStorage so data is available across pages
  fallbackPutRecord(storeName, record);
  try {
    await withDatabaseStore(storeName, "readwrite", (store) => store.put(record));
  } catch (error) {
    // Already saved to localStorage above
  }
}

async function listDatabaseRecords(storeName) {
  // Always read from localStorage to guarantee data visibility
  const fallbackRecords = fallbackListRecords(storeName);
  try {
    const idbRecords = await withDatabaseStore(storeName, "readonly", (store) => store.getAll());
    // Merge: use a Map keyed by id, localStorage first, IndexedDB overwrites
    const merged = new Map();
    fallbackRecords.forEach((r) => merged.set(r.id, r));
    idbRecords.forEach((r) => merged.set(r.id, r));
    return [...merged.values()];
  } catch (error) {
    return fallbackRecords;
  }
}

async function deleteDatabaseRecord(storeName, id) {
  fallbackDeleteRecord(storeName, id);
  try {
    await withDatabaseStore(storeName, "readwrite", (store) => store.delete(id));
  } catch (error) {
    // Already deleted from localStorage above
  }
}

async function clearDatabaseStore(storeName) {
  fallbackClearRecords(storeName);
  try {
    await withDatabaseStore(storeName, "readwrite", (store) => store.clear());
  } catch (error) {
    // Already cleared from localStorage above
  }
}

function readFallbackDatabase() {
  const emptyDatabase = RESTAURANT_DB_STORES.reduce((database, storeName) => {
    database[storeName] = [];
    return database;
  }, {});

  try {
    const stored = window.localStorage.getItem(RESTAURANT_DB_FALLBACK_KEY);
    return stored ? { ...emptyDatabase, ...JSON.parse(stored) } : emptyDatabase;
  } catch (error) {
    return emptyDatabase;
  }
}

function writeFallbackDatabase(database) {
  try {
    window.localStorage.setItem(RESTAURANT_DB_FALLBACK_KEY, JSON.stringify(database));
  } catch (error) {
    // A full or blocked localStorage area means records cannot be persisted in fallback mode.
  }
}

function fallbackPutRecord(storeName, record) {
  const database = readFallbackDatabase();
  const records = database[storeName] || [];
  const index = records.findIndex((item) => item.id === record.id);

  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }

  database[storeName] = records;
  writeFallbackDatabase(database);
}

function fallbackListRecords(storeName) {
  return readFallbackDatabase()[storeName] || [];
}

function fallbackDeleteRecord(storeName, id) {
  const database = readFallbackDatabase();
  database[storeName] = (database[storeName] || []).filter((record) => record.id !== id);
  writeFallbackDatabase(database);
}

function fallbackClearRecords(storeName) {
  const database = readFallbackDatabase();
  database[storeName] = [];
  writeFallbackDatabase(database);
}

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

function initMenuOrders() {
  const menuRoot = document.querySelector("[data-menu-root]");
  if (!menuRoot) {
    return;
  }

  const shell = menuRoot.querySelector(".shell");
  const menuItems = [...menuRoot.querySelectorAll("[data-menu-item]")];

  if (!shell || !menuItems.length) {
    return;
  }

  let cart = readCart();
  const orderPanel = buildOrderPanel();
  const firstMenuSection = shell.querySelector("[data-menu-section]");
  shell.insertBefore(orderPanel, firstMenuSection);

  const list = orderPanel.querySelector("[data-order-list]");
  const total = orderPanel.querySelector("[data-order-total]");
  const count = orderPanel.querySelector("[data-order-count]");
  const form = orderPanel.querySelector("[data-order-form]");
  const status = orderPanel.querySelector("[data-form-status]");
  const submitButton = form?.querySelector("button[type='submit']");

  const renderCart = () => {
    if (!list || !total || !count) {
      return;
    }

    list.replaceChildren();

    if (!cart.length) {
      const empty = document.createElement("p");
      empty.className = "cart-empty";
      empty.textContent = "No dishes added yet.";
      list.append(empty);
    } else {
      cart.forEach((item) => list.append(buildCartItem(item)));
    }

    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const hasCustomPrice = cart.some((item) => item.price === 0);

    count.textContent = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
    total.textContent = hasCustomPrice
      ? `${formatMoney(subtotal)} + custom items`
      : formatMoney(subtotal);
    submitButton?.toggleAttribute("disabled", cart.length === 0);
    writeCart(cart);
  };

  const addToCart = (menuItem) => {
    const name = menuItem.dataset.name || menuItem.querySelector("h3")?.textContent?.trim() || "Menu item";
    const priceText = menuItem.querySelector(".price-tag")?.textContent?.trim() || "";
    const price = parseMenuPrice(priceText);
    const existing = cart.find((item) => item.name === name);

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.push({
        id: createRecordId("cart"),
        name,
        price,
        priceText,
        quantity: 1,
      });
    }

    if (status) {
      status.textContent = `${name} added to the order.`;
    }

    renderCart();
  };

  menuItems.forEach((menuItem) => {
    const menuCopy = menuItem.querySelector(".menu-copy");
    if (!menuCopy) {
      return;
    }

    const action = document.createElement("button");
    action.className = "menu-add-button";
    action.type = "button";
    action.textContent = "Add";
    action.addEventListener("click", () => addToCart(menuItem));
    menuCopy.append(action);
  });

  orderPanel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const id = button.dataset.cartId;
    const action = button.dataset.cartAction;
    const item = cart.find((cartItem) => cartItem.id === id);

    if (!item) {
      return;
    }

    if (action === "increase") {
      item.quantity += 1;
    }

    if (action === "decrease") {
      item.quantity -= 1;
    }

    if (action === "remove" || item.quantity <= 0) {
      cart = cart.filter((cartItem) => cartItem.id !== id);
    }

    renderCart();
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!(form instanceof HTMLFormElement) || !form.reportValidity() || !cart.length) {
      return;
    }

    const data = getFormValues(form);
    setFormBusy(form, true);

    const order = {
      customerName: data.name,
      phone: data.phone,
      email: data.email,
      orderType: data.orderType,
      date: data.date,
      time: data.time,
      notes: data.message,
      items: cart.map((item) => ({ ...item })),
      subtotal: cart.reduce((sum, item) => sum + item.quantity * item.price, 0),
      status: "new",
      source: "menu",
    };

    try {
      const savedOrder = await restaurantDatabase.add("orders", order);
      cart = [];
      writeCart(cart);
      form.reset();
      renderCart();

      if (status) {
        status.textContent = `Order saved locally. Reference: ${savedOrder.id}`;
      }
    } catch (error) {
      if (status) {
        status.textContent = "The order could not be saved. Please try again.";
      }
    } finally {
      setFormBusy(form, false);
      renderCart();
    }
  });

  renderCart();
}

function buildOrderPanel() {
  const panel = document.createElement("section");
  panel.className = "order-panel reveal";
  panel.setAttribute("aria-label", "Order cart");

  const header = document.createElement("div");
  header.className = "order-panel-head";

  const titleWrap = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Local Orders";
  const title = document.createElement("h2");
  title.textContent = "Build an order from the menu";
  titleWrap.append(eyebrow, title);

  const count = document.createElement("span");
  count.className = "tag";
  count.dataset.orderCount = "";
  count.textContent = "0 items";
  header.append(titleWrap, count);

  const layout = document.createElement("div");
  layout.className = "order-layout";

  const summary = document.createElement("article");
  summary.className = "cart-panel";

  const summaryHead = document.createElement("div");
  summaryHead.className = "cart-head";
  const summaryTitle = document.createElement("h3");
  summaryTitle.textContent = "Current Order";
  const summaryTotal = document.createElement("strong");
  summaryTotal.dataset.orderTotal = "";
  summaryTotal.textContent = formatMoney(0);
  summaryHead.append(summaryTitle, summaryTotal);

  const list = document.createElement("div");
  list.className = "cart-list";
  list.dataset.orderList = "";
  summary.append(summaryHead, list);

  const form = document.createElement("form");
  form.className = "form-grid order-form";
  form.dataset.orderForm = "";
  form.innerHTML = `
    <div class="form-grid two-col">
      <div class="field">
        <label for="order-name">Name</label>
        <input id="order-name" name="name" type="text" required />
      </div>
      <div class="field">
        <label for="order-phone">Phone Number</label>
        <input id="order-phone" name="phone" type="tel" required />
      </div>
    </div>
    <div class="form-grid two-col">
      <div class="field">
        <label for="order-email">Email</label>
        <input id="order-email" name="email" type="email" />
      </div>
      <div class="field">
        <label for="order-type">Order Type</label>
        <select id="order-type" name="orderType" required>
          <option value="">Select type</option>
          <option value="Dine-in">Dine-in</option>
          <option value="Takeaway">Takeaway</option>
        </select>
      </div>
    </div>
    <div class="form-grid two-col">
      <div class="field">
        <label for="order-date">Date</label>
        <input id="order-date" name="date" type="date" required />
      </div>
      <div class="field">
        <label for="order-time">Time</label>
        <input id="order-time" name="time" type="time" required />
      </div>
    </div>
    <div class="field">
      <label for="order-notes">Order Notes</label>
      <textarea id="order-notes" name="message" placeholder="Add spice preference, packing notes, or table details."></textarea>
    </div>
    <button class="btn" type="submit">Place Order</button>
    <p class="form-status" data-form-status aria-live="polite"></p>
  `;

  layout.append(summary, form);
  panel.append(header, layout);
  return panel;
}

function buildCartItem(item) {
  const row = document.createElement("article");
  row.className = "cart-item";

  const copy = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = item.name;
  const price = document.createElement("span");
  price.textContent = item.price ? formatMoney(item.price) : item.priceText || "Custom price";
  copy.append(name, price);

  const controls = document.createElement("div");
  controls.className = "cart-controls";
  controls.append(
    buildCartButton(item.id, "decrease", "-"),
    buildCartQuantity(item.quantity),
    buildCartButton(item.id, "increase", "+"),
    buildCartButton(item.id, "remove", "x")
  );

  row.append(copy, controls);
  return row;
}

function buildCartButton(id, action, label) {
  const button = document.createElement("button");
  button.className = action === "remove" ? "cart-icon-button danger" : "cart-icon-button";
  button.type = "button";
  button.dataset.cartAction = action;
  button.dataset.cartId = id;
  button.setAttribute("aria-label", `${action} item`);
  button.textContent = label;
  return button;
}

function buildCartQuantity(quantity) {
  const quantityNode = document.createElement("span");
  quantityNode.className = "cart-quantity";
  quantityNode.textContent = String(quantity);
  return quantityNode;
}

function readCart() {
  try {
    return JSON.parse(window.localStorage.getItem("youAndMeOrderCart") || "[]");
  } catch (error) {
    return [];
  }
}

function writeCart(cart) {
  try {
    window.localStorage.setItem("youAndMeOrderCart", JSON.stringify(cart));
  } catch (error) {
    // The cart still works in memory if localStorage is unavailable.
  }
}

function parseMenuPrice(priceText) {
  const match = priceText.replace(/,/g, "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
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

function initLogin() {
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value;
      const password = document.getElementById("login-password").value;
      if (email === "test@example.com" && password === "password123") {
        window.localStorage.setItem("isLoggedIn", "true");
        window.location.href = "index.html";
      } else {
        document.getElementById("login-status").textContent = "Invalid credentials";
      }
    });
  }
}

function initForms() {
  document.querySelectorAll("[data-database-form], [data-demo-form]").forEach((form) => {
    const status = form.querySelector("[data-form-status]");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      if (!form.reportValidity()) {
        return;
      }

      const formType = form.getAttribute("data-form-type") || "message";
      const storeName = formType === "reservation" ? "reservations" : "messages";
      const values = getFormValues(form);
      const nameValue = values.name || "";
      const label = form.dataset.successLabel || "Thanks";
      setFormBusy(form, true);

      try {
        const record = await restaurantDatabase.add(storeName, {
          ...values,
          customerName: values.name,
          notes: values.message,
          source: formType,
        });

        if (status) {
          status.textContent = `${label}${nameValue ? `, ${nameValue}` : ""}. Saved locally as ${record.id}.`;
        }

        form.reset();
      } catch (error) {
        if (status) {
          status.textContent = "This form could not be saved. Please try again.";
        }
      } finally {
        setFormBusy(form, false);
      }
    });
  });
}

function getFormValues(form) {
  return [...new FormData(form).entries()].reduce((values, [key, value]) => {
    values[key] = typeof value === "string" ? value.trim() : value;
    return values;
  }, {});
}

function setFormBusy(form, isBusy) {
  form.querySelectorAll("button, input, select, textarea").forEach((field) => {
    field.toggleAttribute("disabled", isBusy);
  });
}

function initAdminPanel() {
  const adminRoot = document.querySelector("[data-admin-root]");
  if (!adminRoot) {
    return;
  }

  const tabs = [...adminRoot.querySelectorAll("[data-admin-tab]")];
  const list = adminRoot.querySelector("[data-admin-list]");
  const search = adminRoot.querySelector("[data-admin-search]");
  const exportButton = adminRoot.querySelector("[data-admin-export]");
  const clearButton = adminRoot.querySelector("[data-admin-clear]");
  const modeNode = adminRoot.querySelector("[data-database-mode]");
  const state = {
    activeStore: "reservations",
    records: {
      reservations: [],
      orders: [],
      messages: [],
    },
  };

  const loadRecords = async () => {
    const [reservations, orders, messages] = await Promise.all(
      RESTAURANT_DB_STORES.map((storeName) => restaurantDatabase.list(storeName))
    );

    state.records = { reservations, orders, messages };
    renderAdminStats(adminRoot, state.records);
    renderAdminList(adminRoot, state, list);
  };

  // Real-time sync: BroadcastChannel (works on http/https)
  dbChannel.addEventListener("message", () => {
    loadRecords();
  });

  // Real-time sync: localStorage "storage" event (works on file:// across tabs)
  window.addEventListener("storage", (e) => {
    if (e.key === RESTAURANT_DB_FALLBACK_KEY) {
      loadRecords();
    }
  });

  // Sync when tab regains focus (catches all cases)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      loadRecords();
    }
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeStore = tab.getAttribute("data-admin-tab") || "reservations";
      tabs.forEach((item) => item.setAttribute("aria-pressed", String(item === tab)));
      renderAdminList(adminRoot, state, list);
    });
  });

  search?.addEventListener("input", () => renderAdminList(adminRoot, state, list));

  exportButton?.addEventListener("click", () => {
    exportRecordsAsCsv(state.activeStore, getFilteredAdminRecords(adminRoot, state));
  });

  clearButton?.addEventListener("click", async () => {
    const label = getStoreLabel(state.activeStore);
    if (!window.confirm(`Delete all ${label.toLowerCase()} from this local database?`)) {
      return;
    }

    await restaurantDatabase.clear(state.activeStore);
    await loadRecords();
  });

  adminRoot.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-record-status]");
    if (!(select instanceof HTMLSelectElement)) {
      return;
    }

    await restaurantDatabase.update(select.dataset.store, select.dataset.recordId, {
      status: select.value,
    });
    await loadRecords();
  });

  adminRoot.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-record-delete]");
    if (!(deleteButton instanceof HTMLButtonElement)) {
      return;
    }

    if (!window.confirm("Delete this local record?")) {
      return;
    }

    await restaurantDatabase.delete(deleteButton.dataset.store, deleteButton.dataset.recordId);
    await loadRecords();
  });

  restaurantDatabase.mode().then((mode) => {
    if (modeNode) {
      modeNode.textContent = mode;
    }
  });

  loadRecords();
}

function renderAdminStats(adminRoot, records) {
  RESTAURANT_DB_STORES.forEach((storeName) => {
    const node = adminRoot.querySelector(`[data-admin-count="${storeName}"]`);
    if (node) {
      node.textContent = String(records[storeName]?.length || 0);
    }
  });
}

function renderAdminList(adminRoot, state, list) {
  if (!list) {
    return;
  }

  const records = getFilteredAdminRecords(adminRoot, state);
  list.replaceChildren();

  if (!records.length) {
    const empty = document.createElement("article");
    empty.className = "admin-empty";
    empty.textContent = "No local records found.";
    list.append(empty);
    return;
  }

  records.forEach((record) => list.append(buildAdminRecordCard(state.activeStore, record)));
}

function getFilteredAdminRecords(adminRoot, state) {
  const query = (adminRoot.querySelector("[data-admin-search]")?.value || "").trim().toLowerCase();
  const records = state.records[state.activeStore] || [];

  if (!query) {
    return records;
  }

  return records.filter((record) => JSON.stringify(record).toLowerCase().includes(query));
}

function buildAdminRecordCard(storeName, record) {
  const card = document.createElement("article");
  card.className = "admin-record";

  const header = document.createElement("div");
  header.className = "admin-record-head";

  const copy = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "admin-record-kicker";
  eyebrow.textContent = `${getStoreLabel(storeName)} • ${formatDateTime(record.createdAt)}`;
  const title = document.createElement("h3");
  title.textContent = getRecordTitle(storeName, record);
  copy.append(eyebrow, title);

  const status = document.createElement("select");
  status.className = "admin-status-select";
  status.dataset.recordStatus = "";
  status.dataset.store = storeName;
  status.dataset.recordId = record.id;

  getStatuses(storeName).forEach((statusName) => {
    const option = document.createElement("option");
    option.value = statusName;
    option.textContent = statusName;
    option.selected = record.status === statusName;
    status.append(option);
  });

  header.append(copy, status);

  const details = document.createElement("div");
  details.className = "admin-detail-grid";
  getRecordDetails(storeName, record).forEach(([label, value]) => {
    if (!value) {
      return;
    }

    const item = document.createElement("div");
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value;
    item.append(labelNode, valueNode);
    details.append(item);
  });

  card.append(header, details);

  if (storeName === "orders" && Array.isArray(record.items) && record.items.length) {
    const orderItems = document.createElement("div");
    orderItems.className = "admin-order-items";

    record.items.forEach((item) => {
      const row = document.createElement("div");
      const name = document.createElement("span");
      name.textContent = `${item.quantity} x ${item.name}`;
      const price = document.createElement("strong");
      price.textContent = item.price ? formatMoney(item.price * item.quantity) : item.priceText || "Custom";
      row.append(name, price);
      orderItems.append(row);
    });

    card.append(orderItems);
  }

  const actions = document.createElement("div");
  actions.className = "admin-actions";
  const id = document.createElement("span");
  id.className = "admin-record-id";
  id.textContent = record.id;
  const deleteButton = document.createElement("button");
  deleteButton.className = "btn btn-danger";
  deleteButton.type = "button";
  deleteButton.dataset.recordDelete = "";
  deleteButton.dataset.store = storeName;
  deleteButton.dataset.recordId = record.id;
  deleteButton.textContent = "Delete";
  actions.append(id, deleteButton);
  card.append(actions);

  return card;
}

function getRecordTitle(storeName, record) {
  if (storeName === "orders") {
    return `${record.customerName || record.name || "Guest"} • ${record.items?.length || 0} dishes`;
  }

  if (storeName === "reservations") {
    return `${record.customerName || record.name || "Guest"} • ${record.guests || "Guests pending"}`;
  }

  return record.customerName || record.name || record.email || "Message";
}

function getRecordDetails(storeName, record) {
  if (storeName === "orders") {
    return [
      ["Phone", record.phone],
      ["Email", record.email],
      ["Type", record.orderType],
      ["Date", record.date],
      ["Time", record.time],
      ["Subtotal", formatMoney(record.subtotal)],
      ["Notes", record.notes || record.message],
    ];
  }

  if (storeName === "reservations") {
    return [
      ["Phone", record.phone],
      ["Email", record.email],
      ["Guests", record.guests],
      ["Date", record.date],
      ["Time", record.time],
      ["Request", record.notes || record.message],
    ];
  }

  return [
    ["Email", record.email],
    ["Phone", record.phone],
    ["Message", record.notes || record.message],
  ];
}

function getStoreLabel(storeName) {
  return {
    reservations: "Reservations",
    orders: "Orders",
    messages: "Messages",
  }[storeName] || storeName;
}

function getStatuses(storeName) {
  const statuses = {
    reservations: ["new", "confirmed", "seated", "cancelled"],
    orders: ["new", "preparing", "ready", "completed", "cancelled"],
    messages: ["new", "replied", "closed"],
  };

  return statuses[storeName] || ["new", "closed"];
}

function formatDateTime(value) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function exportRecordsAsCsv(storeName, records) {
  if (!records.length) {
    return;
  }

  const keys = [...records.reduce((set, record) => {
    Object.keys(flattenRecord(record)).forEach((key) => set.add(key));
    return set;
  }, new Set())];
  const rows = records.map((record) => flattenRecord(record));
  const csv = [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${storeName}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function flattenRecord(record) {
  return Object.entries(record).reduce((flat, [key, value]) => {
    flat[key] = Array.isArray(value) || typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : value;
    return flat;
  }, {});
}

function csvEscape(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function initYear() {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
}
