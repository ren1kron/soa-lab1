# Organization Services

OpenAPI 3.0.3 specifications and interactive Swagger UI documentation for an XML
Organization Collection service and a separate Organization Manager service.
The source of truth is [`openapi.yaml`](./openapi.yaml). All 13 operations have
textual descriptions, typed inputs, XML examples and documented error responses.

This repository contains the API contracts and documentation, not backend services.
Browser tests intercept API requests to verify Swagger's request generation; they
do not demonstrate backend business behavior. Helios deployment is prepared but
has not been performed.

## Run locally

Requires Node.js 22 or newer and npm.

```sh
npm ci
npm run build
npm run preview
```

Open <http://127.0.0.1:4400/>. If the port is occupied, use
`PORT=4401 npm run preview`. Serve the generated `dist/` directory over HTTP;
opening `index.html` with `file://` prevents the specification fetch in browsers.

`dist/` contains the specification, HTML, stylesheet, initializer, pinned Swagger
UI assets and third-party license notices. It needs only a static web server,
without Node.js, a CDN or an external specification validator on Helios.

## API decisions

- Create and replace requests carry an `application/xml` organization body.
  IDs, filters, sorting and pagination are URL parameters. This is the agreed
  interpretation of the assignment's URL-only parameter requirement.
- `OrganizationWrite` excludes generated `id` and `creationDate`; `Organization`
  requires them. PUT replaces mutable fields and preserves ID, timestamp and headcount.
- Every required Java field is explicitly required in the API, including both
  primitive coordinates. `name` is nonempty, but not necessarily nonblank.
  ZIP codes and town names can be empty. Town coordinates can be zero or negative.
- XML nulls are represented by omitted `officialAddress` or `town` elements.
  An empty ZIP code uses `<zipCode/>`. `xsi:nil` is unsupported. An empty address
  or town is invalid because their own required fields are missing.
- Creation timestamps use local ISO calendar time with seconds and optional
  nanoseconds, no timezone suffix, and years 0001-9999. Collection instances must
  share a configured time zone. This is a custom `local-date-time` format, not
  OpenAPI's RFC 3339 `date-time` format.
- Java Long values remain decimal integers in XML. Clients must preserve all 64
  bits; JavaScript clients must not parse large IDs through `Number`.
- All scalar fields have optional equality filters. Nested fields use dotted
  names. Filters combine with AND and exact, case-sensitive string matching.
  `officialAddress.isNull` and `officialAddress.town.isNull` test nullable objects.
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
- Employee counts are separate collection-service resources, initially zero.
  Hiring increments one count atomically. Acquisition sums turnover and headcount,
  preserves the acquirer's other fields, and deletes the acquired organization.
  Validation failure or overflow must leave both organizations unchanged.
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
for the manager. They are placeholders for future implementations. Set the actual
backend URLs when building, without adding `/orgmanager` to the manager base URL:

```sh
ORGANIZATION_API_URL=https://api.example.org/collection \
MANAGER_API_URL=https://api.example.org/manager \
npm run build
```

The source specification is unchanged; server defaults are updated only in
`dist/openapi.yaml`. Swagger UI also exposes editable server variables. Each
manager operation overrides the collection service's server URL and exposes its
own server control when expanded in Swagger UI.

For cross-origin "Try it out", the API servers must allow the documentation's
origin, required methods (`GET`, `POST`, `PUT`, `DELETE`, and preflight `OPTIONS`)
and the `Content-Type` and `Accept` headers. Expose `Location`, `X-Total-Count`,
`X-Page` and `X-Page-Size` to the browser. An HTTPS documentation site needs
HTTPS backend URLs to avoid mixed-content blocking. No authentication is specified.

## Validate

```sh
npm run validate
npm test
npx playwright install chromium
npm run test:ui
```

`npm run check` runs all checks. An existing Google Chrome installation can be
used instead of downloading Chromium: `PLAYWRIGHT_CHANNEL=chrome npm run test:ui`.
UI tests run at desktop and mobile sizes, intercept API calls, verify XML bodies
and URL serialization, and exercise a Helios-style nested documentation path.
Screenshots are written under `test-results/`; failed tests also retain traces.

Validation checks OpenAPI structure and references, unique operation IDs, URL
parameters, and every request/response XML example against its schema. Contract
tests cover generated fields, required/nested fields, numeric boundaries,
nulls and empty strings, local calendar dates, filters, sorting, pagination,
enum order, failure responses and the manager's server overrides.

Future backend acceptance checks must additionally verify persisted CRUD,
combined-filter results, stable pagination, delete-exactly-one behavior, strict
threshold comparisons, concurrent hires, acquisition conservation of employees,
transaction rollback on overflow, and upstream timeout behavior. Those behaviors
cannot be executed against a specification alone.

## Prepare and deploy to Helios

Use the SSH account, port and public web directory assigned to you. No host,
account or Helios web-directory layout is assumed. `HELIOS_WEB_DIR` is a dedicated
documentation directory, absolute or relative to the remote home directory; use
`public_html/soa-lab1`, for example, only if that is your actual web directory.
SSH uses your existing authentication and host-key configuration; no credentials
are stored in this repository.

```sh
export HELIOS_HOST=your-helios-ssh-host
export HELIOS_USER=your-account
export HELIOS_PORT=22
export HELIOS_WEB_DIR=public_html/soa-lab1
export HELIOS_PUBLIC_URL=https://your-public-host/~your-account/soa-lab1/

npm run deploy -- --dry-run
```

The dry run validates configuration, builds the static site, and prints the
exact `ssh` and `scp` commands without connecting. Preserve any configured
`ORGANIZATION_API_URL` and `MANAGER_API_URL` in the environment when using
`npm run deploy`, because that command rebuilds the site.

When the destination is correct, upload with:

```sh
npm run deploy
curl --fail --head "$HELIOS_PUBLIC_URL"
curl --fail --head "${HELIOS_PUBLIC_URL}openapi.yaml"
```

The upload creates the target directory and overwrites matching documentation
files; it does not delete unrelated remote files or change remote permissions.
The target must already be accessible to the Helios web server according to
your account's hosting setup. Check the public URL in a browser, all 13
operations, relative assets, and both configured API server URLs after upload.

## References

- [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3.html)
- [OpenAPI XML modeling](https://spec.openapis.org/oas/v3.0.3.html#xml-object)
- [Swagger UI installation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/)
