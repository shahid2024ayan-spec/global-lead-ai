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
const businessGeoForms = ["in {area}", "near {area}", "serving {area}", "based around {area}", "in the {area} market", "around {area}", "across {area}", "located in {area}", "operating in {area}", "within {area}", "local to {area}", "in and around {area}"];
const businessQueryForms = ["{intent} among {sector} {geo}", "{sector} {geo} that may need {skill}", "{intent} {geo} for {sector}", "{skill} opportunities: {sector} {geo}", "find prospects: {intent} {sector} {geo}", "{sector} with digital gaps {geo}", "potential {skill} clients: {sector} {geo}", "{sector} businesses with outdated online presence {geo}", "small and independent {sector} {geo}", "official {sector} listings {geo}", "{sector} that could benefit from {skill} {geo}", "business prospects for {skill} in {sector} {geo}"];
