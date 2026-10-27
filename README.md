This file is also mirrored on greasy fork for easy installation. The link can be found here: https://greasyfork.org/en/scripts/572099-engineering-design-hub-reservation-waterfall

This was developed with the help of generative AI

## Where the waterfall shows up

- **Admin agenda** (`/admin/agenda/`): built from the Today's Reservations table.
- **Tools page** (`https://designhub-manager.unl.edu/tools/`): built from `GET /tools/<id>/reservations.json`, which works without logging in. The script reads each tool's ID and printer name from the tool list on the page (the `/tools/<id>/reserve/` link and the Model column). That list only shows tools you are authorized to use, so add any other printer to `TOOL_IDS` at the top of the script. The JSON doesn't include user names, so bars show the reservation's time span (or its title, if it has one).

## Settings and minimize

- **⚙ on the chart header** (or **⚙ Waterfall settings** in the Tampermonkey menu) opens the settings page. There you can turn the waterfall on or off for the Tools page and the Agenda page, and choose to show idle printers by default. It also lists the tool IDs found on the Tools page and the printer name each one maps to. Settings save right away. While the waterfall is off, you can only reach the settings from the Tampermonkey menu.
- **− on the chart header** minimizes the chart until you close the tab. While it is minimized, the Tools page doesn't fetch any reservations.
