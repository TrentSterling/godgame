// Finite, observation-driven food/stone mission. The host owns every physical
// body and all movement; this model owns only jobs, unique loads and counters.
export const SETTLEMENT_WORKSITE_RADIUS = 2.3;

// Read-only investment accounting. Delivered pantry rows are history: their
// stone is represented by pantry.spareStone until withdrawal creates a new
// physical load. Claims, carried loads and hand-held loads are each counted once.
// Temporary physical unavailability does not destroy stone; only lost rows do.
export function assessGardenInvestmentBudget({ siteId, sites = [], loads = [], pantry = {}, quarry = {}, mission = {},
  prioritySiteId = null, villagers = [], protectedSiteIds = [], mandatorySiteIds = [] } = {}) {
  const garden = sites.find((site) => site.id === siteId);
  if (!garden) return null;
  const remaining = (site) => Math.max(0, site.required - site.delivered);
  const looseStone = loads.filter((load) => load.kind === 'stone' && !['delivered', 'lost'].includes(load.status))
    .reduce((sum, load) => sum + load.quantity, 0);
  const storedStone = pantry.spareStone ?? 0, quarryStone = quarry.remaining ?? 0;
  const usableStone = storedStone + quarryStone + looseStone;
  const commitments = sites.filter((site) => site.id !== siteId && remaining(site) > 0).map((site) => {
    const reasons = [];
    if (prioritySiteId === site.id) reasons.push('selected');
    if (protectedSiteIds.includes(site.id)) reasons.push('previous-selection');
    if (mandatorySiteIds.includes(site.id)) reasons.push('required-access');
    if (site.delivered > 0) reasons.push('partially-built');
    if (villagers.some((worker) => worker.targetSiteId === site.id && loads.some((load) => load.id === worker.stoneId
      && load.kind === 'stone' && load.status === 'carried' && load.owner === worker.id))) reasons.push('carried-load');
    return { siteId: site.id, remaining: remaining(site), reasons };
  }).filter((commitment) => commitment.reasons.length);
  const missionStone = mission.spareStoneGoal ?? 2;
  const commitmentStone = commitments.reduce((sum, commitment) => sum + commitment.remaining, 0);
  const investmentStone = remaining(garden), requiredStone = missionStone + commitmentStone + investmentStone;
  const shortfall = Math.max(0, requiredStone - usableStone), complete = investmentStone === 0;
  const reason = complete ? 'complete' : shortfall ? 'stone-budget-shortfall' : 'ready';
  return { allowed: !complete && shortfall === 0, reason, complete, available: usableStone, required: requiredStone,
    usableStone, storedStone, quarryStone, looseStone,
    missionStone, commitmentStone, investmentStone, requiredStone, shortfall, spareAfterInvestment: usableStone - investmentStone,
    commitments, protectedSiteIds: [...protectedSiteIds],
    message: complete ? 'GARDEN IMPROVED' : shortfall ? `KEEP STONE FOR STORES${commitments.length ? ' + CURRENT BUILD' : ''}` : 'IMPROVE GARDEN' };
}

// Defense uses the same finite material ledger and real project commitments.
// Always retain at least the two Stores stones, even in a smaller test mission.
export function assessDefenseInvestmentBudget(input = {}) {
  const budget = assessGardenInvestmentBudget({ ...input,
    mission: { ...input.mission, spareStoneGoal: Math.max(2, input.mission?.spareStoneGoal ?? 2) } });
  return budget && { ...budget, message: budget.complete ? 'STONE BARRIER COMPLETE' : budget.shortfall
    ? `KEEP STONE FOR STORES${budget.commitments.length ? ' + CURRENT BUILD' : ''}` : 'BUILD STONE BARRIER' };
}

export function createSettlementEconomy(config) {
  const vec = (p, label = 'position') => {
    const out = { x: p?.x, y: p?.y ?? 0, z: p?.z };
    if (!Object.values(out).every(Number.isFinite)) throw new TypeError(`${label} must be a finite vector`);
    return out;
  };
  const positive = (v, fallback, label) => {
    const n = v ?? fallback;
    if (!Number.isFinite(n) || n <= 0) throw new TypeError(`${label} must be positive`);
    return n;
  };
  const count = (v, fallback, label) => {
    const n = v ?? fallback;
    if (!Number.isSafeInteger(n) || n < 0) throw new TypeError(`${label} must be a nonnegative integer`);
    return n;
  };
  const ids = new Set();
  const id = (value) => {
    if (typeof value !== 'string' || !value || value === 'player' || ids.has(value)) throw new TypeError('IDs must be unique nonempty strings other than player');
    ids.add(value); return value;
  };
  if (!Array.isArray(config.villagers) || !config.villagers.length) throw new TypeError('villagers must be nonempty');
  const recruitId = config.recruitId ?? config.villagers.find((v) => v.available === false)?.id ?? null;
  const initialWorkers = config.villagers.map((v, i) => {
    const role = v.role ?? config.initialRoles?.[v.id] ?? (i < 2 ? 'food' : 'stone');
    if (!['food', 'stone'].includes(role)) throw new TypeError('role must be food or stone');
    return { id: id(v.id), position: vec(v.position), available: v.available !== false, alive: v.alive !== false, role };
  });
  if (recruitId !== null && !initialWorkers.some((v) => v.id === recruitId)) throw new TypeError('Unknown recruitId');
  const originalIds = config.originalWorkerIds ?? initialWorkers.filter((v) => v.id !== recruitId).map((v) => v.id);
  if (!originalIds.length || originalIds.some((v) => !initialWorkers.some((w) => w.id === v) || v === recruitId)) throw new TypeError('Invalid originalWorkerIds');
  const initialLoads = (config.stones ?? []).map((s) => ({ id: id(s.id), position: vec(s.position), available: s.available !== false, kind: 'stone', quantity: 1 }));
  const pantryId = id(config.pantry?.id ?? 'pantry');
  const pantryPosition = vec(config.pantry?.position, 'pantry.position');
  const initialFood = count(config.initialFood ?? config.pantry?.food, 3, 'initialFood');
  const initialSpareStone = count(config.pantry?.spareStone, 0, 'pantry.spareStone');
  const sites = (config.sites ?? []).map((s) => {
    const required = count(s.required, 1, 'site.required');
    if (!required) throw new TypeError('site.required must be positive');
    return { id: id(s.id), position: vec(s.position), required };
  });
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const quarryConfig = { id: id(config.quarry?.id ?? 'quarry'), ...(config.quarry?.regionId ? {regionId: config.quarry.regionId} : {}), position: vec(config.quarry?.position, 'quarry.position'),
    reserve: count(config.quarry?.reserve, 12, 'quarry.reserve'), workSeconds: positive(config.quarry?.workSeconds, 6, 'quarry.workSeconds') };
  const sourceConfigs = (config.forageSources ?? []).map((s, i) => ({ id: id(s.id), position: vec(s.position), ...(s.regionId ? {regionId:s.regionId} : {}),
    island: s.island === true || s.requiresBridge === true,
    reserve: count(s.reserve, 90, 'source.reserve'),
    bundleSize: count(s.bundleSize ?? s.quantity, s.island || s.requiresBridge ? 6 : 3, 'source.bundleSize'),
    workSeconds: positive(s.workSeconds ?? s.gatherSeconds, s.island || s.requiresBridge ? 4 : 7, 'source.workSeconds'),
    order: i }));
  if (sourceConfigs.some((s) => !s.bundleSize)) throw new TypeError('bundleSize must be positive');
  const gardenUpgrade = config.gardenUpgrade ? { siteId: config.gardenUpgrade.siteId, sourceId: config.gardenUpgrade.sourceId,
    bundleSize: count(config.gardenUpgrade.bundleSize, 6, 'gardenUpgrade.bundleSize') } : null;
  if (gardenUpgrade && (!sitesById.has(gardenUpgrade.siteId)
    || !sourceConfigs.some((source) => source.id === gardenUpgrade.sourceId && !source.island)
    || !gardenUpgrade.bundleSize)) throw new TypeError('gardenUpgrade requires a construction site, mainland source and positive bundleSize');
  const defenseUpgrade = config.defenseUpgrade ? { siteId: config.defenseUpgrade.siteId ?? 'defense' } : null;
  if (defenseUpgrade && (sitesById.get(defenseUpgrade.siteId)?.required !== 2 || defenseUpgrade.siteId === gardenUpgrade?.siteId))
    throw new TypeError('defenseUpgrade requires a distinct construction site costing exactly two stones');
  const initialPriority = config.initialPrioritySiteId ?? (config.requirePriority ? null : pantryId);
  if (initialPriority !== null && initialPriority !== pantryId && !sitesById.has(initialPriority)) throw new TypeError('Unknown initialPrioritySiteId');
  // Optional physical-load capacity. A fed mission leaves one body slot for
  // food recovery; existing active loads still occupy it wherever they are.
  const maxActiveLoads = config.maxActiveLoads === undefined ? Infinity : count(config.maxActiveLoads, 12, 'maxActiveLoads');
  if (maxActiveLoads === 0) throw new TypeError('maxActiveLoads must be positive');
  const pickupSeconds = positive(config.workSeconds, .8, 'workSeconds');
  const deliverySeconds = positive(config.deliverySeconds, .55, 'deliverySeconds');
  const mealSeconds = positive(config.mealSeconds, 24, 'mealSeconds');
  const foodPerWorker = count(config.foodPerWorker, 1, 'foodPerWorker');
  const stoneRadius = positive(config.stoneRadius, 1.02, 'stoneRadius');
  const sourceRadius = positive(config.sourceRadius, 1.3, 'sourceRadius');
  const sourceWorkRadius = positive(config.sourceWorkRadius, .55, 'sourceWorkRadius');
  const siteRadius = positive(config.siteRadius, 2.15, 'siteRadius');
  const spareStoneGoal = count(config.spareStoneGoal, 2, 'spareStoneGoal');
  const stockpileConfig = { id: pantryId, position: { ...pantryPosition }, workSeconds: positive(config.pantry?.withdrawSeconds, 1, 'pantry.withdrawSeconds') };
  const withWorkPoints = (source, authored) => {
    const radius = Math.min(1.1, sourceRadius * .85);
    const points = authored ?? [
      { x: source.position.x - radius, y: source.position.y, z: source.position.z },
      { x: source.position.x, y: source.position.y, z: source.position.z - radius },
      { x: source.position.x + radius, y: source.position.y, z: source.position.z },
      { x: source.position.x, y: source.position.y, z: source.position.z + radius },
    ];
    if (!Array.isArray(points) || !points.length) throw new TypeError('source.workPoints must be nonempty');
    source.workPoints = points.map((point) => vec(point, 'source.workPoint'));
    if (source.workPoints.some((p) => (p.x - source.position.x) ** 2 + (p.y - source.position.y) ** 2 + (p.z - source.position.z) ** 2 > sourceRadius ** 2)) throw new TypeError('source.workPoints must be inside sourceRadius');
  };
  withWorkPoints(quarryConfig, config.quarry?.workPoints);
  withWorkPoints(stockpileConfig, config.pantry?.workPoints);
  sourceConfigs.forEach((source, i) => withWorkPoints(source, config.forageSources[i].workPoints));
  let workers, loads, workerById, loadById, sources, sourceById, quarry;
  let generation = 0, nextRevision = 0, tick, sequence, time, prioritySiteId, priorityRevision;
  let food, spareStone, foodProduced, stoneProduced, foodDelivered, islandFoodDelivered, stoneStocked, stoneWithdrawn, foodConsumed;
  let mealElapsed, mealCount, shortMeals, unmetFood, lastMealAt, latestMeal, replenishedAfterMeal;
  let recruitJoined, recruitWorked, recruitLost, bridgeObserved, outcome;
  let gardenProtectedSiteIds;
  const touch = (v) => { v.revision = ++nextRevision; };
  const near = (a, b, r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 <= r ** 2;
  const distance = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  const emit = (events, type, detail = {}) => events.push({ type, ...detail });
  const deliveredCount = (siteId) => loads.filter((l) => l.kind === 'stone' && l.status === 'delivered' && (siteId === undefined ? l.siteId !== pantryId : l.siteId === siteId)).length;
  const siteComplete = (s) => deliveredCount(s.id) >= s.required;
  const gardenComplete = () => !!gardenUpgrade && siteComplete(sitesById.get(gardenUpgrade.siteId));
  const bundleSizeFor = (source) => gardenComplete() && source.id === gardenUpgrade.sourceId ? gardenUpgrade.bundleSize : source.bundleSize;
  // Budget only resources connected to Stores. Remote material cannot fund a
  // promised build until an actual completed connection makes it recoverable.
  const connected = (from, to) => !config.canTravel || config.canTravel(from, to) === true;
  const budgetInput = (siteId, selectedPriority = prioritySiteId, protectedSiteIds = gardenProtectedSiteIds) => ({siteId,
    sites: sites.map((site) => ({ ...site, delivered: deliveredCount(site.id) })),
    loads: loads.filter((load) => connected(pantryPosition, load.position)), pantry: { spareStone },
    quarry: {...quarry, remaining: connected(pantryPosition, quarry.position) ? quarry.remaining : 0},
    mission: { spareStoneGoal }, prioritySiteId: selectedPriority, villagers: workers,
    protectedSiteIds, mandatorySiteIds: config.mandatorySiteIds ?? []});
  const gardenBudget = () => gardenUpgrade ? assessGardenInvestmentBudget(budgetInput(gardenUpgrade.siteId)) : null;
  const defenseComplete = () => !!defenseUpgrade && siteComplete(sitesById.get(defenseUpgrade.siteId));
  const defenseBudget = (selectedPriority = prioritySiteId, protectedSiteIds = gardenProtectedSiteIds) => defenseUpgrade
    ? assessDefenseInvestmentBudget(budgetInput(defenseUpgrade.siteId, selectedPriority, protectedSiteIds)) : null;
  const accessBudget = (siteId, selectedPriority = prioritySiteId, protectedSiteIds = gardenProtectedSiteIds) => (config.mandatorySiteIds?.length && sitesById.has(siteId)
    && !config.mandatorySiteIds.includes(siteId)) ? assessGardenInvestmentBudget(budgetInput(siteId, selectedPriority, protectedSiteIds)) : null;
  const selectedSite = () => prioritySiteId === null ? null : sitesById.has(prioritySiteId) && !siteComplete(sitesById.get(prioritySiteId)) ? sitesById.get(prioritySiteId) : { id: pantryId, position: pantryPosition };
  const bridgeOpen = () => bridgeObserved || (sitesById.has(config.bridgeSiteId ?? 'bridge') && siteComplete(sitesById.get(config.bridgeSiteId ?? 'bridge')));
  // A bridge permits automatic travel; physically placing a recovered worker
  // at the garden also permits local work, preserving the god-hand route.
  const sourceAccessible = (s, w) => config.canTravel ? connected(w.position, s.position)
    : !s.island || bridgeOpen() || near(w.position, s.position, sourceRadius);
  // A deliberate placement can start from anywhere inside its visible ring.
  // Automatic workers keep the narrower existing local-work access rule.
  const orderedSourceAccessible = (s, w) => sourceAccessible(s, w)
    || (!config.canTravel && w.preferredSourceId === s.id && distance(w.position, s.position) <= SETTLEMENT_WORKSITE_RADIUS ** 2);
  const livingWorkers = () => workers.filter((w) => w.alive && (w.id !== recruitId || recruitJoined));
  const feedingRequired = foodPerWorker > 0;
  // A full earlier meal cannot cover a later shortage or a newly joined worker.
  // Fewer survivors may still be covered, but equal counts never replace IDs.
  const fullMealReady = () => !feedingRequired || (!!latestMeal?.full
    && livingWorkers().every((w) => latestMeal.participantIds.includes(w.id)));
  const ready = (w) => w.alive && w.available && (w.id !== recruitId || recruitJoined);
  const freshWorker = (w) => w.observedTick === tick && ready(w);
  const reservations = (siteId, finishing = false) => workers.filter((w) => w.targetSiteId === siteId && (w.stoneId || w.sourceId) && (!finishing || w.phase === 'delivering')).length;
  const destination = (w) => w.targetSiteId === pantryId ? { id: pantryId, position: pantryPosition } : sitesById.get(w.targetSiteId);
  const stockpileSource = () => ({ ...stockpileConfig, remaining: spareStone });
  const sourceFor = (w) => w.sourceId === pantryId ? stockpileSource() : w.sourceId === quarry.id ? quarry : sourceById.get(w.sourceId);
  const orderedSourceFor = (w) => w.preferredSourceId === quarry.id ? quarry : sourceById.get(w.preferredSourceId);
  const phase = (w, name) => { w.phase = name; w.elapsed = 0; touch(w); };
  const clearJob = (w) => {
    w.stoneId = null; w.targetSiteId = null; w.sourceId = null; w.sourceSlot = null; w.workKind = null;
    if (gardenUpgrade) w.harvestBundleSize = null;
    if (w.pendingRole) { w.role = w.pendingRole; w.preferredSourceId = w.pendingSourceId; w.pendingRole = null; w.pendingSourceId = null; }
    phase(w, 'idle');
  };
  function orderedSource(w, events) {
    if (w.preferredSourceId === null) return null;
    const source = orderedSourceFor(w);
    const reason = !source || source.remaining <= 0 ? 'source-depleted' : !orderedSourceAccessible(source, w) ? 'source-inaccessible' : null;
    if (!reason) return source;
    // Only exhausted or inaccessible orders fall back to the existing automatic
    // selector. A healthy chosen source keeps its order even when all slots fill.
    const sourceId = w.preferredSourceId; w.preferredSourceId = null; touch(w);
    emit(events, 'work-order-fallback', { villagerId: w.id, role: w.role, sourceId, reason });
    return null;
  }
  function cancelJob(w, events, reason, dropPosition) {
    const load = loadById.get(w.stoneId), oldId = w.stoneId;
    if (load?.owner === w.id) {
      const carried = load.status === 'carried';
      if (carried) load.position = dropPosition ?? (load.observedTick === tick ? load.position : { ...w.position });
      load.status = 'available'; load.owner = null; load.releasedByPlayer = false; touch(load);
      // Never invent physical release evidence; wait for the host to drop it.
      emit(events, carried ? 'stone-dropped' : 'stone-unclaimed', { stoneId: load.id, loadId: load.id, kind: load.kind, villagerId: w.id, position: { ...load.position }, reason });
    }
    clearJob(w);
    emit(events, 'job-interrupted', { villagerId: w.id, stoneId: oldId, reason });
  }
  function stoneTarget(excludeWorker = null) {
    const site = selectedSite();
    if (!site) return null;
    if (accessBudget(site.id)?.allowed === false) return { id: pantryId, position: pantryPosition };
    if (site.id === gardenUpgrade?.siteId && !gardenBudget().allowed) return { id: pantryId, position: pantryPosition };
    if (site.id === defenseUpgrade?.siteId && !defenseBudget().allowed) return { id: pantryId, position: pantryPosition };
    if (site.id === pantryId) return site;
    const heldSlots = workers.filter((w) => w !== excludeWorker && w.targetSiteId === site.id && (w.stoneId || w.sourceId)).length;
    return deliveredCount(site.id) + heldSlots < site.required ? site : null;
  }
  function reconcileTargets(events) {
    for (const w of workers) {
      if ((!w.stoneId && !w.sourceId) || w.role !== 'stone') continue;
      // A hand delivery may finish the old destination while a worker carries
      // its final load. Preserve that physical load and send it to storage.
      if (loadById.get(w.stoneId)?.status === 'carried') {
        const oldSite = sitesById.get(w.targetSiteId);
        const defenseBlocked = defenseUpgrade && oldSite?.id === defenseUpgrade.siteId && !defenseBudget().allowed;
        const accessBlocked = !!oldSite && !siteComplete(oldSite) && accessBudget(oldSite.id)?.allowed === false;
        const investmentBlocked = accessBlocked || defenseBlocked || (gardenUpgrade && oldSite?.id === gardenUpgrade.siteId && !gardenBudget().allowed);
        if (oldSite && (siteComplete(oldSite) || investmentBlocked)) {
          const previousSiteId = w.targetSiteId; w.targetSiteId = pantryId; phase(w, 'to-site');
          emit(events, 'job-retargeted', { villagerId: w.id, stoneId: w.stoneId, previousSiteId, siteId: pantryId,
            ...(investmentBlocked ? { reason: accessBlocked ? 'access-stone-budget' : defenseBlocked ? 'defense-stone-budget' : 'garden-stone-budget',
              budget: accessBlocked ? accessBudget(oldSite.id) : defenseBlocked ? defenseBudget() : gardenBudget() } : {}) });
        }
        continue;
      }
      const target = stoneTarget(w);
      if (!target) { cancelJob(w, events, 'waiting-for-priority'); continue; }
      if (target.id === pantryId && w.sourceId === pantryId) { cancelJob(w, events, 'withdrawal-no-longer-needed'); continue; }
      if (w.targetSiteId !== target.id) {
        const previousSiteId = w.targetSiteId; w.targetSiteId = target.id; touch(w);
        emit(events, 'job-retargeted', { villagerId: w.id, stoneId: w.stoneId, previousSiteId, siteId: target.id });
      }
    }
  }
  const atDestination = (w, l) => {
    const dest = destination(w);
    return dest && freshWorker(w) && l?.observedTick === tick && l.available && !l.held && l.observedOwner === w.id
      && near(w.position, dest.position, siteRadius) && near(l.position, dest.position, siteRadius);
  };
  function assessOutcome(events, allowVictory = true) {
    if (outcome.status !== 'playing') return;
    const allOriginalsDead = originalIds.every((key) => !workerById.get(key).alive);
    if (recruitLost || (recruitId && !workerById.get(recruitId).alive) || allOriginalsDead) {
      outcome = { status: 'failed', reason: allOriginalsDead ? 'all-original-workers-lost' : 'recruit-lost', at: time };
      emit(events, 'mission-failed', { ...outcome });
    } else if (allowVictory && recruitJoined && recruitWorked && livingWorkers().every(freshWorker) && fullMealReady() && food >= livingWorkers().length * foodPerWorker && spareStone >= spareStoneGoal
      && (!config.requireIslandHarvest || islandFoodDelivered > 0) && (!config.canComplete || config.canComplete())) {
      outcome = { status: 'won', reason: 'settlement-sustained', at: time };
      emit(events, 'mission-complete', { ...outcome });
    }
  }
  function finishLoad(l, w, events, by, dest) {
    l.status = 'delivered'; l.siteId = dest.id; l.owner = null; l.available = false; l.held = false;
    l.observedOwner = null; l.releasedByPlayer = false; l.observedTick = -1; touch(l);
    if (l.kind === 'food') {
      food += l.quantity; foodDelivered += l.quantity;
      if (sourceById.get(l.sourceId)?.island) islandFoodDelivered += l.quantity;
      if (foodConsumed > 0 && lastMealAt !== null && time >= lastMealAt) replenishedAfterMeal = true;
    } else if (dest.id === pantryId) { spareStone += l.quantity; stoneStocked += l.quantity; }
    if (w) { w.jobsCompleted += 1; if (w.id === recruitId && recruitJoined) recruitWorked = true; clearJob(w); }
    const counts = { stoneId: l.id, loadId: l.id, kind: l.kind, quantity: l.quantity, villagerId: w?.id ?? null, source: by, siteId: dest.id,
      delivered: dest.id === pantryId ? (l.kind === 'food' ? food : spareStone) : deliveredCount(dest.id),
      required: dest.required ?? (l.kind === 'food' ? livingWorkers().length * foodPerWorker : spareStoneGoal),
      totalDelivered: deliveredCount(), totalRequired: sites.reduce((sum, s) => sum + s.required, 0) };
    emit(events, l.kind === 'food' ? 'food-delivered' : 'stone-delivered', counts);
    if (dest.id !== pantryId && siteComplete(dest)) emit(events, 'site-complete', counts);
    assessOutcome(events);
  }
  function productionCapacityReason(source) {
    if (!Number.isFinite(maxActiveLoads)) return null;
    const live = loads.filter(l => !['delivered', 'lost'].includes(l.status));
    const stone = source.id === quarry.id || source.id === pantryId;
    if (feedingRequired && stone && live.filter(l => l.kind === 'stone').length >= maxActiveLoads - 1)
      return 'stone-capacity';
    return live.length >= maxActiveLoads ? 'load-capacity' : null;
  }
  // Read-only presentation evidence. Capacity never changes worker readiness,
  // movement, ownership, elapsed work, source reserves, or food-gated building.
  function productionBlockedFor(w, source) {
    if (!Number.isFinite(maxActiveLoads) || outcome.status !== 'playing' || !freshWorker(w) || blockedForFood(w)
      || w.phase !== 'working' || w.stoneId || !['mine', 'withdraw', 'gather'].includes(w.workKind)
      || !source || source.remaining <= 0 || !orderedSourceAccessible(source, w)
      || w.elapsed + 1e-9 < source.workSeconds
      || !near(w.position, source.position, sourceRadius)
      || !near(w.position, source.workPoints[w.sourceSlot], sourceWorkRadius)) return null;
    return productionCapacityReason(source);
  }
  function makeLoad(w, source, events) {
    const withdrawal = source.id === pantryId;
    const kind = source.id === quarry.id || withdrawal ? 'stone' : 'food';
    const quantity = kind === 'stone' ? 1 : Math.min(w.harvestBundleSize ?? source.bundleSize, source.remaining);
    // IDs include generation and cannot collide with authored entities.
    let loadId; do { loadId = `${kind}-g${generation}-${++sequence}`; } while (ids.has(loadId) || loadById.has(loadId));
    const l = { id: loadId, kind, quantity, position: { ...w.position }, available: true, status: 'carried', siteId: null,
      owner: w.id, observedOwner: null, held: false, releasedByPlayer: false, observedTick: -1, sourceId: source.id };
    if (withdrawal) { spareStone -= 1; stoneWithdrawn += 1; }
    else { source.remaining -= quantity; if (kind === 'food') foodProduced += quantity; else stoneProduced += 1; }
    touch(l); loads.push(l); loadById.set(l.id, l); w.stoneId = l.id; w.sourceId = null; w.sourceSlot = null; w.workKind = null;
    if (gardenUpgrade) w.harvestBundleSize = null;
    phase(w, 'to-site');
    emit(events, 'resource-produced', { stoneId: l.id, loadId: l.id, kind, quantity, position: { ...l.position }, villagerId: w.id, sourceId: source.id,
      reason: withdrawal ? 'stockpile-withdrawal' : kind === 'stone' ? 'mined' : 'harvested' });
    emit(events, 'stone-picked-up', { stoneId: l.id, loadId: l.id, kind, quantity, villagerId: w.id, siteId: w.targetSiteId, produced: true });
  }
  // A trip already carrying stone can finish, allowing a queued food role to
  // resolve when the pantry empties. No new stone work starts while hungry.
  const blockedForFood = (w) => feedingRequired && food === 0 && w.role === 'stone' && loadById.get(w.stoneId)?.status !== 'carried';
  function snapshot(events = []) {
    const population = livingWorkers().length;
    const constructionDelivered = deliveredCount(), required = sites.reduce((sum, s) => sum + s.required, 0);
    const lostStones = loads.filter((l) => l.kind === 'stone' && l.status === 'lost').length;
    const resourcesRemaining = loads.filter((l) => l.kind === 'stone' && !['delivered', 'lost'].includes(l.status)).length + quarry.remaining;
    const activeSiteId = selectedSite()?.id ?? null;
    const publicLoads = loads.map(({ observedTick, ...l }) => ({ ...l, position: { ...l.position } }));
    const siteRows = sites.map((s) => ({ ...s, position: { ...s.position }, delivered: deliveredCount(s.id), remaining: Math.max(0, s.required - deliveredCount(s.id)),
      complete: siteComplete(s), ...(config.mandatorySiteIds?.length ? {accessBudget: accessBudget(s.id), ...(s.id === defenseUpgrade?.siteId ? {selectionAccessBudget: accessBudget(s.id, s.id, [])} : {})} : {}), reserved: reservations(s.id), finishing: reservations(s.id, true), priority: prioritySiteId === s.id, active: activeSiteId === s.id }));
    return { generation, time, prioritySiteId, priorityRevision, activeSiteId, waitingForPriority: prioritySiteId === null,
      villagers: workers.map(({ observedTick, ...w }) => {
        const load = loadById.get(w.stoneId), source = sourceFor(w);
        const blocked = !ready(w) ? 'unavailable' : outcome.status !== 'playing' ? 'mission-ended' : blockedForFood(w) ? 'empty-pantry' : null;
        const target = blocked ? null : w.phase === 'to-stone' ? load?.position : w.phase === 'to-source' ? source?.workPoints[w.sourceSlot] : w.phase === 'to-site' ? destination(w)?.position : null;
        const duration = w.phase === 'delivering' ? deliverySeconds : source?.workSeconds ?? pickupSeconds;
        return { ...w, position: { ...w.position }, target: target ? { ...target } : null, intent: target ? 'move' : 'stop', blocked,
          resourceKind: load?.kind ?? w.role, workProgress: ['working', 'delivering'].includes(w.phase) ? Math.min(1, w.elapsed / duration) : 0,
          ...(Number.isFinite(maxActiveLoads) ? {productionBlocked: productionBlockedFor(workerById.get(w.id), source)} : {}) };
      }),
      stones: publicLoads, loads: publicLoads.map((l) => ({ ...l, position: { ...l.position } })), sites: siteRows,
      site: siteRows[0] ? { ...siteRows[0], position: { ...siteRows[0].position } } : null,
      construction: { required, delivered: constructionDelivered, remaining: required - constructionDelivered, lost: lostStones, resourcesRemaining,
        shortfall: Math.max(0, required - constructionDelivered - resourcesRemaining), feasible: resourcesRemaining >= required - constructionDelivered, complete: sites.every(siteComplete) },
      totals: { total: loads.length, available: loads.filter((l) => l.status === 'available').length, claimed: loads.filter((l) => l.status === 'claimed').length,
        carried: loads.filter((l) => l.status === 'carried').length, playerHeld: loads.filter((l) => l.status === 'player-held').length,
        delivered: loads.filter((l) => l.status === 'delivered').length, lost: loads.filter((l) => l.status === 'lost').length },
      pantry: { id: pantryId, position: { ...pantryPosition }, workPoints: stockpileConfig.workPoints.map((point) => ({ ...point })),
        food, spareStone, foodDelivered, islandFoodDelivered, stoneDelivered: stoneStocked, stoneWithdrawn, foodConsumed, empty: food === 0 },
      quarry: { ...quarry, ...(config.canTravel ? {accessible: connected(pantryPosition, quarry.position), accessibleWorkerIds: workers.filter(w=>sourceAccessible(quarry,w)).map(w=>w.id)} : {}), position: { ...quarry.position }, workPoints: quarry.workPoints.map((p) => ({ ...p })), produced: stoneProduced, lost: lostStones },
      forageSources: sources.map((s) => ({ ...s, bundleSize: bundleSizeFor(s), position: { ...s.position }, workPoints: s.workPoints.map((p) => ({ ...p })), accessible: config.canTravel ? connected(pantryPosition, s.position) : !s.island || bridgeOpen(),
        ...(config.canTravel ? {accessibleWorkerIds: workers.filter(w=>sourceAccessible(s,w)).map(w=>w.id)} : {}) })),
      ...(gardenUpgrade ? { gardenUpgrade: { ...gardenUpgrade, complete: gardenComplete(),
        baseBundleSize: sourceById.get(gardenUpgrade.sourceId).bundleSize,
        delivered: deliveredCount(gardenUpgrade.siteId), required: sitesById.get(gardenUpgrade.siteId).required,
        protectedSiteIds: [...gardenProtectedSiteIds], budget: gardenBudget() } } : {}),
      ...(defenseUpgrade ? { defenseUpgrade: { ...defenseUpgrade, complete: defenseComplete(),
        delivered: deliveredCount(defenseUpgrade.siteId), required: sitesById.get(defenseUpgrade.siteId).required,
        budget: defenseBudget(), selectionBudget: defenseBudget(defenseUpgrade.siteId, []) } } : {}),
      production: { food: foodProduced, stone: stoneProduced },
      meal: { interval: mealSeconds, elapsed: mealElapsed, nextIn: Math.max(0, mealSeconds - mealElapsed), population, cost: population * foodPerWorker,
        count: mealCount, shortMeals, unmetFood, consumed: foodConsumed, lastMealAt,
        latest: latestMeal ? { ...latestMeal, participantIds: [...latestMeal.participantIds] } : null, replenishedAfterMeal },
      recruit: { id: recruitId, joined: recruitJoined, worked: recruitWorked, lost: recruitLost },
      mission: { ...outcome, recruitJoined, recruitWorked, mealConsumed: foodConsumed > 0, replenishedAfterMeal, feedingRequired, fullMealReady: fullMealReady(),
        foodReady: food >= population * foodPerWorker, stoneReady: spareStone >= spareStoneGoal, foodGoal: population * foodPerWorker, spareStoneGoal,
        requireIslandHarvest: !!config.requireIslandHarvest, islandHarvestReady: islandFoodDelivered > 0, workersSafe: livingWorkers().every(freshWorker) },
      outcome: { ...outcome }, bridgeAvailable: bridgeOpen(),
      events: events.map((e) => ({ ...e, ...(e.position ? { position: { ...e.position } } : {}) })) };
  }
  function reset() {
    generation += 1; tick = 0; sequence = 0; time = 0; prioritySiteId = initialPriority; priorityRevision = ++nextRevision;
    food = initialFood; spareStone = initialSpareStone; foodProduced = 0; stoneProduced = 0; foodDelivered = 0; islandFoodDelivered = 0; stoneStocked = 0; stoneWithdrawn = 0; foodConsumed = 0;
    mealElapsed = 0; mealCount = 0; shortMeals = 0; unmetFood = 0; lastMealAt = null; latestMeal = null; replenishedAfterMeal = false;
    recruitJoined = false; recruitWorked = false; recruitLost = false; bridgeObserved = false; outcome = { status: 'playing', reason: null, at: null };
    gardenProtectedSiteIds = [];
    workers = initialWorkers.map((v) => ({ ...v, position: { ...v.position }, available: v.id === recruitId ? false : v.available,
      phase: 'idle', stoneId: null, targetSiteId: null, sourceId: null, sourceSlot: null, workKind: null, pendingRole: null,
      preferredSourceId: null, pendingSourceId: null, ...(gardenUpgrade ? { harvestBundleSize: null } : {}),
      elapsed: 0, jobsCompleted: 0, observedTick: -1, revision: ++nextRevision }));
    loads = initialLoads.map((l) => ({ ...l, position: { ...l.position }, status: 'available', siteId: null, owner: null,
      observedOwner: null, held: false, releasedByPlayer: false, observedTick: -1, revision: ++nextRevision }));
    workerById = new Map(workers.map((v) => [v.id, v])); loadById = new Map(loads.map((l) => [l.id, l]));
    sources = sourceConfigs.map((s) => ({ ...s, position: { ...s.position }, remaining: s.reserve })); sourceById = new Map(sources.map((s) => [s.id, s]));
    quarry = { ...quarryConfig, position: { ...quarryConfig.position }, remaining: quarryConfig.reserve };
    return snapshot();
  }
  function update(dt, observations = {}) {
    if (!Number.isFinite(dt) || dt < 0) throw new TypeError('dt must be finite nonnegative seconds');
    let productionBudget = observations.productionAllowed === false ? 0 : observations.productionBudget === undefined ? Infinity : count(observations.productionBudget, 0, 'productionBudget');
    // All vectors validate before any mutation, including ticking the clock.
    const incomingWorkers = (observations.villagers ?? []).map((r) => ({ ...r, ...(r.position ? { position: vec(r.position) } : {}) }));
    const incomingLoads = (observations.stones ?? observations.loads ?? []).map((r) => ({ ...r, ...(r.position ? { position: vec(r.position) } : {}) }));
    tick += 1; const events = [];
    if (typeof observations.bridgeAvailable === 'boolean') bridgeObserved = observations.bridgeAvailable;
    if (observations.recruit?.lost === true || ['lost', 'dead'].includes(observations.recruit?.phase)) recruitLost = true;
    for (const row of incomingWorkers) {
      const w = workerById.get(row.id); if (!w) continue;
      if (row.position) w.position = row.position;
      if (row.alive === false || row.lost === true || (Number.isFinite(row.hp) && row.hp <= 0)) {
        if (w.alive) {
          w.alive = false;
          // A lost worker must not activate a queued order while its load drops.
          if (w.preferredSourceId !== null || w.pendingSourceId !== null) { w.preferredSourceId = null; w.pendingSourceId = null; w.pendingRole = null; }
          touch(w);
        }
      }
      if (typeof row.available === 'boolean' && row.available !== w.available) { w.available = row.available; touch(w); }
      w.observedTick = row.position && typeof row.available === 'boolean' ? tick : -1;
    }
    const r = workerById.get(recruitId);
    if (!recruitJoined && (observations.recruit?.joined === true || observations.recruitJoined === true) && r?.alive && r.available && r.observedTick === tick) {
      recruitJoined = true; touch(r); emit(events, 'villager-recruited', { villagerId: recruitId });
    }
    for (const row of incomingLoads) {
      const l = loadById.get(row.id); if (!l || ['delivered', 'lost'].includes(l.status)) continue;
      if (row.position) l.position = row.position;
      if (typeof row.available === 'boolean') l.available = row.available;
      if (typeof row.held === 'boolean') l.held = row.held;
      if (Object.hasOwn(row, 'owner')) l.observedOwner = row.owner;
      l.observedTick = row.position && typeof row.available === 'boolean' && typeof row.held === 'boolean' && Object.hasOwn(row, 'owner') ? tick : -1;
    }
    for (const w of workers) {
      if (!w.stoneId && !w.sourceId) continue;
      const l = loadById.get(w.stoneId);
      if (!ready(w) || (l && (!l.available || l.held || (l.observedOwner !== null && l.observedOwner !== w.id)))) cancelJob(w, events, !ready(w) ? 'worker-unavailable' : 'stone-unavailable');
    }
    // Observe losses immediately, but positive time must pay every due meal
    // before a newly unlocked gate or recovered worker can complete the mission.
    assessOutcome(events, dt === 0);
    if (dt === 0 || outcome.status !== 'playing') return snapshot(events);
    time += dt; mealElapsed += dt;
    while (mealElapsed + 1e-9 >= mealSeconds) {
      mealElapsed = Math.max(0, mealElapsed - mealSeconds); mealCount += 1;
      const participantIds = livingWorkers().map((w) => w.id), cost = participantIds.length * foodPerWorker, consumed = Math.min(food, cost);
      food -= consumed; foodConsumed += consumed; lastMealAt = time - mealElapsed;
      latestMeal = { count: mealCount, at: lastMealAt, participantIds, population: participantIds.length,
        cost, consumed, shortage: cost - consumed, full: consumed === cost };
      if (consumed < cost) { shortMeals += 1; unmetFood += cost - consumed; }
      emit(events, 'meal-consumed', { ...latestMeal, participantIds: [...participantIds], meal: mealCount, food });
    }
    reconcileTargets(events);
    for (const w of workers) {
      if (!freshWorker(w) || blockedForFood(w) || outcome.status !== 'playing') continue;
      if (w.phase === 'idle') {
        const preferred = orderedSource(w, events);
        const dest = w.role === 'food' ? { id: pantryId, position: pantryPosition } : stoneTarget(w);
        if (!dest) continue;
        const selected = loads.filter((l) => l.kind === w.role && l.status === 'available' && l.available && !l.held && l.observedOwner === null
          && connected(w.position, l.position)
          && (!preferred || l.sourceId === preferred.id || near(l.position, preferred.position, sourceRadius)))
          .sort((a, b) => distance(w.position, a.position) - distance(w.position, b.position))[0];
        w.targetSiteId = dest.id;
        if (selected) {
          selected.status = 'claimed'; selected.owner = w.id; selected.releasedByPlayer = false; touch(selected);
          w.stoneId = selected.id; w.workKind = 'pickup'; phase(w, 'to-stone');
          emit(events, 'stone-claimed', { stoneId: selected.id, loadId: selected.id, kind: selected.kind, villagerId: w.id, siteId: dest.id });
        } else {
          const source = preferred ?? (w.role === 'stone' ? dest.id !== pantryId && spareStone > 0 ? stockpileSource() : quarry.remaining > 0 && sourceAccessible(quarry, w) ? quarry : null : sources.filter((s) => s.remaining > 0 && sourceAccessible(s, w))
            .sort((a, b) => bundleSizeFor(b) / b.workSeconds - bundleSizeFor(a) / a.workSeconds || distance(w.position, a.position) - distance(w.position, b.position) || a.order - b.order)[0]);
          if (!source || !orderedSourceAccessible(source, w)) { w.targetSiteId = null; continue; }
          const slots = source.workPoints.map((p, index) => ({ p, index }))
            .filter(({ index }) => !workers.some((other) => other.sourceId === source.id && other.sourceSlot === index))
            .sort((a, b) => distance(w.position, a.p) - distance(w.position, b.p));
          if (!slots.length) { w.targetSiteId = null; continue; }
          w.sourceId = source.id; w.sourceSlot = slots[0].index; w.workKind = source.id === pantryId ? 'withdraw' : w.role === 'food' ? 'gather' : 'mine'; phase(w, 'to-source');
          if (gardenUpgrade && w.role === 'food') w.harvestBundleSize = bundleSizeFor(source);
          emit(events, 'source-assigned', { villagerId: w.id, sourceId: source.id, kind: w.role, siteId: dest.id });
        }
        continue;
      }
      const l = loadById.get(w.stoneId), source = sourceFor(w);
      if (w.phase === 'to-source' || (w.phase === 'working' && source)) {
        if (!source || source.remaining <= 0 || !orderedSourceAccessible(source, w)) { orderedSource(w, events); cancelJob(w, events, 'source-unavailable'); continue; }
        if (!near(w.position, source.position, sourceRadius) || !near(w.position, source.workPoints[w.sourceSlot], sourceWorkRadius)) { if (w.phase === 'working') phase(w, 'to-source'); continue; }
        if (w.phase === 'to-source') { phase(w, 'working'); continue; }
        w.elapsed = Math.min(source.workSeconds, w.elapsed + dt);
        if (w.elapsed + 1e-9 >= source.workSeconds && productionBudget > 0 && !productionCapacityReason(source)) { makeLoad(w, source, events); productionBudget -= 1; }
      } else if (w.phase === 'to-stone') {
        if (l?.observedTick === tick && near(w.position, l.position, stoneRadius)) phase(w, 'working');
      } else if (w.phase === 'working') {
        if (!l || l.observedTick !== tick || !near(w.position, l.position, stoneRadius)) { phase(w, 'to-stone'); continue; }
        w.elapsed = Math.min(pickupSeconds, w.elapsed + dt);
        if (w.elapsed + 1e-9 >= pickupSeconds) {
          l.status = 'carried'; touch(l); phase(w, 'to-site');
          emit(events, 'stone-picked-up', { stoneId: l.id, loadId: l.id, kind: l.kind, quantity: l.quantity, villagerId: w.id, siteId: w.targetSiteId });
        }
      } else if (w.phase === 'to-site' || w.phase === 'delivering') {
        if (!atDestination(w, l)) { if (w.phase === 'delivering') phase(w, 'to-site'); continue; }
        if (w.phase === 'to-site') { phase(w, 'delivering'); continue; }
        w.elapsed = Math.min(deliverySeconds, w.elapsed + dt);
        if (w.elapsed + 1e-9 >= deliverySeconds) {
          // Recheck at the actual spend, after any earlier worker in this update.
          if (w.targetSiteId === defenseUpgrade?.siteId && !defenseBudget().allowed) {
            const previousSiteId = w.targetSiteId; w.targetSiteId = pantryId; phase(w, 'to-site');
            emit(events, 'job-retargeted', { villagerId: w.id, stoneId: w.stoneId, previousSiteId, siteId: pantryId,
              reason: 'defense-stone-budget', budget: defenseBudget() });
          } else if (accessBudget(w.targetSiteId)?.allowed === false) {
            const previousSiteId=w.targetSiteId;w.targetSiteId=pantryId;phase(w,'to-site');
            emit(events,'job-retargeted',{villagerId:w.id,stoneId:w.stoneId,previousSiteId,siteId:pantryId,reason:'access-stone-budget'});
          } else finishLoad(l, w, events, 'villager', destination(w));
        }
      }
    }
    assessOutcome(events); return snapshot(events);
  }
  function command(input) {
    const events = [], fail = (reason) => ({ ok: false, reason, ...snapshot() });
    if (!input || typeof input !== 'object') return fail('invalid-command');
    if (input.type === 'set-priority') {
      if (input.expectedRevision !== undefined && input.expectedRevision !== priorityRevision) return fail('stale-revision');
      if (input.siteId !== pantryId && !sitesById.has(input.siteId)) return fail('unknown-site');
      // A direct Barrier selection releases an untouched previous selection,
      // while required access, partial builds and real carried loads stay protected.
      const selectedPriority = input.siteId === defenseUpgrade?.siteId ? input.siteId : prioritySiteId;
      const selectedProtected = input.siteId === defenseUpgrade?.siteId ? [] : gardenProtectedSiteIds;
      if (accessBudget(input.siteId, selectedPriority, selectedProtected)?.allowed === false && !siteComplete(sitesById.get(input.siteId))) return fail('access-stone-budget');
      if (input.siteId === gardenUpgrade?.siteId && !gardenComplete() && !gardenBudget().allowed) return fail('garden-stone-budget');
      // Switching priority releases an untouched previous optional selection.
      // Real partial builds and owned carries remain commitments in the ledger.
      if (input.siteId === defenseUpgrade?.siteId && !defenseComplete() && !defenseBudget(input.siteId, []).allowed) return fail('defense-stone-budget');
      if (prioritySiteId !== input.siteId) {
        gardenProtectedSiteIds = input.siteId === gardenUpgrade?.siteId && sitesById.has(prioritySiteId)
          && !siteComplete(sitesById.get(prioritySiteId)) ? [prioritySiteId] : [];
        const previousSiteId = prioritySiteId; prioritySiteId = input.siteId; priorityRevision = ++nextRevision;
        emit(events, 'priority-changed', { previousSiteId, siteId: prioritySiteId }); reconcileTargets(events);
      }
      return { ok: true, ...snapshot(events) };
    }
    if (['set-role', 'interrupt-villager'].includes(input.type)) {
      const w = workerById.get(input.villagerId); if (!w) return fail('unknown-villager');
      if (input.expectedRevision !== w.revision) return fail('stale-revision');
      if (input.type === 'set-role') {
        if (!['food', 'stone'].includes(input.role)) return fail('invalid-role');
        if (!w.alive) return fail('worker-lost');
        const sourceId = input.sourceId ?? null;
        if (sourceId !== null) {
          const sourceRole = sourceId === quarry.id ? 'stone' : sourceById.has(sourceId) ? 'food' : null;
          if (!sourceRole) return fail('unknown-source');
          if (sourceRole !== input.role) return fail('source-role-mismatch');
          if (w.id === recruitId && !recruitJoined) return fail('worker-not-joined');
        }
        const load = loadById.get(w.stoneId), carrying = load?.status === 'carried' && load.owner === w.id;
        if (carrying) {
          // pendingRole also marks a same-role source change or a queued return
          // to automatic work. Keep the owned physical trip intact until clearJob.
          w.pendingRole = input.role !== w.role || sourceId !== null || w.preferredSourceId !== null ? input.role : null;
          w.pendingSourceId = sourceId; touch(w);
        } else if (w.role !== input.role || w.preferredSourceId !== sourceId) {
          if (w.stoneId || w.sourceId) cancelJob(w, events, 'role-changed');
          w.role = input.role; w.preferredSourceId = sourceId; w.pendingRole = null; w.pendingSourceId = null; touch(w);
        }
        emit(events, 'role-changed', { villagerId: w.id, role: input.role, sourceId, deferred: carrying && w.pendingRole !== null });
      } else {
        let dropPosition; try { if (input.position) dropPosition = vec(input.position); } catch { return fail('invalid-position'); }
        if (!w.available && !w.stoneId && !w.sourceId) return fail('already-unavailable');
        w.available = false; if (w.stoneId || w.sourceId) cancelJob(w, events, 'player-interruption', dropPosition); else touch(w);
      }
      return { ok: true, ...snapshot(events) };
    }
    const type = ({ 'take-load': 'take-stone', 'release-load': 'release-stone', 'deliver-load': 'deliver-stone', 'mark-load-lost': 'mark-stone-lost' })[input.type] ?? input.type;
    if (!['take-stone', 'release-stone', 'deliver-stone', 'mark-stone-lost'].includes(type)) return fail('unknown-command');
    const l = loadById.get(input.stoneId ?? input.loadId); if (!l) return fail('unknown-stone');
    if (input.expectedRevision !== l.revision) return fail('stale-revision');
    if (l.status === 'delivered') return fail('already-delivered');
    if (l.status === 'lost') return fail('already-lost');
    if (type === 'mark-stone-lost') {
      const w = workerById.get(l.owner); if (w) { clearJob(w); emit(events, 'job-interrupted', { villagerId: w.id, stoneId: l.id, reason: 'stone-lost' }); }
      Object.assign(l, { status: 'lost', owner: null, observedOwner: null, available: false, held: false, releasedByPlayer: false, observedTick: -1 }); touch(l);
      emit(events, 'stone-lost', { stoneId: l.id, loadId: l.id, kind: l.kind, quantity: l.quantity, villagerId: w?.id ?? null });
    } else if (type === 'take-stone') {
      if (l.status === 'player-held') return fail('already-held');
      if (l.held) return fail('stone-unavailable');
      if (l.observedOwner !== null && l.observedOwner !== l.owner) return fail('ownership-mismatch');
      const w = workerById.get(l.owner); if (w) { clearJob(w); emit(events, 'job-interrupted', { villagerId: w.id, stoneId: l.id, reason: 'player-took-stone' }); }
      Object.assign(l, { status: 'player-held', owner: 'player', observedOwner: 'player', held: true, releasedByPlayer: false, observedTick: -1 }); touch(l);
      emit(events, 'stone-taken', { stoneId: l.id, loadId: l.id, kind: l.kind });
    } else if (type === 'release-stone') {
      if (l.status !== 'player-held' || l.owner !== 'player') return fail('not-player-held');
      if (input.held !== false || typeof input.available !== 'boolean') return fail('release-not-observed');
      let position; try { position = vec(input.position); } catch { return fail('invalid-position'); }
      Object.assign(l, { position, status: 'available', owner: null, observedOwner: null, held: false, available: input.available, releasedByPlayer: true, observedTick: tick }); touch(l);
      emit(events, 'stone-released', { stoneId: l.id, loadId: l.id, kind: l.kind, position: { ...position } });
    } else {
      if (outcome.status !== 'playing') return fail('mission-ended');
      const destinationId = input.siteId ?? (l.kind === 'food' ? pantryId : null);
      const dest = destinationId === pantryId ? { id: pantryId, position: pantryPosition } : sitesById.get(destinationId);
      if (!dest) return fail('unknown-site');
      if (l.kind === 'food' && dest.id !== pantryId) return fail('wrong-resource');
      if (dest.id !== pantryId && siteComplete(dest)) return fail('site-complete');
      if (l.status !== 'available' || l.owner !== null || !l.releasedByPlayer) return fail('not-player-released');
      if (l.observedTick !== tick || !l.available || l.held || l.observedOwner !== null) return fail('release-not-observed');
      if (!near(l.position, dest.position, siteRadius)) return fail('outside-site');
      if (l.kind === 'stone' && feedingRequired && food === 0) return fail('empty-pantry');
      if (dest.id !== pantryId && deliveredCount(dest.id) + reservations(dest.id, true) >= dest.required) return fail('site-reserved');
      if (accessBudget(dest.id)?.allowed === false) return fail('access-stone-budget');
      if (dest.id === gardenUpgrade?.siteId && !gardenBudget().allowed) return fail('garden-stone-budget');
      if (dest.id === defenseUpgrade?.siteId && !defenseBudget().allowed) return fail('defense-stone-budget');
      finishLoad(l, null, events, 'player', dest); reconcileTargets(events);
    }
    return { ok: true, ...snapshot(events) };
  }
  // Frame-loop gates only need this scalar; keep snapshots detached for callers
  // that need the full public economy state.
  reset(); return { update, command, snapshot, reset, outcomeStatus: () => outcome.status };
}
