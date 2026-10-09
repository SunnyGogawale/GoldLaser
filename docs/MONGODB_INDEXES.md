# MongoDB Indexes

Schema indexes are declared in the Mongoose models. The production server disables automatic index builds; install declared indexes as a deployment step with `npm run db:indexes` after setting `MONGODB_URI` to the target database. The installer is idempotent, only creates declared indexes that are missing, never drops indexes, and checks duplicate data before creating any pending unique index. If an existing index has the same key pattern but incompatible options, installation stops for manual review rather than modifying it.

Build indexes during a low-traffic deployment window. MongoDB's online index builds still consume database resources. The installer checks uniqueness before building, but concurrent writes can still introduce a duplicate after the check; MongoDB will reject that index build and the command will fail without deleting data or existing indexes.

## Declared Indexes

| Collection | Indexes | Workloads |
| --- | --- | --- |
| `users` | unique `email`; `createdAt` descending; `roll` | Login lookup, user list ordering, role filtering (case-insensitive regex counts may still scan the index) |
| `customers` | unique `id`; `createdAt` descending; `customerName`, `companyName`, `contactNumber`, `email` | Customer identity lookups and supported list sorts |
| `vendors` | unique `id`; `createdAt` descending; `vendorName`, `companyName`, `contactNumber`, `email` | Vendor identity lookups and supported list sorts |
| `products` | unique `productNameKey`; `{ isActive, productName }` | Case-insensitive duplicate prevention and active product listing/sort |
| `customercustomfields` | unique `fieldName`; `createdAt` ascending | Field-name lookup and settings list ordering |
| `vendorcustomfields` | unique `fieldName`; `createdAt` ascending | Field-name lookup and settings list ordering |
| `saleinvoices`, `purchaseinvoices` | unique `invoiceNumber`; `{ clientId, clientType, invoiceDate, createdAt }`; `{ invoiceDate, createdAt }`; partial legacy `{ customerId/vendorId, invoiceDate, createdAt }` | Invoice lookup, customer/vendor ledgers, date filtering and report/dashboard date ranges |
| `salepayments`, `purchasepayments` | unique `paymentNumber`; `{ clientId, clientType, paymentDate, createdAt }`; `{ paymentDate, createdAt }`; `allocations.invoiceId`; partial legacy `{ customerId/vendorId, paymentDate, createdAt }` | Payment lookup, ledgers, date filtering, allocated-payment lookups |
| `companysettings`, `customerformsettings` | MongoDB's built-in `_id` index only | These are singleton settings collections queried without predicates |

The legacy indexes use a partial filter requiring the legacy ID field to exist, so current records using `clientId`/`clientType` do not consume extra index entries. Existing unique schema constraints are retained; no new uniqueness rules or TTL/text indexes are introduced.

## Verify Query Plans

Run `npm run db:indexes:explain` against the same database after installation. It runs `explain("executionStats")` for ledger, date-range, legacy statement, allocation, and common list/lookup query shapes, bounding returned documents to one. It exits unsuccessfully if a winning plan does not contain `IXSCAN`. Set `INDEX_EXPLAIN_CLIENT_ID` to an existing client ObjectId to use a representative ledger key; otherwise a fixed valid but normally absent ObjectId is used to validate plan selection without scanning a client's full history. Date-range probes default to a future date so they validate index selection without walking historical records; set `INDEX_EXPLAIN_FROM_DATE` to a representative ISO date to measure a real range.

For a direct Mongo shell check, substitute an existing customer ID:

```javascript
db.saleinvoices.find({ clientId: ObjectId("<customer-id>"), clientType: "Customer" })
  .sort({ invoiceDate: 1, createdAt: 1 })
  .explain("executionStats")
```

Check `queryPlanner.winningPlan` for `IXSCAN` and compare `totalKeysExamined`, `totalDocsExamined`, and `nReturned`. Capture the same explain before a deployment that adds indexes to establish a workload-specific baseline. No numeric before/after latency claim is made here because it depends on the target database's data volume, existing indexes, and cache state.

## Known Limits

Customer/vendor broad search and invoice/payment search fetch documents and filter in application memory; substring search across custom fields, populated client data, and computed balances cannot be accelerated by a conventional single-field or text index without changing query semantics. Those endpoints remain candidates for a separate query/pagination redesign. The current index work specifically covers MongoDB-side predicates and sorts found in the routes, aggregations, and reports.