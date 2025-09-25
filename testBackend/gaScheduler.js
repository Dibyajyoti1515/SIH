// // gaScheduler.js
// export const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
// export const slotsPerDay = 7;
// const totalSlots = days.length * slotsPerDay;

// function randInt(max) { return Math.floor(Math.random() * max); }
// function shuffle(a) { for (let i = a.length-1;i>0;i--){ const j=randInt(i+1); [a[i],a[j]]=[a[j],a[i]] } return a; }

// function geneFits(session, gene) {
//   const slot = gene % slotsPerDay;
//   return (slot + session.hours) <= slotsPerDay;
// }

// function makeEmptyTimetable() {
//   const tt = {};
//   days.forEach(d => tt[d] = Array(slotsPerDay).fill(null).map(() => ({})));
//   return tt;
// }

// function decodeAndEvaluate(chromosome, sessions, teachersMap, debug = false) {
//   const tt = makeEmptyTimetable();
//   const teacherHoursUsed = Object.fromEntries(Object.keys(teachersMap).map(id => [id,0]));
//   let penalty = 0;

//   for (let i = 0; i < sessions.length; i++) {
//     const session = sessions[i];
//     const gene = chromosome[i];

//     if (debug) {
//       console.log(`\n[Decode] Session ${i}:`, session);
//       console.log(`[Decode] Gene: ${gene}`);
//     }

//     if (typeof gene !== 'number' || gene < 0 || gene >= totalSlots || !geneFits(session, gene)) {
//       penalty += 100;
//       if (debug) console.log("Invalid placement (penalty +100)");
//       continue;
//     }

//     const dayIdx = Math.floor(gene / slotsPerDay);
//     const slot = gene % slotsPerDay;
//     const day = days[dayIdx];

//     const involved = session.type === 'lab' ? (session.teachers || []) : ([session.teacher].filter(Boolean));
//     if (involved.length === 0) {
//       penalty += 50;
//       if (debug) console.log("No teacher assigned (penalty +50)");
//       continue;
//     }

//     let conflict = false;
//     for (let h = 0; h < session.hours; h++) {
//       const sidx = slot + h;
//       if (tt[day][sidx][session.batchName]) {
//         penalty += 20; conflict = true;
//         if (debug) console.log(` ❌ Batch conflict at ${day} slot ${sidx} (penalty +20)`);
//       }
//       for (const t of involved) {
//         for (const batch in tt[day][sidx]) {
//           const rec = tt[day][sidx][batch];
//           if (rec && rec.teacherIds && rec.teacherIds.includes(t)) {
//             penalty += 30; conflict = true;
//             if (debug) console.log(` ❌ Teacher conflict at ${day} slot ${sidx} (penalty +30)`);
//           }
//         }
//       }
//     }

//     for (let h = 0; h < session.hours; h++) {
//       const sidx = slot + h;
//       tt[day][sidx][session.batchName] = {
//         subject: session.subjectName || session.subject,
//         type: session.type,
//         teacherNames: involved.map(id => teachersMap[id]?.name || id),
//         teacherIds: involved.slice()
//       };
//     }

//     involved.forEach(t => {
//       if (teacherHoursUsed[t] !== undefined) teacherHoursUsed[t] += session.hours;
//     });
//   }

//   for (const tid in teacherHoursUsed) {
//     const used = teacherHoursUsed[tid];
//     const max = teachersMap[tid]?.maxHours ?? 0;
//     if (used > max) {
//       penalty += (used - max) * 10;
//       if (debug) console.log(` ❌ Teacher ${tid} over max hours (penalty +${(used-max)*10})`);
//     }
//   }

//   const fitness = -penalty;
//   return { fitness, tt, penalty };
// }

// function initPopulation(popSize, sessions) {
//   const pop = [];
//   for (let p = 0; p < popSize; p++) {
//     const chrom = new Array(sessions.length);
//     for (let i = 0; i < sessions.length; i++) {
//       const session = sessions[i];
//       let gene;
//       let attempts = 0;
//       do {
//         const dayIdx = randInt(days.length);
//         const slot = randInt(slotsPerDay);
//         gene = dayIdx * slotsPerDay + slot;
//         attempts++;
//         if (attempts > 50) break;
//       } while (!geneFits(session, gene));
//       chrom[i] = gene;
//     }
//     pop.push(chrom);
//   }
//   return pop;
// }

// function tournamentSelect(pop, popScores, k=3) {
//   let best = null, bestScore = -Infinity;
//   for (let i=0;i<k;i++){
//     const r = randInt(pop.length);
//     if (popScores[r] > bestScore) { best = pop[r]; bestScore = popScores[r]; }
//   }
//   return best.slice();
// }

// function onePointCrossover(a,b) {
//   const n = a.length;
//   const cp = randInt(n);
//   const child1 = a.slice(0,cp).concat(b.slice(cp));
//   const child2 = b.slice(0,cp).concat(a.slice(cp));
//   return [child1, child2];
// }

// function mutate(chrom, sessions, mutationRate=0.05) {
//   for (let i=0;i<chrom.length;i++){
//     if (Math.random() < mutationRate) {
//       let gene; let attempts=0;
//       do {
//         gene = randInt(totalSlots);
//         attempts++;
//         if (attempts>60) break;
//       } while (!geneFits(sessions[i], gene));
//       chrom[i] = gene;
//     }
//   }
// }

// export async function generateTimetableGA(sessions, teachers, opts={}) {
//   console.log("\n===== START GA TIMETABLE GENERATION =====");
//   console.log("Sessions:", JSON.stringify(sessions, null, 2));
//   console.log("Teachers:", JSON.stringify(teachers, null, 2));

//   const popSize = opts.popSize || 50;
//   const generations = opts.generations || 50;
//   const mutationRate = opts.mutationRate ?? 0.08;
//   const elitism = opts.elitism ?? 2;

//   const teachersMap = Object.fromEntries(teachers.map(t => [t.id, {name: t.name, maxHours: t.maxHours}]));

//   if (!sessions || sessions.length === 0) {
//     console.log("⚠️ No sessions provided.");
//     return makeEmptyTimetable();
//   }

//   let population = initPopulation(popSize, sessions);

//   const evaluateAll = (pop) => pop.map(chrom => decodeAndEvaluate(chrom, sessions, teachersMap).fitness);

//   let scores = evaluateAll(population);
//   let bestIdx = scores.indexOf(Math.max(...scores));
//   let bestChrom = population[bestIdx];
//   let bestEval = decodeAndEvaluate(bestChrom, sessions, teachersMap, true);

//   console.log("\n[Init] Best initial fitness:", bestEval.fitness);

//   for (let gen=0; gen<generations; gen++) {
//     const newPop = [];
//     const sortedIdx = scores.map((s,i) => [s,i]).sort((a,b)=>b[0]-a[0]).map(x=>x[1]);
//     for (let e=0; e<elitism; e++) newPop.push(population[sortedIdx[e]].slice());

//     while (newPop.length < popSize) {
//       const parent1 = tournamentSelect(population, scores, 3);
//       const parent2 = tournamentSelect(population, scores, 3);
//       const [c1, c2] = onePointCrossover(parent1, parent2);
//       mutate(c1, sessions, mutationRate);
//       mutate(c2, sessions, mutationRate);
//       newPop.push(c1);
//       if (newPop.length < popSize) newPop.push(c2);
//     }

//     population = newPop;
//     scores = evaluateAll(population);

//     const genBestIdx = scores.indexOf(Math.max(...scores));
//     if (scores[genBestIdx] > bestEval.fitness) {
//       bestChrom = population[genBestIdx].slice();
//       bestEval = decodeAndEvaluate(bestChrom, sessions, teachersMap, true);
//       console.log(`[Gen ${gen}] New best fitness:`, bestEval.fitness);
//     }
//     if (bestEval.fitness >= 0) {
//       console.log(`[Gen ${gen}] Early stop: perfect timetable found!`);
//       break;
//     }
//   }

//   console.log("\n===== FINAL BEST TIMETABLE =====");
//   console.dir(bestEval.tt, { depth: null });
//   return bestEval.tt;
// }


































// gaScheduler.js
export const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const slotsPerDay = 7;
const totalSlots = days.length * slotsPerDay;

function randInt(max) { return Math.floor(Math.random() * max); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- Preprocessing ----------

// Expand classes into 1-hour sessions, keep labs intact
// Keep spreadAcrossDays flag if present on original session
export function normalizeSessionsForGA(rawSessions) {
  const sessions = [];
  rawSessions.forEach(s => {
    const hours = s.hours || 1;
    if (s.type === 'lab') {
      sessions.push({
        ...s,
        hours,
        originalId: s.id,
        isLab: true,
        spreadAcrossDays: !!s.spreadAcrossDays
      });
    } else {
      for (let k = 0; k < hours; k++) {
        sessions.push({
          ...s,
          id: `${s.id}__part${k}`,
          originalId: s.id,
          hours: 1,
          isLab: false,
          spreadAcrossDays: !!s.spreadAcrossDays
        });
      }
    }
  });
  return sessions;
}

// Optionally add fillers so timetable has no blanks
export function addFillersToReachAllSlots(sessions) {
  const totalNeeded = totalSlots;
  if (sessions.length >= totalNeeded) return sessions;
  const fillers = [];
  for (let i = 0; i < totalNeeded - sessions.length; i++) {
    fillers.push({
      id: `__FREE__${i}`,
      batchId: 'FREE',
      batchName: 'FREE',
      subjectId: 'FREE',
      subjectName: 'FREE',
      type: 'free',
      teacher: null,
      teachers: [],
      hours: 1,
      originalId: '__FREE__',
      isLab: false,
      spreadAcrossDays: false
    });
  }
  return sessions.concat(fillers);
}

// ---------- Helpers ----------

function geneFits(session, gene) {
  const slot = gene % slotsPerDay;
  return (slot + session.hours) <= slotsPerDay;
}

function makeEmptyTimetable() {
  const tt = {};
  days.forEach(d => tt[d] = Array(slotsPerDay).fill(null).map(() => ({})));
  return tt;
}

// ---------- Evaluation ----------

function decodeAndEvaluate(chromosome, sessions, teachersMap, debug = false) {
  const tt = makeEmptyTimetable();
  const teacherHoursUsed = Object.fromEntries(Object.keys(teachersMap).map(id => [id, 0]));
  let penalty = 0;

  // track if a batch already has a lab on a given day: key = `${batchName}-${dayIdx}`
  const batchHasLabOnDay = {};

  // track days used by each originalId (for spreadAcrossDays constraint)
  const originalIdDaysUsed = {}; // originalId -> Set of dayIdx

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const gene = chromosome[i];

    if (typeof gene !== 'number' || gene < 0 || gene >= totalSlots || !geneFits(session, gene)) {
      penalty += 200;
      if (debug) console.log(" ❌ Invalid placement (penalty +200):", session.id, gene);
      continue;
    }

    const dayIdx = Math.floor(gene / slotsPerDay);
    const slot = gene % slotsPerDay;
    const day = days[dayIdx];

    // lab/day constraint: max one lab per batch per day
    if (session.isLab) {
      const key = `${session.batchName}-${dayIdx}`;
      if (batchHasLabOnDay[key]) {
        penalty += 150;
        if (debug) console.log(` ❌ Batch ${session.batchName} already has lab on ${day} (penalty +150)`);
      } else {
        batchHasLabOnDay[key] = true;
      }
    }

    // spreadAcrossDays constraint: parts of same originalId should not be on same day
    if (session.spreadAcrossDays) {
      originalIdDaysUsed[session.originalId] = originalIdDaysUsed[session.originalId] || new Set();
      if (originalIdDaysUsed[session.originalId].has(dayIdx)) {
        // heavy penalty for same-day placement of split parts
        penalty += 120;
        if (debug) console.log(` ❌ SpreadAcrossDays violation for ${session.originalId} on ${day} (penalty +120)`);
      } else {
        originalIdDaysUsed[session.originalId].add(dayIdx);
      }
    }

    // determine involved teachers (labs: session.teachers array; classes: [session.teacher] if present)
    const involved = session.isLab ? (session.teachers || []) : ([session.teacher].filter(Boolean));
    const involvedForCheck = involved.slice();

    // If it's a class and there is no teacher assigned, penalize but still place (user requested classes may have teacher)
    if (!session.isLab && involvedForCheck.length === 0) {
      penalty += 40; // smaller penalty than earlier to avoid skipping many classes
      if (debug) console.log(` ⚠️ Class ${session.id} has no teacher (penalty +40)`);
    }

    // conflicts: batch conflict and teacher conflict
    for (let h = 0; h < session.hours; h++) {
      const sidx = slot + h;
      // batch conflict
      if (tt[day][sidx][session.batchName]) {
        penalty += 50;
        if (debug) console.log(` ❌ Batch conflict at ${day} slot ${sidx} (penalty +50)`);
      }
      // teacher conflict: for each teacher involved, check if they are already assigned in same timeslot
      for (const t of involvedForCheck) {
        for (const batch in tt[day][sidx]) {
          const rec = tt[day][sidx][batch];
          if (rec && rec.teacherIds && rec.teacherIds.includes(t)) {
            penalty += 70;
            if (debug) console.log(` ❌ Teacher conflict at ${day} slot ${sidx} (penalty +70)`);
          }
        }
      }
    }

    // place session into timetable
    for (let h = 0; h < session.hours; h++) {
      const sidx = slot + h;
      tt[day][sidx][session.batchName] = {
        subject: session.subjectName || session.subject,
        type: session.isLab ? 'lab' : session.type || 'class',
        teacherNames: involvedForCheck.map(id => teachersMap[id]?.name || null).filter(Boolean),
        teacherIds: involvedForCheck.slice()
      };
    }

    // accumulate teacher hours
    involvedForCheck.forEach(t => {
      if (teacherHoursUsed[t] !== undefined) teacherHoursUsed[t] += session.hours;
    });
  }

  // teacher max hours penalty
  for (const tid in teacherHoursUsed) {
    const used = teacherHoursUsed[tid];
    const max = teachersMap[tid]?.maxHours ?? Infinity;
    if (used > max) {
      penalty += (used - max) * 20;
      if (debug) console.log(` ❌ Teacher ${tid} over max hours (penalty +${(used - max) * 20})`);
    }
  }

  return { fitness: -penalty, tt, penalty };
}

// ---------- GA Core ----------

function initPopulation(popSize, sessions) {
  const pop = [];

  // To help satisfy spreadAcrossDays, we attempt a smarter initial placement:
  // place sessions grouped by originalId across different days if spreadAcrossDays is true.
  for (let p = 0; p < popSize; p++) {
    const chrom = new Array(sessions.length);
    // map originalId -> next day index to try (for spreadAcrossDays)
    const originalNextDay = {};

    // order sessions: labs first (to secure blocks), then others
    const order = sessions.map((s, i) => ({ i, isLab: s.isLab })).sort((a, b) => {
      if (a.isLab && !b.isLab) return -1;
      if (!a.isLab && b.isLab) return 1;
      return 0;
    }).map(x => x.i);

    for (const idx of order) {
      const session = sessions[idx];
      let gene = -1;
      let attempts = 0;

      // If spreadAcrossDays true, try different days in round-robin
      const tryPlace = () => {
        const dayIdx = randInt(days.length);
        const slot = randInt(slotsPerDay);
        return dayIdx * slotsPerDay + slot;
      };

      if (session.spreadAcrossDays) {
        originalNextDay[session.originalId] = originalNextDay[session.originalId] || randInt(days.length);
      }

      do {
        if (session.spreadAcrossDays) {
          // compute a day bias: try the next day for this originalId
          const dayIdx = originalNextDay[session.originalId] % days.length;
          const slot = randInt(slotsPerDay);
          gene = dayIdx * slotsPerDay + slot;
          originalNextDay[session.originalId] = (originalNextDay[session.originalId] + 1) % days.length;
        } else {
          gene = tryPlace();
        }
        attempts++;
        if (attempts > 200) { gene = randInt(totalSlots); break; }
      } while (!geneFits(session, gene));
      chrom[idx] = gene;
    }

    pop.push(chrom);
  }
  return pop;
}

function tournamentSelect(pop, popScores, k = 3) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < k; i++) {
    const r = randInt(pop.length);
    if (popScores[r] > bestScore) { best = pop[r]; bestScore = popScores[r]; }
  }
  return best.slice();
}

function onePointCrossover(a, b) {
  const n = a.length;
  const cp = randInt(n);
  return [
    a.slice(0, cp).concat(b.slice(cp)),
    b.slice(0, cp).concat(a.slice(cp))
  ];
}

function mutate(chrom, sessions, mutationRate = 0.05) {
  for (let i = 0; i < chrom.length; i++) {
    if (Math.random() < mutationRate) {
      let gene, attempts = 0;
      do {
        gene = randInt(totalSlots);
        attempts++;
        if (attempts > 120) break;
      } while (!geneFits(sessions[i], gene));
      chrom[i] = gene;
    }
  }
}

// ---------- Main ----------

export async function generateTimetableGA(sessions, teachers, opts = {}) {
  console.log("\n===== START GA TIMETABLE GENERATION =====");
  console.log("Sessions:", JSON.stringify(sessions, null, 2));
  console.log("Teachers:", JSON.stringify(teachers, null, 2));

  const popSize = opts.popSize || 50;
  const generations = opts.generations || 50;
  const mutationRate = opts.mutationRate ?? 0.08;
  const elitism = opts.elitism ?? 2;

  const teachersMap = Object.fromEntries(teachers.map(t => [t.id, { name: t.name, maxHours: t.maxHours }]));

  if (!sessions || sessions.length === 0) {
    console.log("⚠️ No sessions provided.");
    return makeEmptyTimetable();
  }

  let population = initPopulation(popSize, sessions);
  const evaluateAll = pop => pop.map(chrom => decodeAndEvaluate(chrom, sessions, teachersMap).fitness);

  let scores = evaluateAll(population);
  let bestIdx = scores.indexOf(Math.max(...scores));
  let bestChrom = population[bestIdx];
  let bestEval = decodeAndEvaluate(bestChrom, sessions, teachersMap, true);

  console.log("\n[Init] Best initial fitness:", bestEval.fitness);

  for (let gen = 0; gen < generations; gen++) {
    const newPop = [];
    const sortedIdx = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(x => x[1]);
    for (let e = 0; e < elitism; e++) newPop.push(population[sortedIdx[e]].slice());

    while (newPop.length < popSize) {
      const parent1 = tournamentSelect(population, scores, 3);
      const parent2 = tournamentSelect(population, scores, 3);
      const [c1, c2] = onePointCrossover(parent1, parent2);
      mutate(c1, sessions, mutationRate);
      mutate(c2, sessions, mutationRate);
      newPop.push(c1);
      if (newPop.length < popSize) newPop.push(c2);
    }

    population = newPop;
    scores = evaluateAll(population);

    const genBestIdx = scores.indexOf(Math.max(...scores));
    if (scores[genBestIdx] > bestEval.fitness) {
      bestChrom = population[genBestIdx].slice();
      bestEval = decodeAndEvaluate(bestChrom, sessions, teachersMap, true);
      console.log(`[Gen ${gen}] New best fitness:`, bestEval.fitness);
    }
    if (bestEval.fitness >= 0) {
      console.log(`[Gen ${gen}] Early stop: perfect timetable found!`);
      break;
    }
  }

  console.log("\n===== FINAL BEST TIMETABLE =====");
  console.dir(bestEval.tt, { depth: null });
  return bestEval.tt;
}
