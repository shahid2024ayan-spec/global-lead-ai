const businessIntents = [
  "businesses with outdated websites", "companies needing a website redesign", "local businesses with no website",
  "businesses with broken or slow websites", "companies needing e-commerce development", "businesses seeking website maintenance",
  "small companies needing digital transformation", "businesses with weak mobile websites", "companies with poor search visibility",
  "businesses needing booking or ordering systems", "companies needing custom web applications", "businesses needing landing pages",
  "companies outsourcing digital services", "businesses looking for technology partners", "companies with incomplete online presence",
  "local companies needing professional service providers", "businesses needing automation", "companies needing a new digital platform"
];
const businessSectors = [
  "restaurants", "cafes", "retail shops", "clothing stores", "medical clinics", "dental practices", "law firms",
  "accounting firms", "real estate agencies", "hotels", "travel agencies", "gyms", "beauty salons", "car dealerships",
  "auto repair shops", "education centers", "private schools", "construction companies", "manufacturers", "wholesalers",
  "logistics companies", "home service companies", "consultants", "local professional services"
];
const businessGeoForms = ["in {area}", "near {area}", "serving {area}", "based around {area}", "in the {area} market", "around {area}"];
const businessQueryForms = ["{intent} among {sector} {geo}", "{sector} {geo} that may need {skill}", "{intent} {geo} for {sector}", "{skill} opportunities: {sector} {geo}", "find prospects: {intent} {sector} {geo}", "{sector} with digital gaps {geo}"];
const socialIntents = [
  "looking for", "need a", "hiring a", "seeking a", "recommend a", "want to hire", "need help with",
  "searching for someone to", "open project for", "freelance project for", "request for proposal for",
  "need an agency for", "looking to outsource", "who can build", "anyone available for", "budget for",
  "urgent help needed with", "project requirement", "work opportunity for", "developer required for",
  "designer required for", "consultant needed for", "seeking bids for", "looking for quotes on"
];
const socialServiceForms = [
  "{skill}", "{skill} freelancer", "{skill} developer", "{skill} specialist", "{skill} agency", "{skill} expert",
  "{skill} consultant", "{skill} contractor", "{skill} service provider", "{skill} project", "{skill} work",
  "{skill} services", "{skill} professional", "{skill} team", "{skill} partner", "{skill} company"
];
const socialPlatforms = [
  "site:linkedin.com/posts", "site:linkedin.com", "site:facebook.com", "site:fb.com",
  "site:x.com", "site:twitter.com", "site:threads.net", "public social post"
];
const socialGeoForms = ["{area}", "in {area}", "near {area}", "based in {area}", "serving {area}", "{area} businesses", "{area} company", "{area} project"];
const socialQueryForms = [
  '{platform} "{intent}" "{service}" "{geo}"',
  '{platform} "{service}" "{intent}" "{geo}"',
  '{platform} "{intent}" "{skill}" "{geo}"',
  '{platform} "{service}" project budget "{geo}"',
  '{platform} "{service}" hiring OR freelance "{geo}"'
];

export const BUSINESS_QUERY_TEMPLATE_CAPACITY = businessIntents.length * businessSectors.length * businessGeoForms.length * businessQueryForms.length;
export const SOCIAL_QUERY_TEMPLATE_CAPACITY = socialIntents.length * socialServiceForms.length * socialPlatforms.length * socialGeoForms.length * socialQueryForms.length;

function render(template: string, values: Record<string, string>) {
  return template.replace(/\{(intent|sector|geo|skill|area|platform|service)\}/g, (_, key: string) => values[key] ?? "");
}

export function buildSocialQueryBatch(skill: string, country: string, city = "", limit = 5) {
  const area = city ? city + ", " + country : country;
  const queries: string[] = [];
  const chosen = [
    [0, 0, 0, 1, 0], [1, 1, 2, 1, 1], [2, 2, 1, 0, 2], [3, 3, 4, 5, 3], [4, 4, 5, 1, 4],
    [5, 5, 3, 2, 0], [6, 6, 6, 3, 1], [7, 7, 7, 5, 2]
  ];
  for (const [intentIndex, serviceIndex, platformIndex, geoIndex, formIndex] of chosen.slice(0, Math.max(1, Math.min(limit, 8)))) {
    queries.push(render(socialQueryForms[formIndex], {
      intent: socialIntents[intentIndex], service: socialServiceForms[serviceIndex].replaceAll("{skill}", skill),
      skill, area, platform: socialPlatforms[platformIndex], geo: socialGeoForms[geoIndex].replaceAll("{area}", area)
    }));
  }
  return queries;
}

export function buildBusinessQueryBatch(skill: string, country: string, city = "", limit = 5) {
  const area = city ? city + ", " + country : country;
  return businessQueryForms.slice(0, Math.max(1, Math.min(limit, businessQueryForms.length))).map((template, index) =>
    render(template, {
      intent: businessIntents[(index * 3) % businessIntents.length],
      sector: businessSectors[(index * 5) % businessSectors.length],
      geo: businessGeoForms[(index * 2) % businessGeoForms.length].replaceAll("{area}", area),
      skill, area
    })
  );
}
