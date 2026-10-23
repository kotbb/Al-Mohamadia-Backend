# Manual removal of item codes

The updated applications no longer require, accept, generate, search or return item codes. Item references continue using `_id`; no replacement code or name-uniqueness rule is introduced. Removing the schema declaration does not remove an existing database index or stored fields.

## Transition order

1. Prepare the matching frontend and backend versions. Old clients sending `code` receive validation errors from the updated API.
2. Pause writes and stop all old backend instances so they cannot write codes or recreate the old index.
3. In **mongosh**, select the intended application database and run the commands below.
4. Start the updated backend and frontend, verify item creation/editing and name search, then resume writes. Do not restart the old backend after cleanup; it still requires codes.

These commands are manual only. No migration, application startup hook, or live database operation is added by this change.

## Commands

Inspect the selected database and existing indexes:

```javascript
db.getName();
db.items.getIndexes();
```

Drop indexes whose only key is the ascending `code` field, using their actual names. Preserve `_id` and category indexes:

```javascript
db.items.getIndexes()
  .filter(index =>
    Object.keys(index.key).length === 1 &&
    index.key.code === 1
  )
  .forEach(index => db.items.dropIndex(index.name));
```

Remove the code field from all item documents, including inactive and soft-deleted items:

```javascript
db.items.updateMany(
  { code: { $exists: true } },
  { $unset: { code: "" } }
);
```

Verify no item still contains a code:

```javascript
db.items.countDocuments({ code: { $exists: true } });
// Expected: 0

db.items.getIndexes();
// The previous code-only index should be absent.
```

Drop the old unique index **before** unsetting fields: otherwise active items with missing codes can conflict with each other. Repeating the cleanup is safe: missing code-only indexes are skipped, and documents already without codes are not modified.

Only `items.code` and obsolete single-field ascending-code indexes are removed. Other item fields, `_id`, names, prices, stock, timestamps, references, historical audit records and other collections remain unchanged. Direct MongoDB updates do not invoke Mongoose timestamp hooks.

The temporary-database integration tests verify field/index removal, repeat execution, active/inactive/deleted records, and preservation of unrelated data. The application database is not used by those tests.
