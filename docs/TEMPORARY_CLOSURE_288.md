# Temporary welcome screen — ticket 288

This change replaces the public storefront with a static French welcome screen:
« Nous serons de retour le 23 octobre. » No exact reopening time is advertised.

The public HTML, its stylesheet, screenshots, and local preview launcher change.
`python main.py` serves the same index.html rather than loading main.js directly.
Restart the launcher after updating it. There are no
Worker, API, ordering-settings, Stripe, DNS or secret changes. No scripts or
automatic reopening are included. The existing checkout backend is unchanged;
this page does not enforce a backend ordering shutdown.

Publish the reviewed static files through the existing site publication process.
For reopening, restore index.html from the parent revision, remove the new
404.html if it is no longer desired, and publish. Preserve any unrelated changes.

Screenshots in docs/evidence/288 show the page at desktop and mobile widths.
The live site has not been changed by preparing this PR.
