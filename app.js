// app.js — Dispensa (Tailwind + Supabase + Toast + SW updates)
// -----------------------------------------------------------
// 1) INSERISCI QUI LE TUE CREDENZIALI SUPABASE
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bkombhjaspuromynnjtx.supabase.co";   // <- modifica qui
const SUPABASE_ANON = "sb_publishable_2JYpEgac_hxzlCHG8TPqJg_OEsuY0jG";         // <- modifica qui

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// -----------------------------------------------------------
// Helpers UI (toast) + dom
// -----------------------------------------------------------
function ensureToastHost() {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "fixed bottom-4 inset-x-0 flex flex-col items-center gap-2 z-50";
    document.body.appendChild(host);
  }
  return host;
}

function toast(message, { type = "info", actionText, onAction, timeout = 4000 } = {}) {
  const host = ensureToastHost();
  const base =
    "max-w-[92%] sm:max-w-md w-auto px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-3";
  const color =
    type === "success" ? "bg-green-600 text-white" :
    type === "warn"    ? "bg-yellow-500 text-white" :
    type === "error"   ? "bg-red-600 text-white"    :
                         "bg-gray-900 text-white";

  const el = document.createElement("div");
  el.className = `${base} ${color}`;

  const msg = document.createElement("div");
  msg.textContent = message;
  el.appendChild(msg);

  if (actionText && typeof onAction === "function") {
    const btn = document.createElement("button");
    btn.className = "ml-2 bg-white/15 hover:bg-white/25 px-3 py-1 rounded-md";
    btn.textContent = actionText;
    btn.onclick = () => { onAction(); host.removeChild(el); };
    el.appendChild(btn);
  }

  host.appendChild(el);
  if (timeout) setTimeout(() => el.isConnected && host.removeChild(el), timeout);
}

const $ = (id) => document.getElementById(id);
const getVal = (id) => $(id).value?.trim();
const setVal = (id, v) => { $(id).value = v ?? ""; };

// -----------------------------------------------------------
// Registrazione Service Worker + prompt aggiornamento
// -----------------------------------------------------------
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    // Prompt when an update is installed and waiting
    function promptUpdate(worker) {
      toast("Nuova versione disponibile", {
        type: "info",
        actionText: "Aggiorna",
        onAction: () => worker.postMessage({ type: "SKIP_WAITING" }),
        timeout: 8000
      });
    }

    if (reg.waiting) {
      promptUpdate(reg.waiting);
    }

    reg.addEventListener("updatefound", () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener("statechange", () => {
        if (newSW.state === "installed" && navigator.serviceWorker.controller) {
          // new update ready
          promptUpdate(newSW);
        }
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // auto-reload after skipWaiting -> activate
      window.location.reload();
    });
  } catch (err) {
    console.error("SW registration failed", err);
  }
}
registerSW();

// -----------------------------------------------------------
// Fallback offline: accoda ultimo salvataggio e sincronizza
// -----------------------------------------------------------
const PENDING_KEY = "dispensa_pending_save";

function cachePendingForm() {
  const payload = {
    barcode:   getVal("barcode"),
    description: getVal("description"),
    location:  getVal("location"),
    quantity:  parseInt(getVal("quantity") || "0", 10) || 0,
    expiry:    getVal("expiry") || null,
    t: Date.now()
  };
  localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
}

async function flushPendingIfAny() {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data && data.barcode) {
      await _saveProductToDB(data);
      localStorage.removeItem(PENDING_KEY);
      toast("Dati sincronizzati con successo", { type: "success" });
    }
  } catch (e) {
    console.warn("Flush pending failed", e);
  }
}
window.addEventListener("online", flushPendingIfAny);

// -----------------------------------------------------------
// CRUD — Products + Stock
//   - products: { barcode (PK), description }
//   - stock:    { barcode -> products, location, quantity, expiry_date }
// -----------------------------------------------------------
function validateForm({ requireAll = true } = {}) {
  const barcode = getVal("barcode");
  const description = getVal("description");
  const location = getVal("location");
  const quantity = parseInt(getVal("quantity") || "0", 10);
  const expiry = getVal("expiry") || null;

  if (!barcode) throw new Error("Nessun codice scansionato.");
  if (requireAll) {
    if (!description) throw new Error("Inserisci una descrizione.");
    if (!location) throw new Error("Inserisci una posizione.");
    if (!(quantity >= 0)) throw new Error("Quantità non valida.");
  }
  return { barcode, description, location, quantity, expiry };
}

async function _saveProductToDB({ barcode, description, location, quantity, expiry }) {
  // upsert prodotto
  const { error: pErr } = await supabase
    .from("products")
    .upsert({ barcode, description });
  if (pErr) throw pErr;

  // stock: update se esiste, altrimenti insert
  const { data: stk } = await supabase
    .from("stock")
    .select("id")
    .eq("barcode", barcode)
    .limit(1)
    .maybeSingle();

  if (stk && stk.id) {
    const { error: uErr } = await supabase
      .from("stock")
      .update({ location, quantity, expiry_date: expiry })
      .eq("id", stk.id);
    if (uErr) throw uErr;
  } else {
    const { error: iErr } = await supabase
      .from("stock")
      .insert({ barcode, location, quantity, expiry_date: expiry });
    if (iErr) throw iErr;
  }
}

async function saveProduct() {
  try {
    const form = validateForm({ requireAll: true });

    if (!navigator.onLine) {
      cachePendingForm();
      toast("Sei offline. I dati saranno sincronizzati al ritorno online.", { type: "warn" });
      return;
    }

    await _saveProductToDB(form);
    toast("Prodotto salvato con successo", { type: "success" });
  } catch (e) {
    console.error(e);
    if (String(e?.message || e).includes("Failed to fetch")) {
      cachePendingForm();
      toast("Connessione assente. Dati memorizzati e verranno sincronizzati.", { type: "warn" });
    } else {
      toast(e.message || "Errore durante il salvataggio", { type: "error" });
    }
  }
}

async function loadProduct() {
  try {
    const barcode = validateForm({ requireAll: false }).barcode;

    const { data, error } = await supabase
      .from("products")
      .select("barcode, description, stock(*))")
      .eq("barcode", barcode)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      toast("Prodotto non trovato", { type: "warn" });
      return;
    }

    setVal("description", data.description || "");

    const s = (data.stock && data.stock[0]) ? data.stock[0] : null;
    if (s) {
      setVal("location", s.location || "");
      setVal("quantity", s.quantity ?? "");
      setVal("expiry", s.expiry_date || "");
    } else {
      setVal("location", "");
      setVal("quantity", "");
      setVal("expiry", "");
    }

    toast("Dati caricati", { type: "success" });
  } catch (e) {
    console.error(e);
    toast(e.message || "Errore durante la ricerca", { type: "error" });
  }
}

async function updateProduct() {
  try {
    const { barcode, description, location, quantity, expiry } = validateForm({ requireAll: true });

    const { error: pErr } = await supabase
      .from("products")
      .update({ description })
      .eq("barcode", barcode);
    if (pErr) throw pErr;

    const { data: stk } = await supabase
      .from("stock")
      .select("id")
      .eq("barcode", barcode)
      .limit(1)
      .maybeSingle();

    if (stk && stk.id) {
      const { error: sErr } = await supabase
        .from("stock")
        .update({ location, quantity, expiry_date: expiry })
        .eq("id", stk.id);
      if (sErr) throw sErr;
    } else {
      const { error: iErr } = await supabase
        .from("stock")
        .insert({ barcode, location, quantity, expiry_date: expiry });
      if (iErr) throw iErr;
    }

    toast("Prodotto aggiornato", { type: "success" });
  } catch (e) {
    console.error(e);
    toast(e.message || "Errore durante l'aggiornamento", { type: "error" });
  }
}

// -----------------------------------------------------------
// Espone funzioni ai pulsanti in index.html
// -----------------------------------------------------------
window.saveProduct = saveProduct;
window.loadProduct = loadProduct;
window.updateProduct = updateProduct;

// All’avvio, prova a sincronizzare eventuali dati pendenti
flushPendingIfAny();