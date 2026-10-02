# Organization Services

OpenAPI 3.0.3 specifications and interactive Swagger UI documentation for an XML
Organization Collection service and a separate Organization Manager service.
The source of truth is [`openapi.yaml`](./openapi.yaml). All 13 operations have
textual descriptions, typed inputs, XML examples and documented error responses.

The site is a static HTML page that loads the specification with Swagger UI.
Swagger UI 5.32.15 is included in `vendor/`, together with its license notices.
There is no build step, npm dependency, or CDN requirement.

This repository contains API contracts and documentation. A backend service must
be running separately for Swagger's "Try it out" requests to return API data.

## Files

```text
index.html       HTML page and Swagger UI initialization
openapi.yaml     API specification
swagger.css      Page styling
vendor/          Downloaded Swagger UI assets and license notices
```

## Run locally

From this repository's root directory, start a static HTTP server:

```sh
python3 -m http.server 26125 --bind 127.0.0.1
```

Open <http://127.0.0.1:26125/>. If your Python 3 executable is named `python`,
use that instead of `python3`. Leave the server running while using the page.
Opening `index.html` with `file://` prevents the specification fetch in browsers.
Edits to the HTML, CSS, or YAML take effect after reloading the page.

## API decisions

- Create and replace requests carry an `application/xml` organization body.
  IDs, filters, sorting and pagination are URL parameters. This is the agreed
  interpretation of the assignment's URL-only parameter requirement.
- `OrganizationWrite` excludes generated `id` and `creationDate`; `Organization`
  requires them. PUT replaces mutable fields and preserves ID, creation date and headcount.
- Every required Java field is explicitly required in the API, including both
  primitive coordinates. `name` is nonempty, but not necessarily nonblank.
  ZIP codes and town names can be empty. Town coordinates can be zero or negative.
- `coordinates.x` is a Java `long` (`int64`) and `coordinates.y` is a Java `int`
  (`int32`). Both are required. There is no additional limit of 417 on `y`.
- `annualTurnover` is an optional positive finite Java `Double`, including
  fractional values. `type` is also optional.
- XML nulls are represented by omitted `annualTurnover`, `type`, `officialAddress`
  or `town` elements.
  An empty ZIP code uses `<zipCode/>`. `xsi:nil` is unsupported. An empty address
  or town is invalid because their own required fields are missing.
- `creationDate` is a generated Java `LocalDate` in `YYYY-MM-DD` format
  (OpenAPI `date`), with valid calendar dates and years 0001-9999. It contains
  no time or timezone suffix. Collection instances share a configured time zone
  when generating the current date.
- Java Long values remain decimal integers in XML. Clients must preserve all 64
  bits; JavaScript clients must not parse large IDs or `int64` coordinates through `Number`.
- All scalar fields have optional equality filters. Nested fields use dotted
  names. Filters combine with AND and exact, case-sensitive string matching.
  `annualTurnover.isNull`, `type.isNull`, `officialAddress.isNull` and
  `officialAddress.town.isNull` select null or present values. Ordinary equality
  filters match only non-null values.
- Sorting uses `sort=name,-annualTurnover`, with nulls last and ascending ID as
  the final tie-breaker. Enum order is `PUBLIC < GOVERNMENT < TRUST < PRIVATE_LIMITED_COMPANY`.
- Pagination uses `page=1&size=20` by default, with size 1-100. Responses are XML
  arrays such as `<organizations><organization>...</organization></organizations>`.
  `X-Total-Count`, `X-Page` and `X-Page-Size` supply metadata. An empty page is
  `200` with `<organizations/>`.
- Malformed requests or invalid URL parameters return `400`. Well-formed XML
  violating organization constraints returns `422`. Missing organizations return
  `404`; self-acquisition and overflow return `409`. Unsupported response and
  request media types return `406` and `415`, respectively.
- Type comparisons exclude null types, and turnover threshold comparisons exclude
  null turnovers. Turnover thresholds accept finite fractional values; zero or
  negative thresholds produce an empty result.
- Employee counts are separate collection-service resources, initially zero.
  Hiring increments one count atomically. Acquisition transfers all employees
  and deletes the acquired organization. It preserves every field of the acquirer,
  including annual turnover, and changes only its separate headcount.
  Validation failure or headcount overflow leaves both organizations unchanged.
- The manager calls the collection service's atomic hiring/acquisition endpoints.
  It forwards domain failures and maps upstream failures/timeouts to `502`/`504`.
  Mutations are not automatically retried because their outcome may be unknown.
- Deleting an arbitrary match by type is deliberately a selection operation:
  successive successful DELETE requests can remove different objects. Its
  documentation explicitly prohibits automatic retries despite DELETE's usual
  idempotent semantics.

The two exact manager routes are `POST /orgmanager/hire/{id}` and
`POST /orgmanager/acquise/{acquirer-id}/{acquired-id}`. The required spelling
`acquise` is intentional. Supporting workforce operations are documented under
the first service's Workforce tag.

## Configure backend URLs

Defaults are `http://localhost:8080` for the collection and `http://localhost:8081`
for the manager. They are placeholders for future implementations. To change
them permanently, edit the `servers[].variables.baseUrl.default` values in
`openapi.yaml`: the top-level server for the collection and the operation-level
servers for both `/orgmanager` routes. Do not add `/orgmanager` to the manager
base URL because the operation paths already contain it.

Swagger UI also exposes editable server variables for the current page session.
Each manager operation exposes its own server control when expanded.

The documentation port (`26125`) serves static files; it does not implement
`/organizations` or `/orgmanager` endpoints. "Try it out" sends real HTTP requests
to the configured API URLs, and documented examples are not automatic responses.
In a browser, `localhost` refers to the machine running the browser. APIs running
on Helios require separate port forwards or a publicly reachable API URL.

For cross-origin "Try it out", the API servers must allow the documentation's
origin, required methods (`GET`, `POST`, `PUT`, `DELETE`, and preflight `OPTIONS`)
and the `Content-Type` and `Accept` headers. Expose `Location`, `X-Total-Count`,
`X-Page` and `X-Page-Size` to the browser. An HTTPS documentation site needs
HTTPS backend URLs to avoid mixed-content blocking. No authentication is specified.

## Run on Helios through an SSH tunnel

On your local machine, from this repository's root directory, copy the page,
specification, stylesheet, and complete `vendor/` directory to your existing
remote directory:

```sh
ssh helios 'mkdir -p ~/soa/soa-lab1/dist'
scp -r index.html openapi.yaml swagger.css vendor helios:~/soa/soa-lab1/dist/
```

The remote directory is still named `dist` to match your existing deployment;
it contains direct copies of the source files, with no local build required.
The upload overwrites matching files. Unrelated remote files may remain and
are not required by this page.

In one terminal, connect to Helios. Stop the previous HTTP server with Ctrl+C
if it is already using port `26125`, then start the server from that directory:

```sh
ssh helios
cd ~/soa/soa-lab1/dist
python -m http.server 26125 --bind 127.0.0.1
```

In a second local terminal, forward the documentation port:

```sh
ssh -N -o ExitOnForwardFailure=yes -L 26125:127.0.0.1:26125 helios
```

If you already have this tunnel open, reuse it. Keep both terminals open and
visit <http://127.0.0.1:26125/> on your local machine. Reload the page after
uploading changes. All 13 operations should appear, with no asset downloads
from a CDN.

## References

- [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3.html)
- [OpenAPI XML modeling](https://spec.openapis.org/oas/v3.0.3.html#xml-object)
- [Swagger UI installation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/)
