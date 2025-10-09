import React, { useEffect, useMemo, useState } from "react";
import CalendarMonth from "../components/CalendarMonth";
import BookingModal from "../components/BookingModal";
import { addMonths, ymd } from "../lib/date";
import { listSlots, createBooking, printUrl } from "../lib/api";

export default function KalendarPage() {
  const [activeDate, setActiveDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => ymd(new Date()));
  const [slots, setSlots] = useState([]);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [slotForBooking, setSlotForBooking] = useState(null);

  const todayStr = useMemo(() => ymd(new Date()), []);

  // Učitaj SVE slotove (ne samo za jedan dan)
  useEffect(() => {
    listSlots()               // <-- bez selectedDate
      .then(setSlots)
      .catch(() => setSlots([]));
  }, []);

  // Slotovi za izabrani dan (sortirani)
  const daySlots = useMemo(
    () =>
      slots
        .filter((s) => s.date === selectedDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [slots, selectedDate]
  );

  // Samo slobodni za javni prikaz
  const daySlotsFree = useMemo(
    () => daySlots.filter((s) => s.status === "free"),
    [daySlots]
  );

  function openBooking(slot) {
    if (slot.status === "free") {
      setSlotForBooking(slot);
      setBookingOpen(true);
    }
  }

  async function submitBooking({ fullName, email, phone, address, plz, city, note }) {
    if (!fullName || !email || !phone || !address || !plz || !city) {
      alert("Bitte füllen Sie alle Pflichtfelder aus.");
      return;
    }
    try {
      const { bookingId } = await createBooking({
        slotId: slotForBooking.id,
        fullName,
        email,
        phone,
        address,
        plz,
        city,
        note,
      });

      setBookingOpen(false);
      setSlotForBooking(null);

      // ponovo učitaj SVE slotove da bi se kalendar i desna lista osvježili
      listSlots().then(setSlots);

      if (bookingId) window.open(printUrl(bookingId), "_blank");
    } catch (e) {
      alert("Buchung fehlgeschlagen.");
      console.error(e);
    }
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <CalendarMonth
            activeDate={activeDate}
            onPrev={() => setActiveDate((d) => addMonths(d, -1))}
            onNext={() => setActiveDate((d) => addMonths(d, 1))}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(ymd(d))}
            todayStr={todayStr}
            slots={slots}   // <— SVI slotovi (kalendar treba kompletne podatke)
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Termine – {selectedDate}</h2>

          {daySlotsFree.length === 0 ? (
            <p className="mt-2 text-slate-500">Keine freien Termine an diesem Tag.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {daySlotsFree.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
                >
                  <div>
                    <div className="font-medium">
                      {s.time} · {s.duration} Min.
                    </div>
                    <div className="text-sm">
                      Status: <span className="text-emerald-600">frei</span>
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => openBooking(s)}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700"
                    >
                      Buchen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {bookingOpen && slotForBooking && (
        <BookingModal
          slot={slotForBooking}
          onClose={() => {
            setBookingOpen(false);
            setSlotForBooking(null);
          }}
          onSubmit={submitBooking}
        />
      )}
    </>
  );
}
