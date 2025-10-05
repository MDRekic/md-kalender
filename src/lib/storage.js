// Jednostavna localStorage “baza”
const LS_SLOTS = "mydienst_slots_v1";
// Slot: { id, date:"YYYY-MM-DD", time:"HH:mm", duration:Number, status:"free"|"booked", booking? }

export function loadSlots() {
  try {
    const raw = localStorage.getItem(LS_SLOTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSlots(slots) {
  localStorage.setItem(LS_SLOTS, JSON.stringify(slots));
}
