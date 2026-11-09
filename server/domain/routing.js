// server/domain/routing.js
// MVP-2 & Design Decision: Multi-factor routing engine.
// Evaluates 6 criteria: Region, Shift Window, Skills, Priority/Ranking, Workload, and Availability.
// Generates auditable score breakdown and selects the top qualifying agent.

const { getISTTimeComponents } = require('./now');

function isInsideShift(agent, istComponents) {
  if (!agent.shift_start || !agent.shift_end) return false;

  const [startH, startM] = agent.shift_start.split(':').map(Number);
  const [endH, endM] = agent.shift_end.split(':').map(Number);

  const startTotal = startH * 60 + (startM || 0);
  const endTotal = endH * 60 + (endM || 0);
  const currentTotal = istComponents.totalMinutes;

  if (startTotal <= endTotal) {
    // Normal single-day shift, e.g. 09:00 to 18:00
    return currentTotal >= startTotal && currentTotal < endTotal;
  } else {
    // Overnight shift, e.g. 21:00 to 06:00
    return currentTotal >= startTotal || currentTotal < endTotal;
  }
}

function scoreAgent(agent, ticket, istComponents, openCount = 0) {
  // Criterion 1: Availability is a strict prerequisite
  if (!agent.is_available) {
    return { eligible: false, totalScore: -999, reasons: ['Agent is marked offline/unavailable'] };
  }

  let score = 0;
  const breakdown = [];

  // Criterion 2: Region match (+40)
  const regionMatch = agent.region && ticket.region && agent.region.toLowerCase() === ticket.region.toLowerCase();
  if (regionMatch) {
    score += 40;
    breakdown.push({ factor: 'Region match', points: 40, detail: `${agent.region} match` });
  } else {
    breakdown.push({ factor: 'Region match', points: 0, detail: `Agent ${agent.region} != Ticket ${ticket.region}` });
  }

  // Criterion 3: Inside shift window (+20)
  const onShift = isInsideShift(agent, istComponents);
  if (onShift) {
    score += 20;
    breakdown.push({ factor: 'Shift window', points: 20, detail: `On shift (${agent.shift_start}-${agent.shift_end} IST)` });
  } else {
    breakdown.push({ factor: 'Shift window', points: 0, detail: `Off shift (${agent.shift_start}-${agent.shift_end} IST)` });
  }

  // Criterion 4: Skill match (+15)
  const skills = (agent.skills || '').split(',').map(s => s.trim().toLowerCase());
  const ticketIntent = (ticket.category_intent || '').toLowerCase();
  const hasSkill = skills.includes(ticketIntent);
  if (hasSkill) {
    score += 15;
    breakdown.push({ factor: 'Skill match', points: 15, detail: `Specialist in ${ticket.category_intent}` });
  } else {
    breakdown.push({ factor: 'Skill match', points: 0, detail: `No specialized tag for ${ticket.category_intent}` });
  }

  // Criterion 5: Priority / Rank formula
  const rank = Math.min(3, Math.max(1, agent.rank || 1));
  const isHighUrgent = ticket.priority === 'Urgent' || ticket.priority === 'High';

  if (isHighUrgent) {
    const rankPoints = 8 * rank;
    score += rankPoints;
    breakdown.push({ factor: 'Experience ranking', points: rankPoints, detail: `Urgent ticket with Rank ${rank} agent (+8 x ${rank})` });
  } else {
    const rankPoints = 4 * (4 - rank);
    score += rankPoints;
    breakdown.push({ factor: 'Experience ranking', points: rankPoints, detail: `Routine ticket handled by Rank ${rank} agent (+4 x ${4 - rank})` });
  }

  // Criterion 6: Workload deduction (-5 per open ticket)
  const loadPenalty = 5 * openCount;
  score -= loadPenalty;
  breakdown.push({ factor: 'Active workload', points: -loadPenalty, detail: `${openCount} open tickets assigned (-5 each)` });

  return {
    eligible: true,
    totalScore: score,
    breakdown,
    summary: `Score ${score} (Region: ${regionMatch ? '+40' : '0'}, Shift: ${onShift ? '+20' : '0'}, Skill: ${hasSkill ? '+15' : '0'}, Load: -${loadPenalty})`
  };
}

function routeTicket(db, ticket) {
  const istComponents = getISTTimeComponents();

  // Fetch all agents in the system
  const agents = db.prepare(`
    SELECT id, name, email, role, region, shift_start, shift_end, skills, rank, is_available
    FROM users
    WHERE role = 'agent'
  `).all();

  // Count open tickets per agent
  const openCountsRows = db.prepare(`
    SELECT assigned_agent_id, COUNT(*) as count
    FROM tickets
    WHERE status IN ('New', 'Open', 'Pending', 'Escalated') AND assigned_agent_id IS NOT NULL
    GROUP BY assigned_agent_id
  `).all();

  const openCounts = new Map(openCountsRows.map(r => [r.assigned_agent_id, r.count]));

  const candidateScores = [];

  for (const agent of agents) {
    const openCount = openCounts.get(agent.id) || 0;
    const result = scoreAgent(agent, ticket, istComponents, openCount);
    if (result.eligible) {
      candidateScores.push({
        agent,
        openCount,
        ...result
      });
    }
  }

  // Sort candidates by total score descending; tiebreaker is lowest open count
  candidateScores.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return a.openCount - b.openCount;
  });

  const top3 = candidateScores.slice(0, 3).map(c => ({
    agentId: c.agent.id,
    name: c.agent.name,
    region: c.agent.region,
    rank: c.agent.rank,
    score: c.totalScore,
    summary: c.summary
  }));

  if (candidateScores.length === 0 || candidateScores[0].totalScore <= 0) {
    return {
      assignedAgentId: null,
      assignedAgentName: null,
      routingReason: 'No qualified agents available on shift; ticket sent to Triage queue for manual review.',
      scoreBreakdown: { topCandidates: top3, winnerBreakdown: null }
    };
  }

  const winner = candidateScores[0];
  const routingReason = `Assigned to ${winner.agent.name} (Score ${winner.totalScore}: ${winner.summary})`;

  return {
    assignedAgentId: winner.agent.id,
    assignedAgentName: winner.agent.name,
    routingReason,
    scoreBreakdown: {
      winner: {
        agentId: winner.agent.id,
        name: winner.agent.name,
        totalScore: winner.totalScore,
        breakdown: winner.breakdown
      },
      topCandidates: top3
    }
  };
}

module.exports = {
  isInsideShift,
  scoreAgent,
  routeTicket
};
