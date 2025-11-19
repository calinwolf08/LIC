# Scheduling Configuration Scripts

This directory contains scripts for seeding and verifying the configurable scheduling framework.

## Scripts

### 1. `seed-scheduling-config.ts`

Seeds the database with comprehensive sample scheduling configurations.

**What it creates:**
- Health systems and sites
- Clerkship requirements with different scheduling strategies
- Hierarchical capacity rules
- Preceptor teams
- Fallback chains

**Usage:**
```bash
tsx scripts/seed-scheduling-config.ts
```

**Prerequisites:**
- Existing clerkships in database
- Existing preceptors in database
- Migrations applied

**Safe to run multiple times?** ⚠️ No - will create duplicate entries. Clear relevant tables first if re-running.

### 2. `verify-scheduling-config.ts`

Verifies and displays summary of existing scheduling configurations.

**Usage:**
```bash
tsx scripts/verify-scheduling-config.ts
```

**Output:**
- Health systems and sites count
- Clerkship requirements with strategies
- Capacity rules with hierarchy levels
- Preceptor teams with formation rules
- Fallback chains

**Safe to run multiple times?** ✅ Yes - read-only verification

## Installation

These scripts require `tsx` to run TypeScript files directly:

```bash
npm install -D tsx
```

Or add to package.json scripts:

```json
{
  "scripts": {
    "seed:config": "tsx scripts/seed-scheduling-config.ts",
    "verify:config": "tsx scripts/verify-scheduling-config.ts"
  }
}
```

Then run with:
```bash
npm run seed:config
npm run verify:config
```

## Workflow

### Initial Setup

1. **Create base data** (clerkships, preceptors, students):
   ```bash
   # Via UI or existing seed scripts
   ```

2. **Seed scheduling configurations**:
   ```bash
   tsx scripts/seed-scheduling-config.ts
   ```

3. **Verify configurations**:
   ```bash
   tsx scripts/verify-scheduling-config.ts
   ```

### Testing the Framework

After seeding:

1. Navigate to `/scheduling-config` in the browser
2. Click "Configure" on any clerkship
3. Review requirements, teams, and capacity rules
4. Go to `/scheduling-config/execute`
5. Select students and clerkships
6. Run scheduling engine
7. Review results

## Sample Data Details

See [docs/sample-configurations.md](../docs/sample-configurations.md) for detailed documentation of the sample data structure and testing scenarios.

## Troubleshooting

### Script fails with "No clerkships found"

**Solution:** Create clerkships first via UI or base seed script.

```bash
# Check clerkships
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM clerkships;"
```

### Script fails with "No preceptors found"

**Solution:** Create preceptors first.

```bash
# Check preceptors
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM preceptors;"
```

### TypeScript errors

**Solution:** Ensure dependencies are installed:

```bash
npm install
```

### Module import errors

**Solution:** Check that `tsconfig.json` has proper path mappings:

```json
{
  "compilerOptions": {
    "paths": {
      "$lib/*": ["./src/lib/*"]
    }
  }
}
```

## Cleaning Up Sample Data

To remove sample scheduling configurations:

```sql
-- Remove in dependency order
DELETE FROM preceptor_team_members;
DELETE FROM preceptor_teams;
DELETE FROM preceptor_fallbacks;
DELETE FROM preceptor_capacity_rules;
DELETE FROM clerkship_electives;
DELETE FROM clerkship_requirements;
DELETE FROM sites;
DELETE FROM health_systems;
```

Or use a script:

```bash
# TODO: Create cleanup script if needed
tsx scripts/cleanup-scheduling-config.ts
```

## Related Documentation

- [Sample Configurations Documentation](../docs/sample-configurations.md)
- [Configurable Scheduling Overview](../docs/configurable-scheduling.md)
- [API Reference](../docs/api-reference.md)
