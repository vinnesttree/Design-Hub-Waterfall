This file is also mirrored on greasy fork for easy installation. The link can be found here: https://greasyfork.org/en/scripts/572099-engineering-design-hub-reservation-waterfall

This was developed with the help of generative AI

## Where the waterfall shows up

- **Admin agenda** (`/admin/agenda/`): built from the Today's Reservations table. SHOW ALL RESERVATIONS lists every printer in `MODELS` plus every saved tool that takes reservations. The agenda reads `/admin/tools/` in the background to keep the saved list current. That needs the Manage Resources permission; without it, the agenda uses whatever is already saved.
- **Tools page** (`https://designhub-manager.unl.edu/tools/`): built from `GET /tools/<id>/reservations.json`, which works without logging in. It loads every saved tool that takes reservations (see below). The JSON doesn't include user names, so bars show the reservation's time span (or its title, if it has one).

## Saved tools

The script saves each tool's ID and printer name (the Model column) in the browser whenever you open:

- **the Tools page** (`/tools/`). It only lists tools you are authorized to use, so it adds to the saved list.
- **the admin Tools page** (`/admin/tools/`), either directly or in the background from the Agenda page. It lists every tool, so it replaces the saved list. Checkable tools are skipped.

Neither waterfall shows tools that don't require a reservation ("Reservation not required" on the Tools page):

- Tools linked from the Tools page take reservations, since only those get a reserve link.
- Every other tool is checked on its admin edit page (the **Requires Reservation?** box), at most once a day per tool. The check runs when you open the admin Tools page, or in the background from the Agenda page, and needs the Manage Resources permission.
- A tool stays hidden until it has been checked. That includes a printer listed in `MODELS` whose box is unticked.

If the site says a saved tool no longer exists, that tool is dropped from the list. The settings page shows the saved list and has a **Forget saved tools** button. To add a printer that neither page shows you, put it in `TOOL_IDS` at the top of the script.

## Settings and minimize

- **⚙ on the chart header** (or **⚙ Waterfall settings** in the Tampermonkey menu) opens the settings page. There you can turn the waterfall on or off for the Tools page and the Agenda page, choose to show idle printers by default, and choose how rows are sorted. **Sort printers by machine type** is on by default: it groups rows by tool (all Prusa MK4s together, and so on), with types A–Z. Within a type, rows keep the `MODELS` order, and printers whose type isn't known yet go last. Turn it off to use the plain `MODELS` order. The settings page also lists the saved tools. Settings save right away. While the waterfall is off, you can only reach the settings from the Tampermonkey menu.
- **− on the chart header** minimizes the chart until you close the tab. While it is minimized, the Tools page doesn't fetch any reservations.
