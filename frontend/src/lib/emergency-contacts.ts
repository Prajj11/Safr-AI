// Checked against Goa Government and Goa Police directories on 2026-09-19.
// Keep a bundled directory so emergency numbers remain visible during database outages.
export const EMERGENCY_SOURCES = [
  { name: "Goa Government helplines", url: "https://www.goa.gov.in/" },
  {
    name: "Goa Police directory",
    url: "https://citizen.goapolice.gov.in/web/guest/phone",
  },
  {
    name: "Goa Tourism helpline",
    url: "https://goatourism.gov.in/blog-list/experience-goa-with-ease-with-a-dedicated-helpline/",
  },
];

export const EMERGENCY_LAST_VERIFIED = "2026-09-19";

export const EMERGENCY_NUMBERS = {
  police: "112",
  ambulance: "108",
  childline: "1098",
};

export const EMERGENCY_CONTACTS = [
  {
    id: "112",
    name: "Emergency response",
    phone: "112",
    category: "Emergency",
    note: "Immediate emergency assistance",
    verified: true,
  },
  {
    id: "pink",
    name: "Pink Force",
    phone: "112",
    category: "Police",
    note: "Ask for Pink Force assistance",
    verified: true,
  },
  {
    id: "pink-office",
    name: "Pink Force / Women Police contact",
    phone: "+917875756217",
    category: "Police",
    note: "Goa Police directory contact; call 112 for urgent help",
    verified: true,
  },
  {
    id: "tourist",
    name: "Goa Tourist Helpline",
    phone: "1364",
    category: "Travel",
    note: "Tourism enquiries, complaints and assistance",
    verified: true,
  },
  {
    id: "tourist-police",
    name: "Tourist Police",
    phone: "+917875756081",
    category: "Police",
    note: "Tourist Police contact listed by Goa Police",
    verified: true,
  },
  // TODO(verify): old DB seed had +918322428383
  {
    id: "ambulance",
    name: "Ambulance",
    phone: "108",
    category: "Medical",
    note: "Emergency ambulance assistance",
    verified: true,
  },
  {
    id: "fire",
    name: "Fire Brigade",
    phone: "101",
    category: "Emergency",
    note: "Fire and rescue",
    verified: true,
  },
  {
    id: "child",
    name: "Child Helpline",
    phone: "1098",
    category: "Support",
    note: "Assistance for children",
    verified: true,
  },
  {
    id: "women",
    name: "Women Helpline",
    phone: "1091",
    category: "Support",
    note: "Women requiring assistance",
    verified: true,
  },
  {
    id: "senior",
    name: "Senior Citizen Helpline",
    phone: "1090",
    category: "Support",
    note: "Support for senior citizens",
    verified: true,
  },
  {
    id: "gmc",
    name: "Goa Medical College, Bambolim",
    phone: "+918322458700",
    category: "Medical",
    note: "Hospital contact; for an ambulance call 108",
    verified: true,
  },
  // TODO(verify): old DB seed had +918322495000 - call both and keep the one that connects
  {
    id: "coastal",
    name: "Goa Coastal Security Police",
    phone: "+918322222995",
    category: "Coastal",
    note: "Coastal police office; for immediate danger call 112",
    verified: true,
  },
  {
    id: "drishti",
    name: "Drishti Marine Lifeguards",
    phone: "+918322520717",
    category: "Coastal",
    note: "Beach lifeguard control room for drowning and sea rescue",
    verified: false,
  },
  // TODO(verify) lifeguard agency contract may change, confirm current agency and number.
  {
    id: "coast-guard",
    name: "Coast Guard",
    phone: "1554",
    category: "Coastal",
    note: "Sea emergencies",
    verified: false,
  },
  // TODO(verify)
  {
    id: "cyber-crime",
    name: "Cyber Crime Helpline",
    phone: "1930",
    category: "Support",
    note: "Online fraud and cyber crime",
    verified: false,
  },
  // TODO(verify)
];

// TODO(add): hospitals in tourist areas (Mapusa, Calangute area, Margao, Vasco). Add only after verifying each number.
