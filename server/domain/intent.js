// server/domain/intent.js
// MVP-1 & Design Decision: Intent taxonomy and weighted rule-based suggester.
// Supports both English and colloquial Hinglish travel ops phrases.
// Returns confidence score, top intent, and human-auditable matched words.

const INTENT_TAXONOMY = [
  'Refund',
  'Cancellation',
  'Amendment',
  'Payment issue',
  'Voucher/Documents',
  'Inventory/Availability',
  'Supplier confirmation',
  'Special request',
  'Commission/Credit',
  'Other'
];

// Weighted dictionary of keywords and phrases
const INTENT_RULES = {
  Refund: [
    { pattern: /\b(refund|refunds|reimbursement|chargeback)\b/i, weight: 3 },
    { pattern: /\b(paise wapas|paise wapis|refund kab|refund status)\b/i, weight: 4 },
    { pattern: /\b(fare refund|partial refund|refund delay|refund initiated)\b/i, weight: 4 },
    { pattern: /\b(money return|return amount)\b/i, weight: 3 }
  ],
  Cancellation: [
    { pattern: /\b(cancel|cancellation|cancelled|cancelling)\b/i, weight: 3 },
    { pattern: /\b(booking radd|cancel kardo|hotel cancel|flight cancel)\b/i, weight: 4 },
    { pattern: /\b(cancellation charges|free cancellation|penalty cutoff)\b/i, weight: 4 },
    { pattern: /\b(drop reservation|abort booking)\b/i, weight: 3 }
  ],
  Amendment: [
    { pattern: /\b(amend|amendment|modify|modification|change dates?)\b/i, weight: 3 },
    { pattern: /\b(tareekh badal|date change|reschedule|prepone|postpone)\b/i, weight: 4 },
    { pattern: /\b(name correction|passenger change|spelling mistake)\b/i, weight: 4 },
    { pattern: /\b(room type change|extend stay)\b/i, weight: 3 }
  ],
  'Payment issue': [
    { pattern: /\b(payment|transaction|double debit|deducted)\b/i, weight: 3 },
    { pattern: /\b(paise kat gaye|amount debited|gateway error)\b/i, weight: 4 },
    { pattern: /\b(payment failed|card declined|otp error|billing issue)\b/i, weight: 4 },
    { pattern: /\b(receipt missing|invoice mismatch)\b/i, weight: 3 }
  ],
  'Voucher/Documents': [
    { pattern: /\b(voucher|vouchers|itinerary|e-ticket|eticket)\b/i, weight: 3 },
    { pattern: /\b(voucher generate nahi|voucher download|ticket copy)\b/i, weight: 4 },
    { pattern: /\b(confirmation pdf|hotel voucher|booking confirmation document)\b/i, weight: 4 },
    { pattern: /\b(boarding pass|travel documents)\b/i, weight: 3 }
  ],
  'Inventory/Availability': [
    { pattern: /\b(inventory|availability|sold out|overbooked)\b/i, weight: 3 },
    { pattern: /\b(room not available|hotel full|rates mismatch)\b/i, weight: 4 },
    { pattern: /\b(inventory sync|allotment issue|rate disparity)\b/i, weight: 4 },
    { pattern: /\b(no inventory|instant confirmation failed)\b/i, weight: 3 }
  ],
  'Supplier confirmation': [
    { pattern: /\b(supplier confirmation|hotel confirmation|reconfirmation)\b/i, weight: 3 },
    { pattern: /\b(hotel says no booking|booking not found|supplier ref)\b/i, weight: 4 },
    { pattern: /\b(hotel denied check-in|supplier silent|local ref)\b/i, weight: 4 },
    { pattern: /\b(front desk no record|supplier partner)\b/i, weight: 3 }
  ],
  'Special request': [
    { pattern: /\b(special request|extra bed|early check-in|late check-out)\b/i, weight: 3 },
    { pattern: /\b(honeymoon|anniversary|high floor|smoking room|non-smoking)\b/i, weight: 4 },
    { pattern: /\b(jain food|halal meal|wheelchair|cot for baby)\b/i, weight: 4 },
    { pattern: /\b(airport transfer|connecting rooms)\b/i, weight: 3 }
  ],
  'Commission/Credit': [
    { pattern: /\b(commission|credit limit|top-up|wallet)\b/i, weight: 3 },
    { pattern: /\b(credit note|tds certificate|b2b markup|agency balance)\b/i, weight: 4 },
    { pattern: /\b(commission mismatch|recharge balance)\b/i, weight: 3 }
  ]
};

function suggestIntent(title = '', description = '') {
  const combinedText = `${title} ${description}`.trim();
  if (!combinedText) {
    return {
      top_intent: 'Other',
      confidence: 0,
      matched_words: [],
      is_low_confidence: true,
      scores: {}
    };
  }

  const scores = {};
  const matchedWordsByIntent = {};

  for (const [intent, rules] of Object.entries(INTENT_RULES)) {
    scores[intent] = 0;
    matchedWordsByIntent[intent] = [];

    for (const rule of rules) {
      const match = combinedText.match(rule.pattern);
      if (match) {
        scores[intent] += rule.weight;
        matchedWordsByIntent[intent].push(match[0].toLowerCase());
      }
    }
  }

  // Find intent with highest score
  let bestIntent = 'Other';
  let highestScore = 0;

  for (const [intent, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestIntent = intent;
    }
  }

  // Calculate normalized confidence (max expected score ~10)
  const confidence = highestScore > 0 ? Math.min(1.0, Number((highestScore / 8).toFixed(2))) : 0;
  const is_low_confidence = confidence < 0.4;

  return {
    top_intent: bestIntent,
    confidence,
    matched_words: matchedWordsByIntent[bestIntent] || [],
    is_low_confidence,
    scores
  };
}

module.exports = {
  INTENT_TAXONOMY,
  suggestIntent
};
