/**
 * `cf-prerender logs` — Stream live logs from the backend worker using
 * Cloudflare Workers Tail API (WebSocket-based log tailing).
 */
import chalk from 'chalk';
import ora from 'ora';
import { getApiToken, getProject } from '../lib/config.js';
import { createTailSession, deleteTailSession, listAccounts, } from '../lib/cf-api.js';
export async function logsCommand(opts) {
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
    const workerName = opts.worker ?? project.workerName;
    const accounts = await listAccounts(token);
    const accountId = accounts[0]?.id;
    if (!accountId) {
        console.log(chalk.red('  No Cloudflare account found.'));
        process.exit(1);
    }
    const spinner = ora(`Creating tail session for "${workerName}"...`).start();
    let tailId;
    try {
        const session = await createTailSession(token, accountId, workerName);
        tailId = session.id;
        spinner.succeed(`Tailing "${workerName}"  ${chalk.dim('(press Ctrl+C to stop)')}\n`);
        // Connect via WebSocket
        const ws = new WebSocket(session.url, 'trace-v1');
        // Send auth header (Cloudflare requires it in the first message for some clients)
        ws.addEventListener('open', () => {
            ws.send(JSON.stringify({ debug: false }));
        });
        ws.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                printTailEvent(data);
            }
            catch {
                console.log(chalk.dim(String(event.data)));
            }
        });
        ws.addEventListener('error', (event) => {
            console.error(chalk.red('\n  WebSocket error'), event);
        });
        ws.addEventListener('close', (event) => {
            console.log(chalk.dim(`\n  Connection closed (code: ${event.code})`));
        });
        // Handle Ctrl+C
        process.on('SIGINT', async () => {
            console.log(chalk.dim('\n  Stopping tail...'));
            ws.close();
            if (tailId) {
                try {
                    await deleteTailSession(token, accountId, workerName, tailId);
                }
                catch {
                    // ignore cleanup errors
                }
            }
            process.exit(0);
        });
        // Keep process alive
        await new Promise(() => { });
    }
    catch (err) {
        spinner.fail('Failed to create tail session');
        if (tailId) {
            await deleteTailSession(token, accountId, workerName, tailId).catch(() => { });
        }
        throw err;
    }
}
function printTailEvent(event) {
    const ts = event.eventTimestamp
        ? new Date(event.eventTimestamp).toISOString().replace('T', ' ').slice(0, 23)
        : new Date().toISOString().replace('T', ' ').slice(0, 23);
    const outcomeColor = event.outcome === 'ok'
        ? chalk.green
        : event.outcome === 'exception'
            ? chalk.red
            : chalk.yellow;
    // Request info
    if (event.event?.request) {
        const { method, url } = event.event.request;
        const path = new URL(url).pathname;
        console.log(`${chalk.dim(ts)}  ${outcomeColor(event.outcome.padEnd(10))}  ${chalk.cyan(method.padEnd(6))} ${path}`);
    }
    else if (event.event?.cron) {
        console.log(`${chalk.dim(ts)}  ${outcomeColor(event.outcome.padEnd(10))}  ${chalk.magenta('cron')}  ${event.event.cron}`);
    }
    // Console logs
    if (event.logs) {
        for (const log of event.logs) {
            const levelColor = log.level === 'error'
                ? chalk.red
                : log.level === 'warn'
                    ? chalk.yellow
                    : chalk.dim;
            const msg = log.message.join(' ');
            console.log(`  ${levelColor(log.level.padEnd(5))}  ${msg}`);
        }
    }
    // Exceptions
    if (event.exceptions) {
        for (const ex of event.exceptions) {
            console.log(chalk.red(`  ✗ ${ex.name}: ${ex.message}`));
        }
    }
}
//# sourceMappingURL=logs.js.map