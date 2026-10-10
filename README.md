# Organization Services

OpenAPI 3.0.3 specifications and interactive Swagger UI documentation for an XML
Organization Collection service and a separate Organization Manager service.
The collection contract is [`openapi.yaml`](./openapi.yaml) (13 operations), and
the manager contract is [`openapi-manager.yaml`](./openapi-manager.yaml) (2 operations).
All 15 operations have textual descriptions, typed inputs, XML examples and documented error responses.

The site has separate static Swagger UI pages for the two specifications,
with navigation links between them.
Swagger UI 5.32.15 is included in `vendor/`, together with its license notices.
There is no build step, npm dependency, or CDN requirement.

This repository contains API contracts and documentation. A backend service must
be running separately for Swagger's "Try it out" requests to return API data.

## Files

```text
index.html           Collection Swagger UI page
manager.html         Manager Swagger UI page
openapi.yaml         Collection API specification
openapi-manager.yaml Manager API specification
swagger.css          Page styling
vendor/              Downloaded Swagger UI assets and license notices
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

- Create and replace requests carry an `application/xml` organization or employee body.
  IDs, filters, sorting and pagination are URL parameters. This is the agreed
  interpretation of the assignment's URL-only parameter requirement.
- `OrganizationWrite` excludes generated `id` and `creationDate`; `Organization`
  requires them. PUT replaces mutable fields and preserves ID, creation date and
  employee assignments. Organization creation starts without employees.
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
- Organization filters use `field:operator:value`, with comma-separated conditions
  combined with AND and case-sensitive string matching. Nested fields use dotted
  names. Use `annualTurnover:isNull:true`, `type:isNull:true`,
  `officialAddress:isNull:true`, or `officialAddress.town:isNull:true` for absent
  values; use `false` for present values. Ordinary comparisons exclude absent values.
- Sorting uses `sort=name,-annualTurnover`, with nulls last and ascending ID as
  the final tie-breaker. Enum order is `PUBLIC < GOVERNMENT < TRUST < PRIVATE_LIMITED_COMPANY`.
- Pagination uses `page=1&size=20` by default, with size 1-100. Responses are XML
  arrays such as `<organizations><organization>...</organization></organizations>`.
  `X-Total-Count`, `X-Page` and `X-Page-Size` supply metadata. An empty page is
  `200` with `<organizations/>`.
- Malformed requests or invalid URL parameters return `400`. Well-formed XML
  violating organization or employee constraints returns `422`. Missing organizations
  or employees return `404`; ownership conflicts, self-acquisition and deletion of
  nonempty organizations return `409`. Unsupported response and request media
  types return `406` and `415`, respectively.
- Type comparisons exclude null types, and turnover threshold comparisons exclude
  null turnovers. Turnover thresholds accept finite fractional values; zero or
  negative thresholds produce an empty result.
- `Employee` has a generated positive `int64` `id`, a required nonempty `name`,
  and an optional positive `organizationId`. Omit `organizationId` for an employee
  without an employer; XML nulls use omission. POST and PUT use `EmployeeWrite`,
  containing `name` and optional `organizationId`. PUT preserves the employee ID;
  omitting `organizationId` unassigns the employee. An unknown employer returns `404`.
- The collection exposes `POST /employees`, `GET /employees`, and
  `GET`, `PUT`, `DELETE /employees/{employeeId}`. Employee listing uses the same
  pagination headers and defaults as organizations. Sort by `id`, `name`, or
  `organizationId`; prefix a field with `-` for descending order. Employee filters
  use `field:operator:value`, combined with AND. Numeric fields support comparisons
  and `in`; names support `eq`, `ne`, `contains`, `startsWith`, and `in`.
  Use `filter=organizationId:eq:1` to list an organization's employees or
  `filter=organizationId:isNull:true` to list unassigned employees.
- Organization responses contain organization fields only, without embedded employees.
  This applies to list, get, create, update, and acquisition responses. Fetch employees
  separately with `GET /employees?filter=organizationId:eq:1&page=1&size=20`.
  Employee ownership is stored in `Employee.organizationId` and changed atomically
  through employee CRUD. Deleting an organization with employees returns `409`;
  the emptiness check and deletion are atomic. Delete-by-type follows the same rule.
- The manager hires an existing employee with
  `POST /orgmanager/hire/{id}?employeeId=123`: it reads the organization and employee,
  then updates that employee through `PUT /employees/{employeeId}`, preserving the
  name. An employee already at the destination is a successful no-op; an employee
  assigned elsewhere returns `409`. The response headcount comes from the
  `X-Total-Count` header of `GET /employees?filter=organizationId:eq:{id}&page=1&size=1`,
  fetching at most one employee rather than the entire workforce.
- Acquisition reads both organizations, fetches **all** pages of the acquired
  organization's employees, and saves their IDs before moving anyone. It reads and
  updates each employee through the employee API, preserving employee IDs and names.
  It deletes the acquired organization only after all transfers, then reads the
  acquirer's compact organization for the response. The manager obtains the final
  headcount from the same filtered employee page's `X-Total-Count` header. Other
  organization fields are preserved.
- Manager workflows use ordinary collection CRUD endpoints. There are no dedicated
  collection hiring or acquisition endpoints. The sequence is not atomic or
  isolated from concurrent writes: failures can leave some employees transferred.
  The manager retains the source employee IDs for recovery, checks current ownership,
  and skips employees already transferred. Unexpected reassignment or removal
  returns `409`. Organization deletion rejects remaining employees. After an
  uncertain deletion, recovery checks whether the source still exists and verifies
  the saved employees; a fresh request for an unknown source returns `404`.
  Invalid upstream responses map to `502`, temporary dependency unavailability
  to `503`, and upstream timeouts to `504`. Unexpected internal failures remain
  `500`. The last mutation may have applied, so the manager checks state before
  continuing and does not automatically retry mutations. There is no guaranteed
  rollback of completed transfers.
- Deleting an arbitrary match by type is deliberately a selection operation:
  successive successful DELETE requests can remove different objects. Its
  documentation explicitly prohibits automatic retries despite DELETE's usual
  idempotent semantics.

The two exact manager routes are `POST /orgmanager/hire/{id}` and
`POST /orgmanager/acquise/{acquirerId}/{acquiredId}`. The required spelling
`acquise` is intentional. Employee CRUD operations are documented under
the first service's Employees (`Сотрудники`) tag.

An organization response stays compact, regardless of its employee count:

```xml
<organization>
  <id>1</id>
  <name>Ромашка</name>
  <coordinates><x>10</x><y>20</y></coordinates>
  <creationDate>2026-10-10</creationDate>
</organization>
```

## Additional operation URLs

Use short resource paths and query parameters for comparisons:

| Operation | Request |
| --- | --- |
| Delete one organization matching a type | `DELETE /organizations/type/{type}` |
| Count organizations whose type is greater in enum order | `GET /organizations/count?typeGreaterThan=PUBLIC` |
| List organizations with lower annual turnover | `GET /organizations/turnover?lessThan=1000` |
| Acquire an organization | `POST /orgmanager/acquise/{acquirerId}/{acquiredId}` |

`typeGreaterThan` and `lessThan` are required query parameters. The turnover
route still accepts `page`, `size`, and `sort`; it does not accept `filter`.
Missing comparison parameters return `400` with the parameter name in `details`.
The previous longer collection URLs are replaced, without compatibility aliases.
Manager acquisition placeholders use camelCase; their positions in the actual
URL are unchanged. Update clients using the renamed collection routes.

## Errors and validation

Both services use the same XML error envelope. `status` equals the HTTP status,
`code` is a stable machine-readable error identifier, and `message` explains the
failure. `details` is always present. For `400` and `422`, it lists every
independently detectable violation; errors without a particular invalid field
use `<details/>`. Each detail identifies the input source (`path`, `query`,
`header`, or `body`), the field, a stable reason code, and the violated rule.
Nested fields use dotted paths; array indexes start at zero. `$` identifies a
body that cannot be parsed or has the wrong root.

For example, `GET /employees?sort=name,-name` returns `400`:

```xml
<error>
  <status>400</status>
  <code>INVALID_SORT</code>
  <message>Противоречащие направления сортировки.</message>
  <details>
    <detail>
      <location>query</location>
      <field>sort[1]</field>
      <code>CONFLICTING_SORT</code>
      <message>Поле name указано в обоих направлениях; выберите одно.</message>
    </detail>
  </details>
</error>
```

A well-formed organization body with an empty name and a missing required
coordinate returns `422`, identifying both fields:

```xml
<error>
  <status>422</status>
  <code>VALIDATION_FAILED</code>
  <message>Поля организации не прошли проверку.</message>
  <details>
    <detail>
      <location>body</location>
      <field>name</field>
      <code>TOO_SHORT</code>
      <message>name должен содержать минимум один символ.</message>
    </detail>
    <detail>
      <location>body</location>
      <field>coordinates.x</field>
      <code>REQUIRED</code>
      <message>Отсутствует обязательная координата x типа int64.</message>
    </detail>
  </details>
</error>
```

### Input rules

- Reject unknown query parameters, repeated parameters, and unexpected request
  bodies on operations without a declared body. Pass `sort` and `filter` once,
  using commas between entries. Omitted optional parameters use their defaults;
  empty or invalid values do not silently fall back to defaults.
- IDs must be decimal integers from 1 to 9223372036854775807. For example,
  `/organizations/abc`, `/employees/0`, and `employeeId=1.5` return `400`, with
  `field` set to the actual offending parameter (`id` or `employeeId`). A valid
  but nonexistent ID returns `404`. A missing path segment does not match its
  route and is a routing `404`; a missing required query parameter returns `400`.
- `page` must be an integer >= 1; `size` must be an integer from 1 to 100.
  Numeric fields must fit their declared Java types. Double values may be
  fractional but must be finite; reject NaN and infinities. Preserve the turnover
  threshold route's rule that finite zero or negative thresholds return an empty
  result. Body `annualTurnover` must remain strictly positive.
- Sorting permits only each resource's declared enum fields and one optional
  leading `-`. Reject empty terms, whitespace, `+name`, `--name`, unknown fields,
  duplicates (`name,name`), and conflicting directions (`name,-name`). Return
  `INVALID_SORT` with `sort[n]` and `UNKNOWN_FIELD`, `INVALID_FORMAT`,
  `DUPLICATE_SORT`, or `CONFLICTING_SORT`. Null ordering and the ID tie-breaker
  remain as documented.
- Filters reject unknown fields, malformed expressions, unsupported operators,
  and values that do not match the field's type and constraints. Numeric/date
  fields support comparisons and `in`; strings support `eq`, `ne`, `contains`,
  `startsWith`, and `in`; enum comparisons use the declared enum order.
  `isNull:true`/`isNull:false` applies only to optional fields or their descendants;
  objects allow only `isNull`. Employee fields are `id`, `name`, and
  `organizationId`; the employee list inside an organization is not filterable.
  Return `INVALID_FILTER` with `filter[n]` and the field/type/operator reason.
- The first two colons delimit the field and operator; later colons belong to
  the value. Commas delimit conditions and `|` delimits `in` values. Escaping
  commas and pipes inside values is unsupported. `in` requires nonempty values;
  empty strings are accepted only where that field allows them, while
  `contains`/`startsWith` require a nonempty search string.
- Missing required XML bodies and malformed XML return `400`. For syntactically
  valid XML, reject missing required fields, invalid types/ranges/enums, unknown
  elements at any level, duplicate singleton elements, wrong roots, `xsi:nil`,
  and generated fields such as `id` or `creationDate` with
  `422`. Optional objects may be omitted; if present, their own required fields
  must be supplied. Existing rules allowing whitespace names and empty ZIP/town
  names remain unchanged. Calendar dates must be real dates in years 0001–9999.
- Reject invalid input before applying changes. Errors occurring after a manager
  workflow begins can leave completed transfers in place. Do not expose internal
  stack traces or raw dependency error messages.

The OpenAPI schemas and descriptions define backend requirements. Swagger UI
alone does not enforce XML parsing, duplicate-element checks, cross-field sorting
rules, or filter semantics. This repository has no backend implementation.

### HTTP codes

These are the application statuses documented by the contracts. Infrastructure
may also produce routing or protocol errors outside these operation responses.
The meanings follow [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-15).

| Code | Meaning in this API | Where documented |
| --- | --- | --- |
| `200 OK` | Successful read, update, or manager operation. | Applicable reads and updates; both manager routes. |
| `201 Created` | A new organization or employee was created. | Collection creation routes. |
| `204 No Content` | Deletion succeeded; no response body. | Collection deletion routes. |
| `400 Bad Request` | Malformed request or invalid path/query input. | All operations. |
| `404 Not Found` | Requested resource or referenced employer does not exist. | Applicable resource and manager operations. |
| `406 Not Acceptable` | The requested response media type is unavailable. | All operations, including error responses. |
| `409 Conflict` | Current resource state prevents the operation. | Organization deletion and manager operations. |
| `415 Unsupported Media Type` | Unsupported body media type or content encoding. | The four collection operations accepting XML bodies. |
| `422 Unprocessable Content` | Well-formed XML violates body-field constraints. | The four collection operations accepting XML bodies. |
| `500 Internal Server Error` | Unexpected internal or integration failure. | All operations. |
| `502 Bad Gateway` | The manager received an invalid upstream response. | Both manager routes only. |
| `503 Service Unavailable` | Temporary overload, maintenance, or dependency unavailability. | All operations. |
| `504 Gateway Timeout` | The manager timed out waiting for the collection service. | Both manager routes only. |

`406` errors are described using XML; if the client excludes XML in `Accept`,
the server may return `406` without a body. XML request bodies require
`Content-Type: application/xml`; supported `Content-Encoding` is absent or
`identity`. A `503` may include `Retry-After` as a nonnegative number of seconds
when the delay is known. This header does not make mutation retries safe.

The manager validates client IDs locally, then translates dependency failures:

| Collection outcome | Manager response |
| --- | --- |
| Expected domain `404` or `409` | Preserve status and return the unified error format. |
| `400`, `415`, or `422` rejecting a manager-generated request | `500 INTEGRATION_FAILURE`; the client did not supply that body. |
| Valid upstream `500` | Sanitized `500 UPSTREAM_INTERNAL_ERROR`. |
| Invalid XML, wrong response media type, or missing required response fields | `502 INVALID_UPSTREAM_RESPONSE`. |
| Temporarily unavailable dependency or upstream `503` | `503 DEPENDENCY_UNAVAILABLE` or `503 SERVICE_UNAVAILABLE`. |
| Upstream timeout | `504 UPSTREAM_TIMEOUT`. |

The manager has no client-body `422` response. On mutations, `500`, `502`, `503`,
and `504` do not guarantee that no changes happened. Read current state before
continuing, preserve the acquisition recovery rules, and do not automatically
retry mutations.

## Configure backend URLs

Defaults are `http://localhost:8080` for the collection and `http://localhost:8081`
for the manager. They are placeholders for future implementations. To change
them permanently, edit the `servers[].variables.baseUrl.default` values in
`openapi.yaml` and `openapi-manager.yaml`, respectively. Each specification has
its own top-level server. Do not add `/orgmanager` to the manager
base URL because the operation paths already contain it.

Swagger UI also exposes editable server variables for the current page session.
Open the Manager page to configure the manager server.

The documentation port (`26125`) serves static files; it does not implement
`/organizations` or `/orgmanager` endpoints. "Try it out" sends real HTTP requests
to the configured API URLs, and documented examples are not automatic responses.
In a browser, `localhost` refers to the machine running the browser. APIs running
on Helios require separate port forwards or a publicly reachable API URL.

For cross-origin "Try it out", the API servers must allow the documentation's
origin, required methods (`GET`, `POST`, `PUT`, `DELETE`, and preflight `OPTIONS`)
and the `Content-Type` and `Accept` headers. Expose `Location`, `X-Total-Count`,
`X-Page`, `X-Page-Size`, and `Retry-After` to the browser. An HTTPS documentation site needs
HTTPS backend URLs to avoid mixed-content blocking. No authentication is specified.

## Deploy on se.ifmo.ru

Run the commands below **on the remote server**. This example publishes the
site in `~/public_html/soa-lab1/`.

1. Create the destination directory:

   ```sh
   mkdir -p "$HOME/public_html/soa-lab1"
   ```

2. Upload these files from the repository root directly into that directory,
   preserving the complete `vendor/` directory:

   ```text
   ~/public_html/soa-lab1/
   ├── index.html
   ├── manager.html
   ├── openapi.yaml
   ├── openapi-manager.yaml
   ├── swagger.css
   └── vendor/              (entire directory, including license notices)
   ```

   No build is required. You do not need to upload `node_modules/`, `dist/`,
   `.git/`, or test results.

3. Set access permissions after uploading. Directories need `755`; static files
   need `644`. If you receive **403 Forbidden**, repeat this step, including the
   permissions for your home directory and `public_html`:

   ```sh
   chmod 755 "$HOME" "$HOME/public_html"
   find "$HOME/public_html/soa-lab1" -type d -exec chmod 755 {} \;
   find "$HOME/public_html/soa-lab1" -type f -exec chmod 644 {} \;
   ```

4. Open `https://se.ifmo.ru/~YOUR_LOGIN/soa-lab1/`, replacing `YOUR_LOGIN` with
   your home directory name, for example `s264452`. The directory URL opens
   `index.html`; the manager page is at
   `https://se.ifmo.ru/~YOUR_LOGIN/soa-lab1/manager.html`.
   Check that both pages load their specifications and that navigation works.
   For updates, upload the changed files to the same locations and reload.

The server serves these static files directly; no Python HTTP server or SSH
port-forward is needed for this deployment.

## Run on Helios through an SSH tunnel (alternative)

On your local machine, from this repository's root directory, copy the page,
specification, stylesheet, and complete `vendor/` directory to your existing
remote directory:

```sh
ssh helios 'mkdir -p ~/soa/soa-lab1/dist'
scp -r index.html manager.html openapi.yaml openapi-manager.yaml swagger.css vendor helios:~/soa/soa-lab1/dist/
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
uploading changes. The collection page shows 13 operations; the Manager link
opens the remaining 2 operations. Neither page downloads assets from a CDN.

## References

- [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3.html)
- [OpenAPI XML modeling](https://spec.openapis.org/oas/v3.0.3.html#xml-object)
- [Swagger UI installation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/)
