import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bkombhjaspuromynnjtx.supabase.co";   // <- modifica qui
const SUPABASE_ANON = "sb_publishable_2JYpEgac_hxzlCHG8TPqJg_OEsuY0jG";         // <- modifica qui

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// -------------------------------
// Salva prodotto + stock
// -------------------------------
export async function saveProduct() {
  const barcode = val("barcode");
  const description = val("description");
  const location = val("location");
  const quantity = parseInt(val("quantity"));
  const expiry = val("expiry");

  await supabase.from("products").upsert({ barcode, description });

  await supabase.from("stock").insert({
    barcode,
    location,
    quantity,
    expiry_date: expiry
  });

  alert("Prodotto salvato!");
}

// -------------------------------
// Carica prodotto
// -------------------------------
export async function loadProduct() {
  const barcode = val("barcode");

  const { data, error } = await supabase
    .from("products")
    .select("*, stock(*)")
    .eq("barcode", barcode)
    .single();

  if (!data) return alert("Prodotto non trovato.");

  set("description", data.description);

  if (data.stock && data.stock.length) {
    const s = data.stock[0];
    set("location", s.location);
    set("quantity", s.quantity);
    set("expiry", s.expiry_date);
  }
}

// -------------------------------
// Aggiorna prodotto
// -------------------------------
export async function updateProduct() {
  const barcode = val("barcode");
  const description = val("description");
  const location = val("location");
  const quantity = parseInt(val("quantity"));
  const expiry = val("expiry");

  await supabase
    .from("products")
    .update({ description })
    .eq("barcode", barcode);

  await supabase
    .from("stock")
    .update({ location, quantity, expiry_date: expiry })
    .eq("barcode", barcode);

  alert("Prodotto aggiornato!");
}

// -------------------------------
// Funzioni utili
// -------------------------------
function val(id) { return document.getElementById(id).value; }
function set(id, v) { document.getElementById(id).value = v; }

// Registrazione PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}