import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const ORG_ID = '4750a13d-c530-4583-aa8b-36733d06ec22';
const databaseUrl = process.env.DATABASE_URL;
const useSsl = Boolean(databaseUrl) || process.env.DB_SSL === 'true';

const dataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      }),
  ...(useSsl && { ssl: { rejectUnauthorized: false } }),
});

async function seedTodayAttendance() {
  await dataSource.initialize();
  console.log('Database connected');

  const today = new Date().toISOString().split('T')[0];
  
  // Clear today's attendance first
  await dataSource.query(
    `DELETE FROM attendance_logs WHERE organization_id = $1 AND DATE(timestamp) = $2`,
    [ORG_ID, today]
  );
  await dataSource.query(
    `DELETE FROM attendance WHERE organization_id = $1 AND attendance_date = $2`,
    [ORG_ID, today]
  );
  console.log('Cleared existing attendance for today\n');
  
  // Get active employees
  const employees = await dataSource.query(
    `SELECT user_id, first_name, last_name FROM employees WHERE organization_id = $1 AND status = 'active' LIMIT 20`,
    [ORG_ID]
  );

  console.log(`Found ${employees.length} employees`);

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    
    // Make first employee absent
    if (i === 0) {
      await dataSource.query(
        `INSERT INTO attendance (organization_id, user_id, attendance_date, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'absent', NOW(), NOW())`,
        [ORG_ID, emp.user_id, today]
      );
      console.log(`✓ ${emp.first_name} ${emp.last_name} - absent`);
      continue;
    }
    const randomHour = 8 + Math.floor(Math.random() * 3); // 8-10 AM
    const randomMinute = Math.floor(Math.random() * 60);
    const inTime = new Date();
    inTime.setHours(randomHour, randomMinute, 0, 0);

    const outHour = 17 + Math.floor(Math.random() * 3); // 5-7 PM
    const outMinute = Math.floor(Math.random() * 60);
    const outTime = new Date();
    outTime.setHours(outHour, outMinute, 0, 0);

    const workingMinutes = Math.floor((outTime.getTime() - inTime.getTime()) / 60000);
    const status = randomHour <= 9 ? 'present' : 'late';

    // Insert attendance
    await dataSource.query(
      `INSERT INTO attendance (organization_id, user_id, attendance_date, in_time, out_time, working_minutes, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [ORG_ID, emp.user_id, today, inTime, outTime, workingMinutes, status]
    );

    // Insert check-in log
    await dataSource.query(
      `INSERT INTO attendance_logs (organization_id, user_id, timestamp, type, source, created_at)
       VALUES ($1, $2, $3, 'check-in', 'web', NOW())`,
      [ORG_ID, emp.user_id, inTime]
    );

    // Insert check-out log
    await dataSource.query(
      `INSERT INTO attendance_logs (organization_id, user_id, timestamp, type, source, created_at)
       VALUES ($1, $2, $3, 'check-out', 'web', NOW())`,
      [ORG_ID, emp.user_id, outTime]
    );

    console.log(`✓ ${emp.first_name} ${emp.last_name} - ${status} (${randomHour}:${randomMinute.toString().padStart(2, '0')} - ${outHour}:${outMinute.toString().padStart(2, '0')})`);
  }

  await dataSource.destroy();
  console.log('\n✅ Today\'s attendance seeded successfully!');
}

seedTodayAttendance().catch(console.error);
