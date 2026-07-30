# FacilityFlow — Mobile Pilot Checklist

**Purpose:** confirm FacilityFlow is actually usable on a real phone before a real vendor pilot — not just "doesn't visually break," but "a vendor can complete their whole workflow one-handed on a phone in a browser."

**How to use this:** run through it on a real iPhone/Android in Safari/Chrome, or with a desktop browser's device toolbar set to a 320–375px width viewport (iPhone SE is the narrowest common target — if it works there, wider phones are strictly easier). Check every box; anything that fails, note the page and the exact symptom.

**Scope:** vendor-facing pages first (this is what a real external vendor pilot actually touches), then manager pages, checked lightly.

---

## 0. Before you start

- [ ] Browser window / device toolbar set to **320px width** (not 375px or 390px — 320 is the floor, and passing 320 means everything wider also passes)
- [ ] Testing against the deployed Vercel URL (or `npm run dev` on a phone on the same network), not a desktop-only local preview
- [ ] Have a manager account and at least one vendor account's credentials ready

---

## 1. Login on phone

- [ ] Page loads with no horizontal scroll — you should never be able to swipe the whole page left/right, only individual elements that are deliberately scrollable (like a table)
- [ ] Email and password fields are full-width and easy to tap without zooming
- [ ] The "Forgot password?" link is tappable without accidentally hitting the password field
- [ ] Demo account list (if visible) doesn't overflow — role name and email either sit on one line or wrap onto two, never get cut off or push the page wider
- [ ] Language toggle (top-right) doesn't overlap the FacilityFlow logo/heading
- [ ] Submitting with wrong credentials shows the error message fully, not clipped
- [ ] After successful login, you land on the correct default page for your role with no layout break

## 2. Vendor booking / new request form

- [ ] Form fields stack vertically (vendor name, contact name, then equipment, then date/duration, then slots, then description, then upload) — nothing forces horizontal scrolling
- [ ] Equipment category buttons (Elevator/HVAC/Chiller/etc.) are tap-friendly — big enough to hit accurately, and the grid doesn't force 4 cramped columns on a narrow screen
- [ ] **Changing equipment type does not remove valid slots** — pick a date, select a slot, then tap a *different* equipment category: the previously selected slot must stay selected and the slot list must not disappear or reset. This is the core booking-rule change (see `BOOKING_AVAILABILITY_DEBUG.md` §9) and the thing most likely to silently regress.
- [ ] The date input (`<input type="date">`) does not overflow its container on iPhone Safari — Safari's native date picker control can be wider than the input itself if the input isn't given `w-full`; confirm tapping it opens the native picker cleanly and the closed input never causes the page to widen
- [ ] Available time slots list is fully readable — staff name, time range, and status badge don't overlap or get cut off
- [ ] File upload drop zone is tappable and opens the native file picker; selected file names wrap or truncate instead of overflowing
- [ ] The floating/summary sidebar (desktop: right column) either stacks below the form on mobile or is otherwise fully reachable — it must not be clipped off-screen
- [ ] Submit button is full-width, reachable without scrolling sideways, and shows a clear loading state
- [ ] Success screen (appointment code, summary) is fully readable without horizontal scroll

## 3. Vendor sees own bookings (My Bookings)

- [ ] Below a certain width, the bookings list renders as **cards**, not a cramped table — each card shows the appointment code, equipment, date/time, staff, and status without truncation-induced confusion
- [ ] Tapping a card navigates to that appointment's detail page
- [ ] The "signed in as [vendor] · [contact]" identity chip at the top doesn't overflow — company name and contact name wrap or truncate instead of pushing the refresh button off-screen
- [ ] Empty state (no bookings yet) is centered and readable, with a working "Submit a booking" call-to-action

## 4. Vendor opens Vendor Projects

- [ ] Project cards stack to a single column on the narrowest screens (not squeezed 3-across)
- [ ] Project name wraps instead of being clipped, even for a long name
- [ ] Status badge and site/date metadata remain readable at card width
- [ ] Search bar doesn't overflow

## 5. Vendor updates a task

- [ ] Opening a project from Vendor Projects loads correctly with no horizontal scroll
- [ ] The page's internal layout (Summary / My Tasks / Documents / Comments) stacks into a single column below the desktop breakpoint — the comments panel does not render squeezed into a narrow sidebar-width column on a phone
- [ ] Each task's title, description, and due date wrap normally; the status dropdown is tappable and doesn't get clipped by the card edge
- [ ] Changing a task's status via the dropdown works and reflects immediately

## 6. Vendor posts a shared comment

- [ ] Comment thread is fully readable — author name, timestamp, and body text wrap correctly, no overlap
- [ ] The comment textarea and "Post" button are both reachable and usable — the button doesn't get squeezed to an unreadable width next to the textarea
- [ ] After posting, the new comment appears in the thread without a layout jump that pushes other content off-screen

## 7. Vendor uploads a document

- [ ] "Upload Document" control is tappable and opens the native file picker
- [ ] Uploaded file appears in the list with its name fully visible (wrapped/truncated, not overflowing)
- [ ] Tapping an uploaded document's row opens/downloads it correctly

## 8. Vendor cannot access `/projects`

- [ ] Typing or navigating to `/projects` as a vendor redirects away (to the vendor's own default page) with no broken/partial page flash, on mobile exactly as on desktop

## 9. Vendor cannot access `/roster`

- [ ] Same check as above for `/roster` (Duty Roster) — vendor is redirected, not shown a broken or partial page

## 10. Notification bell opens

- [ ] The bell icon is visible and tappable in the topbar at 320px width (it must not get pushed off-screen by the title, hamburger, language toggle, or avatar all competing for the same row)
- [ ] Tapping it opens the dropdown **within the viewport** — on a narrow screen the dropdown must not extend past the left or right edge of the screen (it switches from a fixed-width corner popover to a viewport-anchored panel below `sm`)
- [ ] Dropdown content (overdue/starting-soon/project-update sections) is fully readable, and the close (×) button is reachable
- [ ] Tapping a notification navigates correctly and closes the dropdown

## 11. No horizontal overflow at 320px

This is the umbrella check — go back through every page above (and the manager pages below) and confirm none of them ever let you swipe/scroll the *whole page* left-right. A quick way to spot it: if you can see a sliver of extra white space or a cut-off element at the right edge, or the horizontal scrollbar appears at the bottom of the browser window, that page has an overflow bug.

- [ ] Login
- [ ] Vendor booking form
- [ ] My Bookings
- [ ] Vendor Projects
- [ ] Vendor Project Detail
- [ ] Every page's Topbar specifically (title + hamburger + language + bell + avatar must all fit)
- [ ] Sidebar drawer open and closed states

---

## 12. Sidebar / navigation (all roles)

- [ ] A hamburger icon appears in the topbar below the desktop breakpoint
- [ ] Tapping it slides the sidebar in from the left as an overlay, with a dimmed backdrop behind it
- [ ] Tapping the backdrop, or the sidebar's own close (×) button, closes it
- [ ] Tapping a nav link inside the drawer navigates AND closes the drawer automatically (you should never end up on the new page with the drawer still covering it)
- [ ] The sidebar itself never extends past ~85% of the viewport width, so a sliver of the page (and the backdrop) is always visible/tappable behind it

---

## 13. Manager pages — light check

These were reviewed and patched for the same overflow/stacking issues, but exercised less thoroughly than the vendor pages above. Spot-check each:

- [ ] **Dashboard** — stat cards reflow (2 or 4 per row depending on width), recent-requests table scrolls horizontally within its own box rather than widening the page, right-column widgets stack below the main content
- [ ] **Requests** — filter bar wraps, the request table scrolls horizontally within its own container (already had this before this pass)
- [ ] **Schedule Management** — staff coverage cards reflow; the weekly Mon–Fri grid does **not** try to compress 5 columns into 320px — instead it scrolls horizontally within its own box, which is expected and fine (it's a genuinely 5-column view, unlike everything else in this app)
- [ ] **Appointment Detail** — summary/timeline/status sections stack into one column, date/time field pairs stack vertically
- [ ] **Projects** — project cards reflow like Vendor Projects
- [ ] **Project Detail** — same stacking as Vendor Project Detail; internal Tasks/Comments/Activity sections remain readable

---

## Known limitations (be upfront about these)

- **Not a full native-app-quality mobile redesign.** This pass makes every priority page usable and overflow-free at 320px — it does not redesign information density, add swipe gestures, or optimize for one-thumb reachability beyond making buttons tap-sized. `PHASE2_ROADMAP.md`'s D-7 ("mobile responsive pass") is now substantially addressed for the pages in this checklist, not fully closed as a separate future initiative.
- **Schedule Management's weekly grid scrolls sideways within its own box, by design** — a real 5-day week view doesn't have a meaningful way to become "cards" without losing the at-a-glance weekly comparison it exists for. This is a deliberate, contained horizontal scroll, not the page-level overflow bug this checklist is otherwise hunting for.
- **Manager pages received a lighter pass than vendor pages**, matching the task's stated priority — if a manager pilot user works primarily from a phone (uncommon, but possible), expect more rough edges there than on the vendor side.
- **No dedicated tablet (768–1024px) pass** — the fix targets the 320px floor and the existing desktop breakpoint; the middle range should look reasonable (Tailwind's `sm`/`lg` breakpoints cover it) but wasn't specifically checked.
- **Authenticated pages were verified by code review, not a live mobile device/browser session, as part of this change** — the responsive class changes follow the same patterns already proven on the pages that were checked interactively; run this checklist for real before the pilot, don't just trust the diff.
