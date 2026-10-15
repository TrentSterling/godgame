// Read the live economy row instead of remembering the last accepted command.
// A carrying worker keeps its delivery until the queued role takes effect.
const sourceName = (id, role) => ({quarry:'Quarry', 'mainland-forage':'Garden', 'island-garden':'Island Garden', pantry:'Pantry'}[id]
  ?? (role === 'food' ? 'food work' : 'stone work'));
const destinationName = id => ({bridge:'Bridge', brace:'Quarry Brace', pantry:'Pantry', 'garden-upgrade':'Garden upgrade', defense:'Barrier'}[id] ?? 'the build site');

export function settlementWorkerFeedback(worker) {
  if (!worker || worker.alive === false || ['dead', 'lost'].includes(worker.phase)) return '';
  const source = sourceName(worker.sourceId ?? worker.preferredSourceId, worker.role);
  let current;
  if (worker.blocked === 'empty-pantry') current = 'Waiting for food before stone work';
  else if (worker.blocked === 'unavailable') current = 'Waiting to stand before working';
  else if (worker.productionBlocked) current = 'Waiting for room to store another load';
  else if (['to-site', 'delivering'].includes(worker.phase)) current = `Delivering ${worker.resourceKind === 'food' ? 'food' : 'stone'} to ${destinationName(worker.targetSiteId)}`;
  else if (worker.phase === 'to-stone') current = 'Walking to loose stone';
  else if (worker.phase === 'working' && worker.workKind === 'pickup') current = 'Picking up stone';
  else if (worker.phase === 'working' && worker.workKind === 'withdraw') current = 'Collecting stored stone';
  else if (worker.phase === 'working') current = worker.role === 'food' ? `Gathering food at ${source}` : `Mining at ${source}`;
  else if (worker.phase === 'to-source') current = `Walking to ${source}`;
  else current = worker.preferredSourceId ? `Assigned to ${source}` : `Waiting for ${source}`;
  return current + (worker.pendingRole ? ` then ${sourceName(worker.pendingSourceId, worker.pendingRole)}.` : '.');
}

// The XR panel has two existing status rows. Wrap words rather than cutting
// the queued destination off the end of its former single-row notice.
export function workerFeedbackLines(text, limit = 42) {
  const lines = [''];
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + 1 + word.length > limit) lines.push(word);
    else lines[last] += (lines[last] ? ' ' : '') + word;
  }
  return lines;
}
