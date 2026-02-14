# Quick Fix: Migration Command

You forgot the `.sql` extension! Use:

```bash
npx wrangler d1 execute growl-db --file=migrations/0001_initial_schema.sql
```

Note the `.sql` at the end!
