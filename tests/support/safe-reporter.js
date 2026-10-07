import { mkdir, writeFile } from 'node:fs/promises';

const knownStages = new Set(['request', 'review', 'delivery', 'setup', 'login', 'recovery', 'cleanup', 'preflight']);
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const targetId = new RegExp(`^(?:access_request|auth_user):${uuid}$`, 'i');
const testAddress = new RegExp(`^dbdocgen-test-${uuid}@([a-z0-9.-]+\\.[a-z]{2,})$`, 'i');
const lookupPrefixes = new Set(['access_request_lookup', 'auth_user_lookup', 'profile_lookup']);

export function safeCleanupTargets(result) {
  const targets = new Set();
  for (const error of result.errors ?? []) {
    const diagnostic = /(?:^|; )cleanup: exact fixtures require manual review: ([^;\r\n]+)/.exec(error.message ?? '')?.[1];
    if (!diagnostic) continue;
    for (const raw of diagnostic.split(', ')) {
      if (targetId.test(raw)) { targets.add(raw); continue; }
      const delimiter = raw.indexOf(':');
      if (delimiter < 0 || !lookupPrefixes.has(raw.slice(0, delimiter))) continue;
      const address = raw.slice(delimiter + 1);
      const domain = testAddress.exec(address)?.[1];
      if (!domain || domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) continue;
      targets.add(raw);
    }
  }
  return [...targets].sort();
}

export function safeStage(result) {
  const failedStep = result.steps?.find((step) => step.error && knownStages.has(step.title));
  if (failedStep) return failedStep.title;
  for (const error of result.errors ?? []) {
    const prefix = /^([a-z]+):/.exec(error.message ?? '')?.[1];
    if (knownStages.has(prefix)) return prefix;
  }
  for (const attachment of result.attachments ?? []) {
    const prefix = /^([a-z]+)-diagnostic\.json$/.exec(attachment.name ?? '')?.[1];
    if (knownStages.has(prefix)) return prefix;
  }
  return null;
}

export default class SafeReporter {
  constructor() { this.results = []; }

  onTestEnd(test, result) {
    const stage = safeStage(result);
    const outcome = result.status === 'passed' ? 'passed' : 'failed';
    const cleanupFailure = (result.errors ?? []).some((error) => /(?:^|; )cleanup:/.test(error.message ?? ''));
    const safe = { test: test.title, outcome, stage, cleanupFailure, cleanupTargets: safeCleanupTargets(result), code: result.errors.length ? 'assertion_or_contract_failure' : null };
    this.results.push(safe);
    console.log(`${outcome.toUpperCase()} ${test.title}${outcome === 'failed' ? ` [${stage ?? 'stage unavailable'}]` : ''}`);
  }

  async onEnd() {
    await mkdir('test-results', { recursive: true });
    await writeFile('test-results/safe-summary.json', JSON.stringify(this.results, null, 2));
  }
}
