This file is also mirrored on greasy fork for easy installation. The link can be found here: https://greasyfork.org/en/scripts/572099-engineering-design-hub-reservation-waterfall

This was developed with the help of generative AI

## Where the waterfall shows up

- **Admin agenda** (`/admin/agenda/`): built from the Today's Reservations table.
- **Tools page** (`https://designhub-manager.unl.edu/tools/`): built from `GET /tools/<id>/reservations.json`, which works without logging in. It loads every saved tool (see below). The JSON doesn't include user names, so bars show the reservation's time span (or its title, if it has one).

## Saved tools

The script saves each tool's ID and printer name (the Model column) in the browser whenever you open:

- **the Tools page** (`/tools/`). It only lists tools you are authorized to use, so it adds to the saved list.
- **the admin Tools page** (`/admin/tools/`). It lists every tool, so it replaces the saved list. Checkable tools are skipped.

If the site says a saved tool no longer exists, that tool is dropped from the list. The settings page shows the saved list and has a **Forget saved tools** button. To add a printer that neither page shows you, put it in `TOOL_IDS` at the top of the script.

## Settings and minimize

- **⚙ on the chart header** (or **⚙ Waterfall settings** in the Tampermonkey menu) opens the settings page. There you can turn the waterfall on or off for the Tools page and the Agenda page, and choose to show idle printers by default. It also lists the saved tools. Settings save right away. While the waterfall is off, you can only reach the settings from the Tampermonkey menu.
- **− on the chart header** minimizes the chart until you close the tab. While it is minimized, the Tools page doesn't fetch any reservations.
