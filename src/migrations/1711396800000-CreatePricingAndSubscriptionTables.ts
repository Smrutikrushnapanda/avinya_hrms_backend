import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
} from 'typeorm';

export class CreatePricingAndSubscriptionTables1711396800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create pricing_plans table
    await queryRunner.createTable(
      new Table({
        name: 'pricing_plans',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'plan_type',
            type: 'enum',
            enum: ['BASIC', 'PRO', 'ENTERPRISE'],
            enumName: 'pricing_plan_type_enum',
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'price',
            type: 'integer',
          },
          {
            name: 'display_price',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'features',
            type: 'jsonb',
            default: "'[]'",
          },
          {
            name: 'included_features',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'support_level',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'customizable',
            type: 'boolean',
            default: false,
          },
          {
            name: 'contact_email',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'contact_phone',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create subscriptions table
    await queryRunner.createTable(
      new Table({
        name: 'subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'organization_id',
            type: 'uuid',
          },
          {
            name: 'plan_id',
            type: 'uuid',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['ACTIVE', 'INACTIVE', 'EXPIRED', 'TRIAL'],
            enumName: 'subscription_status_enum',
            default: "'ACTIVE'",
          },
          {
            name: 'start_date',
            type: 'date',
          },
          {
            name: 'end_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'renewal_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'auto_renew',
            type: 'boolean',
            default: false,
          },
          {
            name: 'billing_cycle_months',
            type: 'integer',
            isNullable: true,
            default: 1,
          },
          {
            name: 'total_paid',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'payment_method',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'customizations',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add foreign key
    await queryRunner.createForeignKey(
      'subscriptions',
      new TableForeignKey({
        name: 'fk_subscriptions_plan_id',
        columnNames: ['plan_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'pricing_plans',
        onDelete: 'RESTRICT',
      }),
    );

    // Add index for faster queries
    await queryRunner.query(
      `CREATE INDEX idx_subscriptions_organization_id ON subscriptions(organization_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_subscriptions_status ON subscriptions(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_pricing_plans_is_active ON pricing_plans(is_active)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pricing_plans_is_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscriptions_plan_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscriptions_status`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_subscriptions_organization_id`,
    );

    // Drop foreign key
    await queryRunner.dropForeignKey(
      'subscriptions',
      'fk_subscriptions_plan_id',
    );

    // Drop tables
    await queryRunner.dropTable('subscriptions', true);
    await queryRunner.dropTable('pricing_plans', true);
  }
}
