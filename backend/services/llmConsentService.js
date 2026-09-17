const axios = require('axios');

/**
 * Sends extracted PDF text to an LLM API with a strict JSON schema constraint
 * to extract structured clauses and consent checkbox candidates.
 * @param {string} pdfText - Plain text extracted from PDF
 * @returns {Promise<{clauses: Array, proposedCheckboxes: Array}>}
 */
async function extractConsentStructure(pdfText) {
  // Check if LLM is configured
  if (!process.env.OPENAI_API_KEY && !process.env.LLM_API_KEY) {
    console.warn('⚠️ No LLM API key configured. Returning mock extraction.');
    return mockExtraction(pdfText);
  }

  // System prompt constraining the LLM to extract only clause_list and checkboxes
  const systemPrompt = `You are a legal document parser. Extract the following from the provided policy text:
1. Numbered clauses (sections) from the document as an array of { clauseNumber, title, body }.
2. Proposed consent checkboxes derived from phrases like "I consent to…" or "I agree to…" as an array of { label, category }.

Do NOT generate card summaries or column content — only clauses and checkboxes.
Return valid JSON matching this schema:
{
  "clauses": [{ "clauseNumber": 1, "title": "string", "body": "string" }],
  "proposedCheckboxes": [{ "label": "string", "category": "string" }]
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Extract structured content from this policy:\n\n${pdfText.substring(0, 15000)}` }, // Limit to ~15k chars to avoid token limits
  ];

  try {
    // Example: OpenAI API call (adapt to your LLM provider)
    const response = await axios.post(
      process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
      {
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages,
        response_format: { type: 'json_object' }, // Ensures JSON output
        temperature: 0.3, // Low temperature for deterministic extraction
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY || process.env.LLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const extracted = JSON.parse(response.data.choices[0].message.content);
    
    // Validate against schema (basic check)
    if (!extracted.clauses || !extracted.proposedCheckboxes) {
      throw new Error('LLM response missing required fields');
    }

    return extracted;
  } catch (error) {
    console.error('LLM extraction failed:', error.message);
    console.warn('⚠️ Falling back to mock extraction');
    return mockExtraction(pdfText);
  }
}

/**
 * Fallback mock extraction when LLM is not available
 * Attempts basic parsing of the PDF text
 */
function mockExtraction(pdfText) {
  const clauses = [];
  const proposedCheckboxes = [];

  // Simple heuristic: look for numbered sections (e.g., "1.", "2.", "1.1", etc.)
  const lines = pdfText.split('\n').filter(line => line.trim().length > 0);
  
  let currentClause = null;
  let clauseCount = 0;

  for (const line of lines) {
    // Check if line starts with a number followed by a period (e.g., "1.", "2.1", etc.)
    const match = line.match(/^(\d+(?:\.\d+)?)\.\s+(.+)/);
    if (match) {
      // Save previous clause if exists
      if (currentClause) {
        clauses.push(currentClause);
      }
      // Start new clause
      clauseCount++;
      currentClause = {
        clauseNumber: clauseCount,
        title: match[2].trim().substring(0, 200), // First 200 chars as title
        body: match[2].trim(),
      };
    } else if (currentClause) {
      // Append to current clause body
      currentClause.body += ' ' + line.trim();
    }
  }

  // Add last clause
  if (currentClause) {
    clauses.push(currentClause);
  }

  // Look for consent-related phrases
  const consentPhrases = pdfText.match(/I (consent|agree|acknowledge) to .+?(?:\.|;|\n)/gi);
  if (consentPhrases) {
    consentPhrases.slice(0, 5).forEach((phrase, i) => {
      proposedCheckboxes.push({
        label: phrase.trim(),
        category: 'general',
      });
    });
  }

  // If no checkboxes found, add a default one
  if (proposedCheckboxes.length === 0) {
    proposedCheckboxes.push({
      label: 'I have read and agree to the terms outlined in this policy',
      category: 'general',
    });
  }

  return { clauses, proposedCheckboxes };
}

module.exports = { extractConsentStructure };
