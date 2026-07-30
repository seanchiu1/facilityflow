# FacilityFlow — Booking Availability Debug: "Duty Roster entry didn't open a slot"

**Symptom reported:** an admin added a person to Duty Roster for a date, but Vendor Booking still said "No available slots" for that date.

**Verdict:** not a regression from the vendor-schedule-privacy fix. Two things were true at once:
1. Duty Roster was never supposed to create booking availability — that's by design, not a bug.
2. Schedule Management (the page that *is* supposed to create it) had a real bug: its staff picker was hardcoded to 5 fictional demo names, disconnected from the real `profiles` table — so even using the correct tool, a real pilot admin had no way to open a slot for a real staff member. **This is the actual bug, now fixed.**

---

## 1. Source of truth for vendor bookable slots

**`staff_schedules` is the only table `get_available_schedule_slots(equipment_type, date)` — and therefore the vendor Booking Form — ever reads.** This was true before the vendor-schedule-privacy-fix migration (when `BookingForm.jsx` queried the table directly) and is still true after it (now via the RPC). The RPC didn't change *what* data is available, only *how* it's accessed — see `VENDOR_ISOLATION_AUDIT.md`.

`duty_rosters` is a completely separate table. Confirmed by inspecting both schemas live:

| `staff_schedules` (booking capacity) | `duty_rosters` (on-call coverage) |
|---|---|
| `id, staff_name, equipment_type, schedule_date, start_time, end_time, capacity, notes` | `id, roster_date, site, duty_staff_name, duty_staff_phone, duty_staff_email, notes` |
| One row = a bookable time window for one equipment type on one date, with a capacity | One row = who's on-call at one site on one day |
| Written only by Schedule Management (`ScheduleGrid.jsx` → `staff_schedules` insert) | Written only by Duty Roster (`DutyRoster.jsx` → `duty_rosters` insert/update) |
| No foreign key or trigger connects it to `duty_rosters` | No foreign key or trigger connects it to `staff_schedules` |

This distinction is a **documented, deliberate design decision**, not an oversight:
> "Duty roster is a monthly, site-based, one-person-per-day on-call record — distinct from `staff_schedules` (which is per-equipment-type booking capacity)." — `PHASE2_REQUIREMENTS.md`

Grepping `DutyRoster.jsx` confirms it: every Supabase call in that file targets `duty_rosters`; it never writes to, reads from, or references `staff_schedules` in any way.

## 2. Why adding a Duty Roster row doesn't show a slot

Because nothing connects the two tables. Adding a Duty Roster entry inserts one row into `duty_rosters` — an on-call coverage record. `get_available_schedule_slots()` queries `staff_schedules`, filtered to the exact `equipment_type` + `schedule_date` the vendor selected. Unless a row for that same equipment type and date already exists in `staff_schedules` (created via Schedule Management), the RPC correctly returns zero rows, and the Booking Form correctly says "No available slots." **This part of the system is working as designed.**

## 3. The real bug

`ScheduleManagement.jsx`'s "Add Shift" form (`ScheduleGrid.jsx`) — the actual tool for creating `staff_schedules` rows — sourced its "Select a staff member" dropdown from a hardcoded, static file:

```js
// src/data/staff.js — 5 fictional people, fake @qualcomm.com addresses
export const staff = [
  { id: 's1', name: 'Chen Wei-Ming', role: 'Senior Facilities Tech', ... },
  { id: 's2', name: 'Lin Mei-Hui',  role: 'Electrical Inspector', ... },
  // ...3 more
]
```

This array has no relationship to the real `profiles` table. A pilot admin who added a genuine staff member via **Admin → Users** would never see that person in Schedule Management's dropdown — only the 5 demo names were selectable. So even doing the *right* thing (using Schedule Management, not Duty Roster) didn't work for a real pilot team. This is why the reported symptom happened regardless of which table the admin thought they were supposed to use.

---

## 4. Decision: clean pilot behavior

**Option A — Duty Roster stays staffing-only; Schedule Management/`staff_schedules` remains the sole source of vendor booking availability.** Chosen, for three reasons:

- It's the existing, already-shipped, already-documented design (`PHASE2_REQUIREMENTS.md`) — changing it would be a scope-creeping schema/product redesign, not a bug fix.
- **Option B** (Duty Roster becomes the booking source) doesn't fit the data: `duty_rosters` is one row per site per day with no equipment type, time window, or capacity — it structurally cannot represent "3 HVAC slots from 9–1 on the 14th" without redefining what Duty Roster *is*.
- **Option C** (Duty Roster auto-generates `staff_schedules` rows) would require guessing an equipment type and time window from an on-call assignment that was never meant to carry that information — implicit, surprising behavior that would confuse admins in a different way than today's gap does.

The actual fix is the one described in §3: make Schedule Management usable with real people, and make the distinction between the two tools impossible to miss in the docs.

## 5–6. Linked staff/profile selection (implemented)

Per the task's preference for linked selection over manually-typed names for a real pilot, and to fix the actual bug in §3:

- **`ScheduleGrid.jsx`'s "Add Shift" staff dropdown** now sources from live, active `profiles` rows (`role in (admin, manager, staff)`, `is_active = true`) fetched by `ScheduleManagement.jsx` — the same query shape already used by `DataAudit.jsx`'s POC picker. Selecting a person sets both a new `staff_profile_id` (the real link) and `staff_name` (denormalized display text — still what every reader, including the RPC, actually displays).
- **`DutyRoster.jsx`'s "Duty Staff" field** stays free text (backward compatible — a legacy or no-login name can still be typed and saved), but now offers a `<datalist>` of the same active profiles. Typing/picking a name that exactly matches a profile links `duty_staff_profile_id` and — only if the email field is still empty — prefills it from that profile. This mirrors the existing, already-established pattern for `duty_rosters.site` (free text + suggestions from the `sites` table) and for `appointment_requests.responsible_staff` / `assigned_poc_profile_id` elsewhere in this app.
- Both `*_profile_id` columns are **nullable and purely additive** — no existing row, query, or RLS policy needed to change. `staff_name` / `duty_staff_name` remain the columns every existing reader uses.

## 7–8. Vendor isolation — unaffected

- `staff_schedules`'s RLS is unchanged by this fix: still no direct SELECT policy for `authenticated`/vendor (removed in the earlier privacy-fix pass). Re-verified live after adding the new column — a simulated vendor session still gets 0 rows on a direct table read. See `VENDOR_ISOLATION_AUDIT.md`'s update.
- `BookingForm.jsx` is untouched by this change — it still calls `get_available_schedule_slots(equipment_type, date)` exclusively, never a direct table select.

---

## Files / migrations changed

- `supabase_staff_profile_linking_migration.sql` (new) — `staff_schedules.staff_profile_id`, `duty_rosters.duty_staff_profile_id` (both nullable FKs to `profiles`), plus supporting indexes. No RLS change.
- `src/pages/ScheduleManagement.jsx` — fetches active internal profiles, passes them to `ScheduleGrid`, records `staff_profile_id` on insert, derives the "filter by staff" dropdown from the staff names actually present in the loaded week (instead of the static file) so filtering always matches real data.
- `src/components/ScheduleGrid.jsx` — "Add Shift" staff field is now a `<select>` over live profiles (`staffOptions` prop) instead of the hardcoded `data/staff.js` import; shows an inline warning if no active internal accounts exist yet.
- `src/pages/DutyRoster.jsx` — "Duty Staff" field gains a `<datalist>` of active profiles; resolves and stores `duty_staff_profile_id` when the typed name matches one, with an email auto-fill (only into an empty field).
- `MANAGER_GUIDE.md` — new **Open vendor booking availability** section spelling out the Duty Roster vs. Schedule Management distinction and the exact fix for "No available slots."
- `ADMIN_GUIDE.md` — note in **Create users** cross-referencing that both dropdowns above only ever show active accounts created there.
- `FRESH_DB_REBUILD.md`, `VENDOR_ISOLATION_AUDIT.md` — updated for the new migration and the re-confirmed isolation check.

`src/data/staff.js` is left in place, still used by Schedule Management's decorative "Staff coverage summary" cards (color/initials/expertise/weekly-schedule display) — that widget is cosmetic, not part of the booking-availability path, and reworking it to pull from live profiles (which don't carry expertise/color/schedule fields) is a separate, non-blocking follow-up, not part of this fix.

---

## Exact manual test steps

1. **Reproduce the original symptom (should still reproduce for a date with no shift):** log in as vendor, go to New Booking, pick any equipment type and a date nobody has scheduled — confirm "No available slots" still shows. This is correct behavior for genuinely-empty capacity, not a bug.
2. **Confirm Duty Roster still doesn't affect this:** log in as admin/manager, go to Duty Roster, add an assignment for that same date. Log back in as vendor, re-check the same equipment/date on New Booking — still no slot. Confirms Duty Roster and booking availability remain intentionally decoupled.
3. **Confirm the actual fix — create a real slot:**
   - Log in as admin/manager → **Schedule Management**.
   - Navigate to the week containing your target date.
   - Click **Add Shift**. Confirm the "Select a staff member" dropdown lists real active accounts (not "Chen Wei-Ming — Senior Facilities Tech" from the old hardcoded list, unless that happens to also be a real profile's display name).
   - Pick a staff member, an equipment type, the target date, a time window, and submit. Confirm the shift appears in the grid under the correct day, showing the picked staff member's name.
   - Log out, log in as vendor → **New Booking** → select the same equipment type and date. Confirm the new slot now appears, showing the correct staff name.
4. **Confirm vendor isolation held through the schema change:** as vendor, open browser devtools → Network tab, and confirm no request in the booking flow ever calls `staff_schedules` directly (only `rpc/get_available_schedule_slots` and `slot_booking_counts`). For a database-level check, see `VENDOR_ISOLATION_AUDIT.md`'s copy-paste SQL.
5. **Confirm Duty Roster's profile suggestions work without breaking free text:** in Duty Roster, add an assignment and start typing a real staff member's name into "Duty Staff" — confirm a suggestion dropdown (browser-native datalist) appears. Also confirm you can type a name that matches nobody (e.g., a contractor with no login) and still save successfully.
