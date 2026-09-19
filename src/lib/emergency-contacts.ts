// Checked against Goa Government and Goa Police directories on 2026-09-19.
// Keep a bundled directory so emergency numbers remain visible during database outages.
export const EMERGENCY_SOURCES = [
  { name: "Goa Government helplines", url: "https://www.goa.gov.in/" },
  { name: "Goa Police directory", url: "https://citizen.goapolice.gov.in/web/guest/phone" },
  {
    name: "Goa Tourism helpline",
    url: "https://goatourism.gov.in/blog-list/experience-goa-with-ease-with-a-dedicated-helpline/",
  },
];
export const EMERGENCY_CONTACTS = [
  {
    id: "112",
    name: "Emergency response",
    phone: "112",
    category: "Emergency",
    note: "Immediate emergency assistance",
  },
  {
    id: "pink",
    name: "Pink Force",
    phone: "112",
    category: "Police",
    note: "Ask for Pink Force assistance",
  },
  {
    id: "pink-office",
    name: "Pink Force / Women Police contact",
    phone: "+917875756217",
    category: "Police",
    note: "Goa Police directory contact; call 112 for urgent help",
  },
  {
    id: "tourist",
    name: "Goa Tourist Helpline",
    phone: "1364",
    category: "Travel",
    note: "Tourism enquiries, complaints and assistance",
  },
  {
    id: "tourist-police",
    name: "Tourist Police",
    phone: "+917875756081",
    category: "Police",
    note: "Tourist Police contact listed by Goa Police",
  },
  {
    id: "ambulance",
    name: "Ambulance",
    phone: "108",
    category: "Medical",
    note: "Emergency ambulance assistance",
  },
  {
    id: "fire",
    name: "Fire Brigade",
    phone: "101",
    category: "Emergency",
    note: "Fire and rescue",
  },
  {
    id: "child",
    name: "Child Helpline",
    phone: "1098",
    category: "Support",
    note: "Assistance for children",
  },
  {
    id: "women",
    name: "Women Helpline",
    phone: "1091",
    category: "Support",
    note: "Women requiring assistance",
  },
  {
    id: "senior",
    name: "Senior Citizen Helpline",
    phone: "1090",
    category: "Support",
    note: "Support for senior citizens",
  },
  {
    id: "gmc",
    name: "Goa Medical College, Bambolim",
    phone: "+918322458700",
    category: "Medical",
    note: "Hospital contact; for an ambulance call 108",
  },
  {
    id: "coastal",
    name: "Goa Coastal Security Police",
    phone: "+918322222995",
    category: "Coastal",
    note: "Coastal police office; for immediate danger call 112",
  },
];
