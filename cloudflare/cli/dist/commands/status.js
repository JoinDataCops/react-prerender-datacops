/**
 * `cf-prerender status` — Show deployment health and cache stats.
 */
import chalk from 'chalk';
import ora from 'ora';
import { getApiToken, getProject } from '../lib/config.js';
import { listWorkers, listD1Databases } from '../lib/cf-api.js';
import { listAccounts } from '../lib/cf-api.js';
export async function statusCommand() {
    const token = getApiToken();
    if (!token) {
        console.log(chalk.red('  Not logged in. Run `cf-prerender login` first.'));
        process.exit(1);
    }
    const project = getProject();
    if (!project) {
        console.log(chalk.red('  No project configured. Run `cf-prerender init` first.'));
        process.exit(1);
    }
    console.log(chalk.bold.cyan('\n  Prerender System Status\n'));
    const spinner = ora('Checking deployment...').start();
    try {
        const accounts = await listAccounts(token);
        const accountId = accounts[0]?.id;
        if (!accountId)
            throw new Error('No account found');
        const [workers, databases] = await Promise.all([
            listWorkers(token, accountId),
            listD1Databases(token, accountId),
        ]);
        spinner.stop();
        // Worker status
        const worker = workers.find((w) => w.id === project.workerName || w.id?.includes(project.workerName));
        const workerStatus = worker
            ? chalk.green('✓ deployed')
            : chalk.red('✗ not found');
        console.log(`  Worker   ${chalk.bold(project.workerName.padEnd(30))} ${workerStatus}`);
        if (worker) {
            console.log(chalk.dim(`           Modified: ${new Date(worker.modified_on).toLocaleString()}`));
        }
        // D1 status
        const db = databases.find((d) => d.name === project.dbName || d.uuid === project.dbId);
        const dbStatus = db ? chalk.green('✓ exists') : chalk.red('✗ not found');
        console.log(`\n  Database ${chalk.bold(project.dbName.padEnd(30))} ${dbStatus}`);
        if (db) {
            console.log(chalk.dim(`           ID: ${db.uuid}`));
            if (db.num_tables !== undefined) {
                console.log(chalk.dim(`           Tables: ${db.num_tables}`));
            }
            if (db.file_size !== undefined) {
                console.log(chalk.dim(`           Size: ${formatBytes(db.file_size)}`));
            }
        }
        // Live worker health check
        if (project.workerUrl && project.workerSecret) {
            console.log('\n  Pinging worker...');
            try {
                const res = await fetch(`${project.workerUrl}/api/health`, {
                    signal: AbortSignal.timeout(8000),
                });
                if (res.ok) {
                    const data = await res.json();
                    console.log(`  Health   ${chalk.green('✓ ' + data.status)}  ${chalk.dim(data.timestamp)}`);
                }
                else {
                    console.log(`  Health   ${chalk.red(`✗ HTTP ${res.status}`)}`);
                }
            }
            catch (err) {
                console.log(`  Health   ${chalk.yellow('⚠ unreachable')}  ${chalk.dim('(worker may not be deployed yet)')}`);
            }
            // Cache stats
            try {
                const statsRes = await fetch(`${project.workerUrl}/api/prerender/stats`, {
                    headers: { Authorization: `Bearer ${project.workerSecret}` },
                    signal: AbortSignal.timeout(8000),
                });
                if (statsRes.ok) {
                    const stats = await statsRes.json();
                    console.log(`\n  Cache    ${chalk.bold(stats.total)} pages cached  |  ${chalk.yellow(stats.expired)} expired  |  ${chalk.cyan(stats.totalHits)} total hits`);
                }
            }
            catch {
                // Ignore cache stat errors
            }
            // Cron run history
            try {
                const cronRes = await fetch(`${project.workerUrl}/api/cron/runs?limit=3`, {
                    headers: { Authorization: `Bearer ${project.workerSecret}` },
                    signal: AbortSignal.timeout(8000),
                });
                if (cronRes.ok) {
                    const data = await cronRes.json();
                    if (data.runs.length > 0) {
                        console.log('\n  Last cron runs:');
                        for (const run of data.runs) {
                            const statusIcon = run.status === 'completed' ? chalk.green('✓') : run.status === 'running' ? chalk.yellow('⟳') : chalk.red('✗');
                            console.log(`    ${statusIcon} ${run.started_at.split('T')[0]}  ${run.status.padEnd(10)}  ${run.pages_synced} pages synced${run.error_message ? '  ' + chalk.red(run.error_message.slice(0, 40)) : ''}`);
                        }
                    }
                }
            }
            catch {
                // Ignore
            }
        }
        console.log('\n' + chalk.dim(`  Worker URL : ${project.workerUrl ?? '(not set)'}`));
        console.log(chalk.dim(`  Site URL   : ${project.siteUrl}`));
        console.log();
    }
    catch (err) {
        spinner.fail('Status check failed');
        throw err;
    }
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
//# sourceMappingURL=status.js.map