import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true',
});

const normalizeBranchName = (name: string): string => {
  return name.trim().replace(/\s+/g, ' ');
};

const canonicalBranchName = (name: string): string => {
  return normalizeBranchName(name).toLowerCase();
};

async function cleanupDuplicateBranches() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected');

    const branchRepo = AppDataSource.getRepository('branches');

    // Get all branches grouped by organization
    const allBranches = await branchRepo.query(`
      SELECT id, organization_id, name, created_at, updated_at
      FROM branches
      ORDER BY organization_id, name, updated_at DESC, created_at DESC
    `);

    console.log(`Found ${allBranches.length} total branches`);

    // Group by organization and canonical name
    const branchMap = new Map<string, any[]>();
    
    for (const branch of allBranches) {
      const key = `${branch.organization_id}|${canonicalBranchName(branch.name)}`;
      if (!branchMap.has(key)) {
        branchMap.set(key, []);
      }
      branchMap.get(key)!.push(branch);
    }

    // Find duplicates
    let duplicatesFound = 0;
    let branchesDeleted = 0;

    for (const [key, branches] of branchMap.entries()) {
      if (branches.length > 1) {
        duplicatesFound++;
        console.log(`\nFound ${branches.length} duplicates for: ${branches[0].name}`);
        
        // Keep the most recently updated one
        const [keep, ...remove] = branches;
        console.log(`  Keeping: ${keep.id} (updated: ${keep.updated_at})`);
        
        for (const branch of remove) {
          console.log(`  Removing: ${branch.id} (updated: ${branch.updated_at})`);
          
          // Update employees that reference this branch to use the kept branch
          await branchRepo.query(
            `UPDATE employees SET branch_id = $1 WHERE branch_id = $2`,
            [keep.id, branch.id]
          );
          
          // Delete the duplicate branch
          await branchRepo.query(`DELETE FROM branches WHERE id = $1`, [branch.id]);
          branchesDeleted++;
        }
      }
    }

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Duplicate groups found: ${duplicatesFound}`);
    console.log(`   Branches deleted: ${branchesDeleted}`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error cleaning up duplicate branches:', error);
    process.exit(1);
  }
}

cleanupDuplicateBranches();
