import React, { useState } from "react";

export default function BookingModal({ slot, onClose, onSubmit }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [plz, setPlz] = useState("");
  const [city, setCity] = useState("");
  const [units, setUnits] = useState(1);
  const [note, setNote] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!fullName.trim()) return alert("Name ist erforderlich.");
    if (!email.trim())    return alert("E-Mail ist erforderlich.");
    if (!phone.trim())    return alert("Telefon ist erforderlich.");
    if (!address.trim())  return alert("Adresse ist erforderlich.");
    if (!/^\d{4,5}$/.test(plz)) return alert("PLZ muss 4–5 Ziffern haben.");
    if (!city.trim())     return alert("Stadt ist erforderlich.");

    const unitsNum = Number(units);
    if (!Number.isInteger(unitsNum) || unitsNum < 1 || unitsNum > 999) {
      return alert("Einheiten: bitte Zahl 1–999.");
    }

    onSubmit({ fullName, email, phone, address, plz, city, units: unitsNum, note });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-semibold text-center">
          Termin buchen ({slot.date}, {slot.time})
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Vollständiger Name *</label>
            <input className="w-full rounded-lg border border-slate-300 p-2"
                   value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium">E-Mail *</label>
            <input type="email" className="w-full rounded-lg border border-slate-300 p-2"
                   value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium">Telefonnummer *</label>
            <input className="w-full rounded-lg border border-slate-300 p-2"
                   value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium">Adresse *</label>
            <input className="w-full rounded-lg border border-slate-300 p-2"
                   value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">PLZ *</label>
              <input className="w-full rounded-lg border border-slate-300 p-2"
                     value={plz} onChange={(e) => setPlz(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium">Stadt *</label>
              <input className="w-full rounded-lg border border-slate-300 p-2"
                     value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Einheiten (Klingeln) *</label>
            <input type="number" min={1} max={999}
                   className="w-full rounded-lg border border-slate-300 p-2"
                   value={units} onChange={(e) => setUnits(e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium">Notiz (optional)</label>
            <textarea rows="2" className="w-full rounded-lg border border-slate-300 p-2"
                      value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex justify-between pt-3">
            <button type="button" onClick={onClose}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Abbrechen
            </button>
            <button type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700">
              Termin buchen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
