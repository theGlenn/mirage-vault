export const ORG_KEYWORDS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Microsoft",
  "Amazon",
  "Meta",
  "Apple",
  "Stripe",
  "Salesforce",
  "Oracle",
  "Netflix",
  "NVIDIA",
  "JPMorgan",
  "Goldman Sachs",
  "PwC",
  "Deloitte",
  "Accenture",
  "IBM",
  "Tesla",
  "SpaceX"
] as const;

export type OrgKeyword = (typeof ORG_KEYWORDS)[number];
