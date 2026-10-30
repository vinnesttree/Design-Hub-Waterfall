This file is also mirrored on greasy fork for easy installation. The link can be found here: https://greasyfork.org/en/scripts/572099-engineering-design-hub-reservation-waterfall

This was developed with the help of generative AI

## Sites

The script works on unl.edu sites built on UNL's reservations app ([unl/reservations](https://github.com/unl/reservations)), such as:

- **Engineering Design Hub**: `designhub-manager.unl.edu`
- **Innovation Studio**: `innovationstudio-manager.unl.edu`

It runs on the Tools, admin Tools and Agenda pages of any unl.edu site. It only acts on a page that has the reservations app's own heading ("Tools You Can Reserve", "All Tools" or "Today's Reservations"), so other unl.edu pages are left alone. Each site keeps its own settings and saved tools.

Per-site options are in `SITES` at the top of the script. A site that isn't listed there uses `DEFAULT_SITE`.

- **`rowLabel`** sets what each row is called. With `'model'`, rows use the Model column; Design Hub names each printer there (Ada, Hull, …). With `'tool'`, rows are named "Tool · Model" (just the Tool when Model is empty), for example "Laser Cutter Mini 24 CO2 · Epilog". Innovation Studio uses `'tool'` because its Model column holds the maker, and several different machines share one (all its laser cutters are "Epilog"). Tools with the same Tool and the same Model share a row, since the agenda can't tell them apart either.
- **`models`** lists rows to show first, in that order. Use the row names the waterfall shows. Other rows come after them, A–Z. Design Hub lists its printers here; Innovation Studio's list is empty.
- **`toolIds`** maps a tool ID to a row name, for a tool that neither Tools page shows you (see below).

## Where the waterfall shows up

- **Admin agenda** (`/admin/agenda/`): built from the Today's Reservations table. SHOW ALL RESERVATIONS lists every row in `models` plus every saved tool that takes reservations. The agenda reads `/admin/tools/` in the background to keep the saved list current. That needs the Manage Resources permission; without it, the agenda uses whatever is already saved. On a day with no reservations, the chart sits under the Today's Reservations heading and says so.
- **Tools page** (`/tools/`, for example `https://innovationstudio-manager.unl.edu/tools/`): built from `GET /tools/<id>/reservations.json`, which works without logging in. It loads every saved tool that takes reservations (see below), six at a time. The JSON doesn't include user names, so bars show the reservation's time span (or its title, if it has one).

## Saved tools

The script saves each tool's ID and row name in the browser whenever you open:

- **the Tools page** (`/tools/`). It only lists tools you are authorized to use, so it adds to the saved list.
- **the admin Tools page** (`/admin/tools/`), either directly or in the background from the Agenda page. It lists every tool, so it replaces the saved list. Checkable tools are skipped.

Neither waterfall shows tools that don't require a reservation ("Reservation not required" on the Tools page):

- Tools linked from the Tools page take reservations, since only those get a reserve link.
- Every other tool is checked on its admin edit page (the **Requires Reservation?** box), at most once a day per tool. The check runs when you open the admin Tools page, or in the background from the Agenda page, and needs the Manage Resources permission.
- A tool stays hidden until it has been checked. That includes a printer listed in `models` whose box is unticked.

If the site says a saved tool no longer exists, that tool is dropped from the list. The settings page shows the saved list and has a **Forget saved tools** button. To add a tool that neither page shows you, put it in that site's `toolIds` at the top of the script.

## Settings and minimize

- **⚙ on the chart header** (or **⚙ Waterfall settings** in the Tampermonkey menu) opens the settings page. There you can turn the waterfall on or off for the Tools page and the Agenda page, choose to show idle tools by default, and choose how rows are sorted. **Sort rows by tool type** is on by default: it groups rows by the Tool column (all Prusa MK4s together, and so on), with types A–Z. Within a type, rows keep the `models` order, then A–Z, and rows whose type isn't known yet go last. Turn it off to use the `models` order, then the other rows A–Z. The settings page also lists the saved tools. Settings save right away. While the waterfall is off, you can only reach the settings from the Tampermonkey menu.
- **− on the chart header** minimizes the chart until you close the tab. While it is minimized, the Tools page doesn't fetch any reservations.
