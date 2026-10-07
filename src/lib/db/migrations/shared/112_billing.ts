import { sql, PostgresAdapter, type Kysely } from 'kysely';

/**
 * Migration 112 (shared): billing — customers, subscriptions, provider events.
 *
 * An organization is the billing unit. Its subscription names a plan
 * (`standard` | `pro`, see src/lib/billing/plans.ts) and the payment provider
 * that manages it (`manual` until a real processor is wired in). The app derives
 * entitlements from the subscription; nothing else grants them.
 *
 * - `billing_customers`  one row per organization known to a provider.
 * - `subscriptions`      at most one non-canceled row per organization (partial
 *                        unique index); canceled rows are kept as history.
 * - `billing_events`     provider webhooks, unique per (provider, event id), so a
 *                        redelivered webhook is recognised and applied once.
 *
 * `organization_id` is plain text, no FK: `organization` belongs to the auth
 * provider and is created outside the migration set (ensure-auth-tables.ts) —
 * the same convention `scheduling_periods.user_id` follows for `user`.
 *
 * Shared migration rules (see ../shared/README.md): import only from 'kysely',
 * dialect-agnostic builder, booleans/text (no boolean/timestamptz), idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
	const isPg = db.getExecutor().adapter instanceof PostgresAdapter;
	const nowText = isPg
		? sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`
		: sql`CURRENT_TIMESTAMP`;

	await db.schema
		.createTable('billing_customers')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('organization_id', 'text', (col) => col.notNull().unique())
		.addColumn('provider', 'text', (col) => col.notNull())
		.addColumn('provider_customer_id', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.execute();

	await db.schema
		.createTable('subscriptions')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('organization_id', 'text', (col) => col.notNull())
		.addColumn('plan_id', 'text', (col) => col.notNull())
		.addColumn('billing_interval', 'text', (col) =>
			col.notNull().check(sql`billing_interval IN ('month', 'year')`)
		)
		.addColumn('status', 'text', (col) =>
			col
				.notNull()
				.check(sql`status IN ('active', 'trialing', 'past_due', 'incomplete', 'canceled')`)
		)
		.addColumn('provider', 'text', (col) => col.notNull())
		.addColumn('provider_subscription_id', 'text')
		// ISO-8601 text; null for the manual provider (no billing period).
		.addColumn('current_period_end', 'text')
		// Set when the subscription enters past_due; entitlements lapse after it.
		.addColumn('grace_ends_at', 'text')
		.addColumn('cancel_at_period_end', 'integer', (col) => col.notNull().defaultTo(0))
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.execute();

	// One live subscription per organization; canceled ones are history.
	await db.schema
		.createIndex('subscriptions_one_live_per_org')
		.ifNotExists()
		.unique()
		.on('subscriptions')
		.column('organization_id')
		.where(sql.ref('status'), '<>', 'canceled')
		.execute();

	// Webhooks find their subscription by the provider's id.
	await db.schema
		.createIndex('subscriptions_provider_subscription_id')
		.ifNotExists()
		.unique()
		.on('subscriptions')
		.columns(['provider', 'provider_subscription_id'])
		.execute();

	await db.schema
		.createTable('billing_events')
		.ifNotExists()
		.addColumn('id', 'text', (col) => col.primaryKey())
		.addColumn('provider', 'text', (col) => col.notNull())
		.addColumn('provider_event_id', 'text', (col) => col.notNull())
		.addColumn('type', 'text', (col) => col.notNull())
		.addColumn('payload', 'text', (col) => col.notNull())
		.addColumn('processed_at', 'text')
		.addColumn('created_at', 'text', (col) => col.notNull().defaultTo(nowText))
		.execute();

	await db.schema
		.createIndex('billing_events_provider_event')
		.ifNotExists()
		.unique()
		.on('billing_events')
		.columns(['provider', 'provider_event_id'])
		.execute();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
	await db.schema.dropTable('billing_events').ifExists().execute();
	await db.schema.dropTable('subscriptions').ifExists().execute();
	await db.schema.dropTable('billing_customers').ifExists().execute();
}
