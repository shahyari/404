# Security

404 Pages runs code written by many people. The site's security depends on each experience staying inside its sandbox, so reports about that boundary are especially welcome.

## Reporting a vulnerability

Please report privately through [GitHub's private vulnerability reporting](https://github.com/shahyari/404/security/advisories/new). Don't open a public issue or pull request.

Include what an attacker could do, the steps to reproduce it, and the browser and version. You should get a reply within a week.

## In scope

- An experience reading or changing the main website, another experience, or another experience's stored data
- An experience navigating the visitor away without a click, or loading another website inside the frame
- An experience getting a capability it didn't request, or one that's never granted (see [docs/PERMISSIONS.md](docs/PERMISSIONS.md))
- A way for a pull request to get past `npm run check` with a refused permission
- Cross-site scripting or injection in the website itself

## Out of scope

- Something an experience is allowed to do by design, such as heavy CPU use, or following a link after the visitor clicks it. Report harmful experiences as a normal issue so they can be removed.
- Bugs that need a browser that no longer receives security updates.

## How isolation works

See [How isolation works](docs/PERMISSIONS.md#how-isolation-works) in the permissions guide.
