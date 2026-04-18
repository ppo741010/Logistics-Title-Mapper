import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { analyzeViaAPI, bulkAnalyzeViaAPI, cleanPreviewViaAPI, submitFeedback } from "./api.js";

// ── Classification data ─────────────────────────────────────────────────────

const PRIORITY_DOMAIN_RULES = {
  "Warehouse": ["warehouse manager","warehouse supervisor","warehouse coordinator","warehouse assistant","warehouse","storeperson","store person","forklift","picker","packer","pick pack","inventory","stock","distribution centre","distribution center","devanner","labourer","fulfilment","fulfillment","fulfilment manager","fulfillment manager","inbound","outbound","returns","cold storage","receiving","despatch","put away"],
  "Transport": ["transport manager","dispatch coordinator","dispatcher","dispatch","allocator","delivery","driver","courier","linehaul","fleet","route"],
  "Freight Forwarding": ["freight","customs","brokerage","import","export","airfreight","seafreight","forwarding"],
  "Planning": ["supply chain","demand planner","planner","planning","procurement","purchasing","purchaser","buyer","business analyst","scheduler","sourcing","replenishment","forecast"],
  "Finance": ["accounts payable","accounts receivable","accounts payable/receivable","accountant","accounts","payroll","finance","billing","costing","fp&a","financial planning","financial analyst","treasury","budgeting"],
  "IT Support": ["developer","architect","systems","technology","application support","technical support","it support","software support","application specialist","hris specialist","technical consultant"],
  "Operations": ["operations manager","operations supervisor","operations coordinator","logistics manager","logistics coordinator","logistics","operator","controller","process","production","quality","qa","sap","decon","consol","erp","e-commerce","ecommerce","omnichannel"],
  "Business Administration": ["office administrator","admin assistant","executive assistant","personal assistant","receptionist","office support","clerical","office manager","hr business partner","hr advisor","hr coordinator","hr transformation","hr specialist"],
  "Sales": ["customer service","customer support","sales operations","sales coordinator","sales manager","sales","business development","key account","merchandiser","representative","account manager","commercial","commercial manager","commercial development","business to business","b2b","b2c","activation","channel"],
};

const FUZZY_ROLE_REPAIR = {
  "checkout/retail":"Other/Noise","retail":"Other/Noise","cleaning":"Other/Noise","electrician":"Other/Noise",
  "surveyor":"Other/Noise","agronomist":"Other/Noise","cleaner":"Other/Noise","estimator":"Other/Noise",
  "powerline":"Other/Noise","kiwifruit":"Other/Noise","faller":"Other/Noise","health consultant":"Other/Noise",
  "office administrator":"Business Administration","hr business partner":"Business Administration",
  "admin assistant":"Business Administration","executive assistant":"Business Administration",
  "receptionist":"Business Administration","analytics":"Planning","category manager":"Planning",
  "supply manager":"Planning","materials manager":"Planning","freight":"Freight Forwarding",
  "dispatch coordinator":"Transport","allocator":"Transport","driver":"Transport",
  "warehouse manager":"Warehouse","inventory":"Warehouse","forklift":"Warehouse",
  "accounts payable":"Finance","accountant":"Finance","payroll":"Finance",
  "developer":"IT Support","implementation":"IT Support","solutions consultant":"IT Support",
  "operations manager":"Operations","logistics":"Operations",
  "customer service":"Sales","sales":"Sales","business development":"Sales",
  "head of retail":"Sales","commercial manager":"Sales",
};

const LEVEL_MAPPING = {
  "ceo":"5. Executive / Strategic","gm":"5. Executive / Strategic","director":"5. Executive / Strategic",
  "head of":"5. Executive / Strategic","executive":"5. Executive / Strategic",
  "manager":"4. Expert / Specialist",
  "consultant":"4. Expert / Specialist","analyst":"4. Expert / Specialist","strategist":"4. Expert / Specialist",
  "specialist":"3. Senior / Professional",
  "senior":"3. Senior / Professional","team lead":"3. Senior / Professional",
  "principal":"3. Senior / Professional","advanced":"3. Senior / Professional",
  "coordinator":"2. Intermediate / Staff","supervisor":"2. Intermediate / Staff",
  "officer":"2. Intermediate / Staff","administrator":"2. Intermediate / Staff",
  "representative":"2. Intermediate / Staff","operator":"2. Intermediate / Staff",
  "driver":"2. Intermediate / Staff","planner":"2. Intermediate / Staff",
  "junior":"1. Junior / Entry","graduate":"1. Junior / Entry","trainee":"1. Junior / Entry",
  "entry":"1. Junior / Entry","assistant":"1. Junior / Entry","picker":"1. Junior / Entry",
  "packer":"1. Junior / Entry","handler":"1. Junior / Entry",
};

const WORK_NATURE_MAPPING = {
  "Management":["manager","director","head","gm","chief","executive","superintendent","principal"],
  "Specialist / Support":["analyst","planner","consultant","engineer","accountant","specialist","officer","admin","administrator","representative","agent","support","architect","business development","customer service","merchandiser","key account","sales","advisor","accounts","finance","billing","payroll"],
  "Operational":["coordinator","supervisor","operator","driver","picker","storeman","clerk","handler","assistant","staff","loader","sorter","packer","dispatch","storeperson","controller","tally","devanner","mechanic"],
};

const DOMAIN_SKILL_FIXED = {
  "Business Administration":["Leadership","Stakeholder Management","Strategic Planning","KPI Management"],
  "Operations":["Process Optimization","Operational Excellence","Resource Allocation","SOP Development"],
  "Finance":["Cost Analysis","Accounts Payable/Receivable","ERP Proficiency","Financial Reporting"],
  "Planning":["Demand Forecasting","Inventory Optimization","Supply Chain Planning","S&OP"],
  "Freight Forwarding":["Incoterms","Customs Clearance","Export/Import Documentation","Consolidation"],
  "Warehouse":["Inventory Accuracy","WMS","RF Scanning","Manual Handling","Safety Compliance"],
  "Transport":["TMS","Route Optimization","Fleet Management","Last Mile Delivery","Compliance"],
  "Sales":["CRM","Quotation","Market Analysis","Revenue Growth","Customer Service"],
  "IT Support":["Systems Integration","ERP Maintenance","Data Governance","IT Infrastructure"],
  "Other/Noise":[],
};

const REMOVE_PHRASES = ["immediate start","apply now","great opportunity","exciting opportunity","career growth","wanted","needed","join our team","above award rate","great money","packag","distrib","remuner","salary package","competitive package","competitive salary","bonus"];
const REMOVE_SHIFT = ["night shift","day shift","afternoon shift","am shift","pm shift","overnight","morning shift","part time","full time","casual"];
const REMOVE_CONTRACT = ["ftc","fixed term","fixed-term","contract role","contract position","temp role","temporary role","temp to perm","maternity cover","parental leave cover","secondment","ongoing","permanent role","casual role"];
const SALARY_PATTERN = /\$[\d,]+[k]?(\s*[-–]\s*\$?[\d,]+[k]?)?\s*(pa\b|p\.a\.|per annum|per year|annually|ph\b|p\.h\.|per hour)?/gi;
const CONTRACT_DURATION_PATTERN = /\b\d+[-\s]?(month|week|year)[s]?\b(\s*contract)?/gi;
const TYPO_MAP = {
  "assisstant":"assistant","coodrinator":"coordinator","sepcialist":"specialist",
  "mandarine":"mandarin","operatior":"operator","oprations":"operations",
  "mananger":"manager","manageer":"manager","manger":"manager",
  "logsitics":"logistics","logistic ":"logistics ","logsitic":"logistics",
  "warehuse":"warehouse","warehose":"warehouse","wherehouse":"warehouse",
  "suprevisor":"supervisor","supervisior":"supervisor","supervsior":"supervisor",
  "freigth":"freight","frieght":"freight",
  "tranport":"transport","transprot":"transport",
  "recieving":"receiving","reciving":"receiving",
  "planiner":"planner","plannner":"planner",
  "accouns":"accounts","acocunts":"accounts",
  "purchassing":"purchasing","purchacing":"purchasing",
  "cusotmer":"customer","custumer":"customer",
};
const HOURS_POSITIONS_PATTERN = /\b(\d+\.?\d*\s*h(rs?|ours?)(\s*p\.?w\.?|\s*per\s*week)?|\d+\s*x\s*\w+|x\s*\d+\s*(position|role|vacancy|vacancies)?s?|\d+\s*(position|role|vacancy|vacancies)s?|multiple\s*(position|role)s?)\b/gi;

// ── Feedback modal ────────────────────────────────────────────────────────────

function FeedbackModal({ page = "", onClose }) {
  const [step, setStep] = useState("rate");   // "rate" | "comment" | "done"
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState("");

  async function handleRate(r) {
    setRating(r);
    setStep("comment");
  }

  async function handleSubmit() {
    await submitFeedback(rating, comment.trim(), page);
    setStep("done");
    setTimeout(onClose, 1800);
  }

  async function handleSkip() {
    await submitFeedback(rating, "", page);
    setStep("done");
    setTimeout(onClose, 1800);
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 14, padding: "28px 30px", width: 340, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", fontFamily: "inherit" }}>

        {step === "rate" && <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>Quick feedback</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>How is the tool working for you?</div>
          <div style={{ display: "flex", gap: 12 }}>
            {[["up", "👍", "Works great"], ["down", "👎", "Something's off"]].map(([r, emoji, label]) => (
              <button key={r} onClick={() => handleRate(r)}
                style={{ flex: 1, padding: "14px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontFamily: "inherit", fontSize: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, color: C.textMuted, transition: "border-color 0.15s" }}>
                {emoji}
                <span style={{ fontSize: 11 }}>{label}</span>
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ marginTop: 16, background: "none", border: "none", fontSize: 12, color: C.textMuted, cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "center" }}>Cancel</button>
        </>}

        {step === "comment" && <>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>
            {rating === "up" ? "👍 Glad it's working!" : "👎 Thanks for letting us know"}
          </div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>Anything specific to add? (optional)</div>
          <textarea
            autoFocus
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={300}
            placeholder="e.g. The Transport category is missing X..."
            style={{ width: "100%", boxSizing: "border-box", height: 90, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, padding: "10px 12px", fontFamily: "inherit", resize: "none", outline: "none" }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={handleSkip}
              style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Skip
            </button>
            <button onClick={handleSubmit}
              style={{ flex: 2, padding: "10px 0", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Send Feedback
            </button>
          </div>
        </>}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Thanks for the feedback!</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>It helps us improve the tool.</div>
          </div>
        )}
      </div>
    </div>
  );
}

const SKILL_SYNONYMS = {
  "erp":"ERP Systems","sap/erp":"ERP Systems","erp software":"ERP Systems",
  "wms":"WMS","warehouse management system":"WMS","wms software":"WMS",
  "tms":"TMS","transport management system":"TMS","tms software":"TMS",
  "crm":"CRM","customer relationship management":"CRM","crm software":"CRM",
  "ms excel":"Microsoft Excel","microsoft excel":"Microsoft Excel","advanced excel":"Microsoft Excel (Advanced)",
  "forklift operation":"Forklift Operation","sql":"SQL","data governance":"Data Governance",
  "supply chain management":"Supply Chain Management","inventory control":"Inventory Control",
  "inventory management":"Inventory Management","rf scanning":"RF Scanning",
  "sap":"SAP","s&op":"S&OP","kpi":"KPI","kpi management":"KPI Management",
  "mrp":"MRP","sop":"SOP","edi":"EDI","vmi":"VMI","ohs":"OHS","ehs":"EHS","sla":"SLA",
  // Analytics tools
  "power bi":"Power BI","powerbi":"Power BI","power-bi":"Power BI",
  "tableau":"Tableau",
  "python":"Python","python scripting":"Python",
  // Logistics operations
  "cold chain":"Cold Chain","cold storage":"Cold Chain","temperature controlled":"Cold Chain",
  "last mile":"Last Mile Delivery","last mile delivery":"Last Mile Delivery","last-mile":"Last Mile Delivery",
  "cross docking":"Cross-Docking","cross-docking":"Cross-Docking","cross dock":"Cross-Docking",
  "pick and pack":"Pick & Pack","pick & pack":"Pick & Pack","pick pack":"Pick & Pack",
  "3pl management":"3PL Management","third party logistics":"3PL Management","3pl":"3PL Management",
  // Compliance & certifications
  "dangerous goods":"Dangerous Goods","dg":"Dangerous Goods","hazmat":"Dangerous Goods","hazchem":"Dangerous Goods",
  "haccp":"HACCP","food safety":"HACCP",
  "iso 9001":"ISO 9001","iso9001":"ISO 9001",
  "customs compliance":"Customs Compliance","customs regulations":"Customs Compliance",
  // Procurement
  "tender management":"Tender Management","rfq":"Tender Management","request for quotation":"Tender Management",
  "vendor management":"Vendor Management","supplier management":"Vendor Management","supplier relations":"Vendor Management",
  "contract negotiation":"Contract Negotiation","contract management":"Contract Negotiation",
  // Soft skills
  "stakeholder management":"Stakeholder Management","stakeholder engagement":"Stakeholder Management",
  "team leadership":"Team Leadership","people management":"Team Leadership","leading teams":"Team Leadership",
  "communication":"Communication Skills","written communication":"Communication Skills","verbal communication":"Communication Skills",
  "continuous improvement":"Continuous Improvement","ci":"Continuous Improvement","lean":"Lean Methodology",
  "lean six sigma":"Lean Six Sigma","six sigma":"Lean Six Sigma",
  // Microsoft Office Suite
  "microsoft office":"Microsoft Office Suite","ms office":"Microsoft Office Suite","office 365":"Microsoft Office Suite","microsoft 365":"Microsoft Office Suite","ms office suite":"Microsoft Office Suite",
  "microsoft word":"Microsoft Word","ms word":"Microsoft Word",
  "microsoft powerpoint":"Microsoft PowerPoint","ms powerpoint":"Microsoft PowerPoint","powerpoint":"Microsoft PowerPoint",
  "microsoft outlook":"Microsoft Outlook","ms outlook":"Microsoft Outlook","outlook":"Microsoft Outlook",
  "microsoft teams":"Microsoft Teams","ms teams":"Microsoft Teams",
  // Google Workspace
  "google workspace":"Google Workspace","google suite":"Google Workspace","g suite":"Google Workspace",
  "google sheets":"Google Sheets","g sheets":"Google Sheets",
  "google docs":"Google Docs",
  // Accounting software
  "xero":"Xero","xero accounting":"Xero",
  "myob":"MYOB","myob accounting":"MYOB",
  "quickbooks":"QuickBooks","quick books":"QuickBooks",
  // Project management tools
  "project management":"Project Management","pm skills":"Project Management",
  "agile":"Agile","agile methodology":"Agile","scrum":"Agile",
  "jira":"Jira",
  "asana":"Asana",
  "trello":"Trello",
  "ms project":"Microsoft Project","microsoft project":"Microsoft Project",
  // HR systems
  "hris":"HRIS","hr information system":"HRIS","hr system":"HRIS",
  "workday":"Workday",
  "employment hero":"Employment Hero",
  // General office skills
  "data entry":"Data Entry","data input":"Data Entry",
  "report writing":"Report Writing","reporting":"Report Writing",
  "scheduling":"Scheduling","calendar management":"Scheduling","diary management":"Scheduling",
  "presentation skills":"Presentation Skills","presentations":"Presentation Skills",
  "problem solving":"Problem Solving","problem-solving":"Problem Solving",
  "time management":"Time Management",
  "attention to detail":"Attention to Detail",
  "minute taking":"Minute Taking","meeting minutes":"Minute Taking","minutes":"Minute Taking",
  "adaptability":"Adaptability","adaptable":"Adaptability",
  "collaboration":"Collaboration","teamwork":"Collaboration",
};

const SKILL_DESCRIPTIONS = {
  "WMS":                      "Warehouse Management System — software used to manage day-to-day warehouse operations including inventory tracking, picking, and dispatch.",
  "TMS":                      "Transport Management System — platform for planning, executing, and optimising the movement of goods.",
  "ERP Systems":              "Enterprise Resource Planning — integrated software (e.g. SAP, Oracle) that manages core business processes across finance, supply chain, and operations.",
  "SAP":                      "SAP ERP — one of the most widely used enterprise platforms in logistics and supply chain management.",
  "CRM":                      "Customer Relationship Management — software for managing customer interactions, sales pipelines, and account data.",
  "Microsoft Excel":          "Spreadsheet tool used for data analysis, reporting, and operational planning in logistics roles.",
  "Microsoft Excel (Advanced)":"Advanced Excel skills including pivot tables, VLOOKUP, macros, and data modelling.",
  "SQL":                      "Structured Query Language — used to query and manage data in relational databases.",
  "S&OP":                     "Sales & Operations Planning — cross-functional process aligning demand forecasts with supply capacity.",
  "MRP":                      "Material Requirements Planning — system for calculating materials and components needed to manufacture products.",
  "EDI":                      "Electronic Data Interchange — standardised electronic communication of business documents (e.g. purchase orders, invoices) between trading partners.",
  "VMI":                      "Vendor Managed Inventory — arrangement where the supplier monitors and replenishes stock on behalf of the buyer.",
  "RF Scanning":              "Radio Frequency scanning — handheld barcode scanning used for inventory tracking and order picking in warehouses.",
  "Forklift Operation":       "Operation of forklift equipment for moving, stacking, and loading goods in a warehouse or DC environment.",
  "Supply Chain Management":  "End-to-end coordination of goods, information, and finances from supplier to customer.",
  "Inventory Control":        "Processes and procedures to maintain accurate stock levels and minimise discrepancies.",
  "Inventory Management":     "Broader management of stock — including ordering, storage, and movement of goods across the supply chain.",
  "KPI":                      "Key Performance Indicators — metrics used to measure and track operational performance.",
  "KPI Management":           "Setting, monitoring, and reporting on KPIs to drive performance improvement.",
  "SOP":                      "Standard Operating Procedures — documented step-by-step instructions for routine operations.",
  "Data Governance":          "Framework for managing data quality, security, and compliance across an organisation.",
  "OHS":                      "Occupational Health & Safety — compliance and practices related to workplace safety.",
  "EHS":                      "Environment, Health & Safety — broader framework covering environmental compliance alongside workplace safety.",
  "SLA":                      "Service Level Agreement — contractual commitments defining expected service standards (e.g. delivery timeframes).",
  // Analytics tools
  "Power BI":                 "Microsoft Power BI — business intelligence tool used for data visualisation and reporting dashboards.",
  "Tableau":                  "Data visualisation platform used to create interactive reports and dashboards from large datasets.",
  "Python":                   "Programming language commonly used for data analysis, automation, and scripting in logistics and supply chain contexts.",
  // Logistics operations
  "Cold Chain":               "Temperature-controlled supply chain management — ensuring goods (e.g. food, pharmaceuticals) are stored and transported within required temperature ranges.",
  "Last Mile Delivery":       "The final stage of the delivery process from a distribution hub to the end customer — a key focus area for cost and customer experience.",
  "Cross-Docking":            "Logistics process where incoming goods are transferred directly to outbound transport with minimal or no storage time.",
  "Pick & Pack":              "Warehouse fulfilment process of selecting items from stock and packaging them for shipment.",
  "3PL Management":           "Management of third-party logistics providers — overseeing outsourced warehousing, transport, and fulfilment operations.",
  // Compliance & certifications
  "Dangerous Goods":          "Handling, documentation, and compliance for hazardous materials (HAZCHEM/HAZMAT) in transport and storage.",
  "HACCP":                    "Hazard Analysis and Critical Control Points — food safety management system identifying and controlling biological, chemical, and physical hazards.",
  "ISO 9001":                 "International standard for quality management systems — demonstrates consistent processes and continuous improvement.",
  "Customs Compliance":       "Knowledge of import/export regulations, tariff classifications, and customs documentation requirements.",
  // Procurement
  "Tender Management":        "Process of issuing RFQs, evaluating supplier bids, and awarding contracts for goods or services.",
  "Vendor Management":        "Building and maintaining relationships with suppliers — covering performance monitoring, onboarding, and risk management.",
  "Contract Negotiation":     "Negotiating and managing commercial agreements with suppliers, carriers, or service providers.",
  // Soft skills
  "Stakeholder Management":   "Engaging and influencing internal and external stakeholders to align on goals and drive outcomes.",
  "Team Leadership":          "Leading, developing, and managing a team to achieve operational goals.",
  "Communication Skills":     "Effective written and verbal communication across teams, clients, and stakeholders.",
  "Continuous Improvement":   "Identifying and implementing incremental process improvements to increase efficiency and reduce waste.",
  "Lean Methodology":         "Operational philosophy focused on eliminating waste and maximising value in processes.",
  "Lean Six Sigma":           "Combined methodology using Lean (waste reduction) and Six Sigma (defect reduction) for process improvement.",
  // Microsoft Office Suite
  "Microsoft Office Suite":   "Core Microsoft productivity tools — Word, Excel, PowerPoint, Outlook, and Teams — widely used in office and admin roles.",
  "Microsoft Word":           "Word processing tool used for drafting documents, reports, and correspondence.",
  "Microsoft PowerPoint":     "Presentation software used to create slides for meetings, reports, and business proposals.",
  "Microsoft Outlook":        "Email and calendar management tool used for scheduling, communication, and task tracking.",
  "Microsoft Teams":          "Collaboration platform for messaging, video calls, and file sharing within organisations.",
  // Google Workspace
  "Google Workspace":         "Google's cloud-based productivity suite — including Gmail, Docs, Sheets, Drive, and Meet.",
  "Google Sheets":            "Cloud-based spreadsheet tool, equivalent to Excel, used for data tracking and reporting.",
  "Google Docs":              "Cloud-based word processing tool for collaborative document creation and editing.",
  // Accounting software
  "Xero":                     "Cloud-based accounting software widely used by SMEs in Australia and New Zealand for invoicing, payroll, and reporting.",
  "MYOB":                     "Australian accounting software used for bookkeeping, payroll, and business financials.",
  "QuickBooks":               "Accounting software used for managing invoices, expenses, payroll, and financial reporting.",
  // Project management tools
  "Project Management":       "Planning, executing, and overseeing projects to deliver on time, on budget, and within scope.",
  "Agile":                    "Iterative project management methodology focused on flexibility, collaboration, and incremental delivery.",
  "Jira":                     "Project tracking tool widely used for managing tasks, sprints, and workflows in Agile teams.",
  "Asana":                    "Work management platform for tracking tasks, projects, and team workloads.",
  "Trello":                   "Visual task management tool using boards and cards to organise and track project progress.",
  "Microsoft Project":        "Project scheduling and planning software used for managing timelines, resources, and dependencies.",
  // HR systems
  "HRIS":                     "Human Resources Information System — software for managing employee records, payroll, and HR processes.",
  "Workday":                  "Cloud-based HR and finance platform used for talent management, payroll, and workforce planning.",
  "Employment Hero":          "HR and payroll platform popular in Australia and New Zealand for onboarding, leave management, and compliance.",
  // General office skills
  "Data Entry":               "Accurate input and management of data into systems, spreadsheets, or databases.",
  "Report Writing":           "Preparing clear, structured reports and summaries for internal or external stakeholders.",
  "Scheduling":               "Coordinating and managing calendars, appointments, and meeting logistics.",
  "Presentation Skills":      "Ability to create and deliver clear, engaging presentations to internal or external audiences.",
  "Problem Solving":          "Identifying issues, analysing root causes, and developing effective solutions.",
  "Time Management":          "Prioritising tasks and managing workload efficiently to meet deadlines.",
  "Attention to Detail":      "Maintaining accuracy and thoroughness in tasks, data, and documentation.",
  "Minute Taking":            "Recording accurate meeting notes and action items for distribution to attendees.",
  "Adaptability":             "Ability to adjust to changing priorities, processes, and environments effectively.",
  "Collaboration":            "Working effectively with cross-functional teams to achieve shared goals.",
};

// ── Core logic ──────────────────────────────────────────────────────────────

function cleanTitle(raw) {
  let t = raw;
  // Strip emoji and special Unicode symbols
  t = t.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu, "").trim();
  // Normalize ALL-CAPS titles: if >70% of letters are uppercase, lowercase first
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.7) {
    t = t.toLowerCase();
  }
  for (const p of [...REMOVE_PHRASES, ...REMOVE_SHIFT]) t = t.replace(new RegExp(p, "gi"), "");
  for (const [typo, fix] of Object.entries(TYPO_MAP)) t = t.replace(new RegExp(typo, "gi"), fix);
  t = t.replace(SALARY_PATTERN, "");
  t = t.replace(CONTRACT_DURATION_PATTERN, "");
  t = t.replace(HOURS_POSITIONS_PATTERN, "");
  for (const p of REMOVE_CONTRACT) t = t.replace(new RegExp(`\\b${p}\\b`, "gi"), "");
  t = t.replace(/[-–|,]\s*(NZ|AU|NZL|AUS|NZ\/AU|AU\/NZ|Auckland|Wellington|Christchurch|Hamilton|Dunedin|Sydney|Melbourne|Brisbane|Perth|Adelaide|Canberra|Singapore|SGP|London|Manchester|Birmingham|UK|United Kingdom|New York|Los Angeles|Chicago|Houston|US|USA|United States|APAC|ANZ|Remote|Hybrid|On-?site).*/i, "");
  t = t.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "");
  t = t.replace(/\bSr\.(\s)/gi, "Senior$1").replace(/\bSr\.$/gi, "Senior")
       .replace(/\bJr\.(\s)/gi, "Junior$1").replace(/\bJr\.$/gi, "Junior")
       .replace(/\bMgr\.?(\s|$)/gi, "Manager$1").replace(/\bCoord\.?(\s|$)/gi, "Coordinator$1")
       .replace(/\bAsst\.?(\s|$)/gi, "Assistant$1").replace(/\bSupvr?\.?(\s|$)/gi, "Supervisor$1")
       .replace(/\bDir\.?(\s|$)/gi, "Director$1").replace(/\bExec\.?(\s|$)/gi, "Executive$1")
       .replace(/\bBD\b/g, "Business Development").replace(/\bOps\b/gi, "Operations")
       .replace(/\bFP&A\b/gi, "Financial Planning & Analysis")
       .replace(/\bAP\/AR\b/gi, "Accounts Payable/Receivable")
       .replace(/\bA\/P\b/gi, "Accounts Payable").replace(/\bA\/R\b/gi, "Accounts Receivable")
       .replace(/\bB2B\b/gi, "Business to Business").replace(/\bB2C\b/gi, "Business to Consumer")
       .replace(/\bGM\b/g, "General Manager").replace(/\bVP\b/g, "Vice President")
       .replace(/\bSVP\b/g, "Senior Vice President").replace(/\bEVP\b/g, "Executive Vice President")
       .replace(/\bCOO\b/g, "Chief Operations Officer").replace(/\bCFO\b/g, "Chief Financial Officer")
       .replace(/\bCTO\b/g, "Chief Technology Officer")
       .replace(/\b3PL\b/gi, "3PL").replace(/\bDC\b/g, "Distribution Centre")
       .replace(/\bInt['']?l\b/gi, "International").replace(/\bNatl\b/gi, "National")
       .replace(/\bTL\b/g, "Team Lead").replace(/\bP&L\b/gi, "P&L");
  t = t.replace(/(\s*[-–]\s*){2,}/g, " - ");
  return t.trim().replace(/\s+/g, " ").replace(/[-–,|&]+$/, "").trim()
          .replace(/\b\w/g, c => c.toUpperCase());
}

function classify(title, description) {
  const tl = title.toLowerCase(), dl = description.toLowerCase();

  // Score every domain — multi-word keywords are more specific, weight them higher
  const domainScores = {};
  const domainMatches = {};
  for (const [domain, kws] of Object.entries(PRIORITY_DOMAIN_RULES)) {
    let score = 0;
    const matched = [];
    for (const kw of kws) {
      if (tl.includes(kw)) {
        const weight = kw.includes(" ") ? kw.split(" ").length : 1;
        score += weight;
        matched.push(kw);
      }
    }
    if (score > 0) { domainScores[domain] = score; domainMatches[domain] = matched; }
  }

  if (Object.keys(domainScores).length > 0) {
    const sorted = Object.entries(domainScores).sort((a, b) => b[1] - a[1]);
    const [bestDomain, bestScore] = sorted[0];
    const secondScore = sorted[1]?.[1] || 0;
    const margin = bestScore - secondScore;
    const confidence =
      bestScore >= 4 && margin >= 2 ? 92 :
      bestScore >= 3 && margin >= 2 ? 88 :
      bestScore >= 2 && margin >= 1 ? 80 :
      margin >= 1 ? 72 : 62;
    return { domain: bestDomain, confidence, source: "title", matchedKeywords: domainMatches[bestDomain] };
  }

  // Fuzzy repair fallback
  for (const [key, domain] of Object.entries(FUZZY_ROLE_REPAIR)) {
    if (tl.includes(key)) {
      if (domain === "Other/Noise")
        return { domain, confidence: 30, source: "fuzzy", matchedKeywords: [key], noiseReason: "fuzzy_noise", noiseKeyword: key };
      return { domain, confidence: 74, source: "fuzzy", matchedKeywords: [key] };
    }
  }

  // Description fallback — also weighted
  if (description.length > 0) {
    const descScores = {};
    for (const [domain, kws] of Object.entries(PRIORITY_DOMAIN_RULES))
      for (const kw of kws)
        if (dl.includes(kw)) descScores[domain] = (descScores[domain] || 0) + (kw.includes(" ") ? kw.split(" ").length : 1);
    if (Object.keys(descScores).length > 0) {
      const best = Object.entries(descScores).sort((a, b) => b[1] - a[1])[0];
      const score = best[1];
      const confidence = score >= 4 ? 72 : score >= 2 ? 65 : 58;
      return { domain: best[0], confidence, source: "description", matchedKeywords: [] };
    }
  }

  return { domain: "Other/Noise", confidence: 30, source: "unmatched", matchedKeywords: [], noiseReason: "no_match" };
}

const CROSS_FUNCTIONAL_PAIRS = [
  { a: "warehouse",        b: "dispatch",         flag: "Cross-functional signal: Warehouse + Dispatch — may span multiple domains" },
  { a: "customer service", b: "logistics",        flag: "Cross-functional signal: Customer Service + Logistics — role scope may be broad" },
  { a: "transport",        b: "warehouse",        flag: "Cross-functional signal: Transport + Warehouse — dual-function role detected" },
  { a: "freight",          b: "customer",         flag: "Cross-functional signal: Freight + Customer-facing — may span Freight Forwarding and Sales" },
  { a: "customer service", b: "dispatch",         flag: "Cross-functional signal: Customer Service + Dispatch — may bridge Sales and Transport" },
];

function getSeniority(title) {
  const t = title.toLowerCase();
  for (const [key, label] of Object.entries(LEVEL_MAPPING)) if (t.includes(key)) return label;
  return "2. Intermediate / Staff";
}

function getWorkNature(title) {
  const t = title.toLowerCase();
  for (const [nature, kws] of Object.entries(WORK_NATURE_MAPPING))
    for (const kw of kws) if (t.includes(kw)) return nature;
  return "Operational";
}

function getSkills(domain, description) {
  const base = [...(DOMAIN_SKILL_FIXED[domain] || [])];
  const dl = description.toLowerCase(), extra = [];
  for (const [raw, norm] of Object.entries(SKILL_SYNONYMS))
    if (dl.includes(raw) && !base.includes(norm) && !extra.includes(norm)) extra.push(norm);
  return [...base, ...extra].slice(0, 6);
}

function analyze(rawTitle, description, country) {
  const clean = cleanTitle(rawTitle);
  const { domain, confidence, source, matchedKeywords = [], noiseReason, noiseKeyword } = classify(rawTitle, description);
  const seniority = domain === "Other/Noise" ? "Review Required" : getSeniority(rawTitle);
  const nature    = domain === "Other/Noise" ? "Review Required" : getWorkNature(rawTitle);
  const skills    = getSkills(domain, description);
  const flags = [];
  if (domain === "Other/Noise") flags.push("Title does not match a known logistics domain — verify before use");
  if (source === "description") flags.push("Domain inferred from description only — title keyword was ambiguous");
  if (!country) flags.push("Country not provided — seniority inference may be less accurate");
  if (description.length < 30) flags.push("Description is short — output is based mainly on title text");
  if (rawTitle.length > 60) flags.push("Title is long — may contain location, shift, or contract noise");
  const combined = (rawTitle + " " + description).toLowerCase();
  for (const { a, b, flag } of CROSS_FUNCTIONAL_PAIRS)
    if (combined.includes(a) && combined.includes(b)) flags.push(flag);
  const hasCrossFlag = CROSS_FUNCTIONAL_PAIRS.some(({ a, b }) => combined.includes(a) && combined.includes(b));
  const needsReview = domain === "Other/Noise" || confidence < 70 || hasCrossFlag;
  return { cleanTitle: clean, domain, nature, seniority, skills, confidence, flags, hasCrossFlag, needsReview, matchedKeywords, noiseReason, noiseKeyword };
}

// ── File parsing ─────────────────────────────────────────────────────────────

function parseCSVLine(line) {
  const fields = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim()); current = "";
    } else { current += ch; }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("File appears to be empty or has no data rows.");
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows = lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  }).filter(row => headers.some(h => row[h]));
  return { headers, rows };
}

function parseXLSX(buffer) {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!data.length) throw new Error("File appears to be empty.");
  const headers = data[0].map(h => String(h).trim()).filter(h => h);
  const rows = data.slice(1)
    .filter(row => row.some(v => String(v).trim()))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
      return obj;
    });
  if (!rows.length) throw new Error("File has headers but no data rows.");
  return { headers, rows };
}

// ── Column auto-detection ────────────────────────────────────────────────────

const RAW_TITLE_ALIASES  = ["raw_title","rawtitle","raw title","title","job title","job_title","jobtitle","position","role","job","position title","job name"];
const DESC_ALIASES       = ["description","desc","job description","job_description","jobdescription","responsibilities","details","job desc","summary"];
const COUNTRY_ALIASES    = ["country","location","region","market","country/region","geo"];

function detectColumns(headers) {
  const hl = headers.map(h => h.toLowerCase().trim());
  const find = (aliases) => {
    for (const alias of aliases) {
      const idx = hl.indexOf(alias);
      if (idx !== -1) return headers[idx];
    }
    return null;
  };
  return { rawTitle: find(RAW_TITLE_ALIASES), description: find(DESC_ALIASES), country: find(COUNTRY_ALIASES) };
}

// ── Export utilities ─────────────────────────────────────────────────────────

const EXPORT_FIELDS = ["raw_title","clean_title","functional_area","work_nature","seniority","confidence","skills","review_flags","needs_review","country"];

function buildExportRow(r) {
  return {
    raw_title:       r.raw || "",
    clean_title:     r.cleanTitle || "",
    functional_area: r.domain || "",
    work_nature:     r.nature || "",
    seniority:       r.seniority || "",
    confidence:      `${r.confidence}%`,
    skills:          (r.skills || []).join("; "),
    review_flags:    (r.flags || []).join(" | "),
    needs_review:    r.needsReview ? "Yes" : "No",
    country:         r.country || "",
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doDownloadCSV(results, filename = "logistics_structured.csv") {
  const rows = results.map(buildExportRow);
  const header = EXPORT_FIELDS.join(",");
  const lines = rows.map(r =>
    EXPORT_FIELDS.map(f => {
      const v = String(r[f] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  );
  triggerDownload(new Blob([header + "\n" + lines.join("\n")], { type: "text/csv" }), filename);
}

function doDownloadJSON(results, filename = "logistics_structured.json") {
  const rows = results.map(r => ({
    raw_title: r.raw || "",
    clean_title: r.cleanTitle || "",
    functional_area: r.domain || "",
    work_nature: r.nature || "",
    seniority: r.seniority || "",
    confidence: r.confidence,
    skills: r.skills || [],
    review_flags: r.flags || [],
    needs_review: r.needsReview || false,
    country: r.country || "",
  }));
  triggerDownload(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), filename);
}

function doDownloadXLSX(results, filename = "logistics_structured.xlsx") {
  const rows = results.map(buildExportRow);
  const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_FIELDS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Structured Output");
  XLSX.writeFile(wb, filename);
}

// ── Design system ───────────────────────────────────────────────────────────

const C = {
  sidebar: "#16192a", sidebarHover: "#1f2440", sidebarActive: "#252b4a",
  sidebarText: "#7c85a0", sidebarActiveText: "#ffffff",
  accent: "#3b6ef5", accentLight: "#eef2ff", accentBorder: "#c7d7fc",
  green: "#16a34a", greenLight: "#f0fdf4", greenBorder: "#bbf7d0",
  amber: "#d97706", amberLight: "#fffbeb", amberBorder: "#fcd34d",
  red: "#dc2626", redLight: "#fef2f2", redBorder: "#fca5a5",
  text: "#111827", textSub: "#374151", textMuted: "#6b7280",
  border: "#e5e7eb", bg: "#f8fafc", card: "#ffffff",
  pill: "#f3f4f6", pillText: "#374151",
};

function Badge({ tone = "blue", children, size = "sm" }) {
  const tones = {
    blue:  { background: C.accentLight, color: C.accent,   border: C.accentBorder },
    green: { background: C.greenLight,  color: C.green,    border: C.greenBorder },
    amber: { background: C.amberLight,  color: C.amber,    border: C.amberBorder },
    red:   { background: C.redLight,    color: C.red,      border: C.redBorder },
    gray:  { background: C.pill,        color: C.textSub,  border: C.border },
    slate: { background: "#f1f5f9",     color: "#475569",  border: "#cbd5e1" },
  };
  const t = tones[tone] || tones.gray;
  return (
    <span style={{ ...t, border: `1px solid ${t.border}`, padding: size === "sm" ? "3px 10px" : "4px 14px", borderRadius: 20, fontSize: size === "sm" ? 12 : 13, fontWeight: 600, display: "inline-block", letterSpacing: "0.01em" }}>
      {children}
    </span>
  );
}

function Card({ children, style = {}, highlight }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${highlight ? C.accentBorder : C.border}`, borderRadius: 12, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style }}>
      {children}
    </div>
  );
}

function FieldLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 7 }}>{children}</div>;
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: C.text, margin: 0 }}>{children}</h1>
      {sub && <p style={{ color: C.textMuted, margin: "5px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

function ConfidenceBar({ value }) {
  const tone = value >= 80
    ? { bar: C.green, label: "High",                    text: C.green }
    : value >= 60
    ? { bar: C.amber, label: "Medium",                  text: C.amber }
    : { bar: C.red,   label: "Low — review recommended", text: C.red };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Confidence Score</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: tone.text }}>{value}% · {tone.label}</span>
      </div>
      <div style={{ background: "#e5e7eb", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, background: tone.bar, height: 8, borderRadius: 6, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function domainTone(d) {
  return { "Warehouse":"blue","Transport":"blue","Freight Forwarding":"blue","Planning":"green",
           "Operations":"blue","Finance":"amber","Sales":"green","IT Support":"slate",
           "Business Administration":"slate","Other/Noise":"red" }[d] || "gray";
}

function seniorityTone(label) {
  if (label === "Review Required") return "gray";
  if (label.includes("5.")) return "red";
  if (label.includes("4.")) return "amber";
  if (label.includes("3.")) return "green";
  if (label.includes("2.")) return "blue";
  return "gray";
}

const inputStyle = {
  width: "100%", padding: "10px 13px", borderRadius: 8,
  border: `1.5px solid ${C.border}`, fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit", background: C.card, color: C.text, lineHeight: 1.5,
};

// ── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage({ onEnter }) {
  const features = [
    { icon: "✏️", title: "Clean Titles",       desc: "Removes noise, expands abbreviations, strips location and shift suffixes automatically." },
    { icon: "🏷️", title: "Classify Roles",     desc: "Suggests functional area, seniority level, and work nature using a rule-based taxonomy." },
    { icon: "🧩", title: "Normalize Skills",   desc: "Maps raw skill phrases like 'WMS software' or 'advanced excel' to standard canonical labels." },
    { icon: "📂", title: "Bulk Processing",    desc: "Upload CSV or XLSX files with up to 10,000 rows. Map your own column names." },
    { icon: "⬇️", title: "Export Ready",       desc: "Download structured output as CSV, JSON, or XLSX — ready for downstream use." },
    { icon: "⚑",  title: "Flag for Review",    desc: "Highlights ambiguous, low-confidence, cross-functional, and out-of-scope titles automatically." },
  ];

  const audiences = ["Recruiters cleaning job ad data", "HR teams standardizing job title libraries", "Analysts normalizing workforce data", "Operations teams building role taxonomies"];

  return (
    <div style={{ minHeight: "100vh", background: "#0d1021", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <div style={{ padding: "18px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1f38" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#1e2444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, border: "1px solid #2a3060" }}>📦</div>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>Logistics Title Mapper</span>
        </div>
        <button onClick={() => onEnter()} style={{ padding: "9px 22px", borderRadius: 8, background: C.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.01em" }}>
          Enter App →
        </button>
      </div>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 24px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-block", padding: "4px 14px", borderRadius: 20, border: "1px solid #2a3060", background: "#131829", color: "#6b85f5", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 28 }}>
          Workflow Utility Tool · Logistics
        </div>
        <h1 style={{ color: "#ffffff", fontSize: 46, fontWeight: 800, maxWidth: 680, lineHeight: 1.18, margin: "0 0 22px", letterSpacing: "-0.02em" }}>
          Turn messy logistics job titles into structured data
        </h1>
        <p style={{ color: "#8892b8", fontSize: 17, maxWidth: 540, lineHeight: 1.75, margin: "0 0 38px" }}>
          Built for recruiters, HR teams, and analysts who need to clean, classify, and normalize logistics job text — quickly and consistently.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => onEnter()} style={{ padding: "13px 32px", borderRadius: 9, background: C.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
            Enter App →
          </button>
          <button onClick={() => onEnter("analyzer")} style={{ padding: "13px 28px", borderRadius: 9, background: "transparent", color: "#8892b8", border: "1px solid #2a3060", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
            Try Single Analyzer
          </button>
        </div>
      </div>

      {/* Feature grid */}
      <div style={{ padding: "0 48px 56px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {features.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "#131829", border: "1px solid #1e2444", borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
              <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{title}</div>
              <div style={{ color: "#6b7694", fontSize: 13, lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Who it's for */}
      <div style={{ background: "#0b0e1d", borderTop: "1px solid #1a1f38", padding: "28px 48px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "#4a527a", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 8 }}>Built for:</span>
        {audiences.map((a, i) => (
          <span key={i} style={{ color: "#8892b8", fontSize: 13, padding: "4px 14px", background: "#131829", borderRadius: 20, border: "1px solid #1e2444" }}>{a}</span>
        ))}
      </div>
    </div>
  );
}

// ── Page 1: Single Analyzer ─────────────────────────────────────────────────

const SA_EXAMPLES = [
  "Sr. Freight Coordinator – FCL/LCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Customs Clearance / Import Export Officer",
  "Retail Health Consultant",
  "Demand Planner - APAC",
  "BD Executive Last Mile AU",
];

function SingleAnalyzer() {
  const [title, setTitle]   = useState("");
  const [desc, setDesc]     = useState("");
  const [country, setCountry] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!title.trim()) return;
    setLoading(true); setResult(null);
    const apiResult = await analyzeViaAPI(title, desc, country);
    setResult(apiResult ?? { ...analyze(title, desc, country), source: "local" });
    setLoading(false);
  }

  return (
    <div>
      <SectionTitle children="Single Analyzer" sub="Paste a messy logistics job title — get a clean, structured, reviewable draft output." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>

        {/* Input */}
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>Input</div>

          <div style={{ marginBottom: 15 }}>
            <FieldLabel>Job Title *</FieldLabel>
            <input value={title} onChange={e => { setTitle(e.target.value); setResult(null); }}
              onKeyDown={e => e.key === "Enter" && run()}
              placeholder="e.g. Sr. Freight Coordinator – FCL/LCL (NZ)"
              style={inputStyle} />
          </div>

          <div style={{ marginBottom: 15 }}>
            <FieldLabel>Job Description <span style={{ fontWeight: 400, color: C.textMuted }}>optional — improves classification</span></FieldLabel>
            <textarea value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Paste key responsibilities or requirements here..."
              rows={5} style={{ ...inputStyle, resize: "vertical" }} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <FieldLabel>Country <span style={{ fontWeight: 400, color: C.textMuted }}>optional</span></FieldLabel>
            <select value={country} onChange={e => setCountry(e.target.value)} style={{ ...inputStyle }}>
              <option value="">— Select country —</option>
              <option>New Zealand</option><option>Australia</option>
              <option>Singapore</option><option>United States</option><option>United Kingdom</option>
            </select>
          </div>

          <button onClick={run} disabled={!title.trim() || loading}
            style={{ width: "100%", padding: "12px", borderRadius: 8, background: title.trim() ? C.accent : "#d1d5db", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: title.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            {loading ? "Processing…" : "Analyze →"}
          </button>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 9, fontWeight: 600 }}>TRY AN EXAMPLE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SA_EXAMPLES.map(ex => (
                <button key={ex} onClick={() => { setTitle(ex); setDesc(""); setResult(null); }}
                  style={{ padding: "4px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                  {ex.length > 33 ? ex.slice(0, 33) + "…" : ex}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Output */}
        <div>
          {!result && !loading && (
            <Card style={{ background: C.bg, minHeight: 340, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: C.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📋</div>
              <div style={{ fontSize: 13 }}>Structured output will appear here</div>
            </Card>
          )}
          {loading && (
            <Card style={{ background: C.bg, minHeight: 340, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted }}>
              <div style={{ fontSize: 13 }}>Analyzing…</div>
            </Card>
          )}
          {result && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.source === "local" && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#78350f" }}>
                  ⚠ API unavailable — result from local classifier. Accuracy may differ from the Python engine.
                </div>
              )}
              {result.domain === "Other/Noise" && (
                <div style={{ background: C.redLight, border: `1.5px solid ${C.redBorder}`, borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 13, marginBottom: 6 }}>⚠ Outside logistics scope</div>
                  {result.noiseReason === "fuzzy_noise" && (
                    <div style={{ fontSize: 12, color: "#b91c1c", lineHeight: 1.7 }}>
                      Detected term <span style={{ fontFamily: "monospace", background: "#fecaca", padding: "1px 5px", borderRadius: 4 }}>{result.noiseKeyword}</span> — this matches a known non-logistics role category.<br />
                      This title is likely outside the logistics/supply chain domain. Exclude or manually reclassify before use.
                    </div>
                  )}
                  {result.noiseReason === "no_match" && (
                    <div style={{ fontSize: 12, color: "#b91c1c", lineHeight: 1.7 }}>
                      No logistics keywords were detected in this title or description.<br />
                      This title may be unrelated to logistics. Verify the source data or add a job description to improve classification.
                    </div>
                  )}
                </div>
              )}
              <Card highlight={result.domain !== "Other/Noise"}>
                <FieldLabel>Clean Title</FieldLabel>
                <div style={{ fontSize: 19, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{result.cleanTitle}</div>
                {result.cleanTitle.toLowerCase().replace(/\s/g,"") !== title.toLowerCase().replace(/\s/g,"") && (
                  <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted }}>
                    Original: <span style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 4 }}>{title}</span>
                  </div>
                )}
              </Card>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Functional Area</FieldLabel>
                  <Badge tone={domainTone(result.domain)}>{result.domain}</Badge>
                  {result.matchedKeywords?.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted }}>
                      Matched on: {result.matchedKeywords.map(k => (
                        <span key={k} style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 4, marginRight: 4 }}>{k}</span>
                      ))}
                    </div>
                  )}
                </Card>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Work Nature</FieldLabel>
                  <Badge tone={result.nature === "Review Required" ? "gray" : "slate"}>{result.nature}</Badge>
                </Card>
                <Card style={{ padding: 16 }}>
                  <FieldLabel>Suggested Seniority</FieldLabel>
                  <Badge tone={seniorityTone(result.seniority)}>{result.seniority}</Badge>
                </Card>
              </div>
              <Card style={{ padding: 18 }}>
                <FieldLabel>Normalized Skills</FieldLabel>
                {result.skills.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 4 }}>
                    {result.skills.map(s => (
                      <span key={s} style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, background: C.pill, color: C.pillText, fontWeight: 500, border: `1px solid ${C.border}` }}>{s}</span>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 13, color: C.textMuted }}>No skills mapped — outside logistics scope</span>}
              </Card>
              <Card style={{ padding: 18 }}>
                <ConfidenceBar value={result.confidence} />
              </Card>
              {result.flags.length > 0 && (
                <Card style={{ padding: 18 }}>
                  <FieldLabel>Review Flags</FieldLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {result.flags.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "9px 13px", fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                        <span style={{ flexShrink: 0, marginTop: 1 }}>⚑</span><span>{f}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
                    Ambiguous titles may be classified using description context when available.
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page 2: Bulk Upload ─────────────────────────────────────────────────────

function BulkUpload({ onResultsReady }) {
  const [phase, setPhase]               = useState("idle"); // idle | error | mapping | ready | previewing | processing | done
  const [error, setError]               = useState(null);
  const [fileName, setFileName]         = useState("");
  const [parsedRows, setParsedRows]     = useState([]);
  const [headers, setHeaders]           = useState([]);
  const [colMap, setColMap]             = useState({ rawTitle: "", description: "", country: "" });
  const [cleanPreviews, setCleanPreviews] = useState([]);
  const [results, setResults]           = useState([]);
  const [dragOver, setDragOver]         = useState(false);
  const fileInputRef                    = useRef(null);

  // Summary stats
  const total          = results.length;
  const outOfScope     = results.filter(r => r.domain === "Other/Noise").length;
  const reviewRequired = results.filter(r => r.needsReview && r.domain !== "Other/Noise").length;
  const structured     = results.filter(r => !r.needsReview).length;

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      setError(`Unsupported file type ".${ext}". Please upload a CSV or XLSX file.`);
      setPhase("error"); setFileName(file.name); return;
    }
    setFileName(file.name); setPhase("parsing");
    try {
      let parsed;
      if (ext === "csv") {
        const text = await file.text();
        parsed = parseCSVText(text);
      } else {
        const buffer = await file.arrayBuffer();
        parsed = parseXLSX(buffer);
      }
      const { headers: hdrs, rows } = parsed;
      if (!rows.length) throw new Error("The file has no data rows.");
      setParsedRows(rows); setHeaders(hdrs);
      const detected = detectColumns(hdrs);
      setColMap({ rawTitle: detected.rawTitle || "", description: detected.description || "", country: detected.country || "" });
      setPhase(detected.rawTitle ? "ready" : "mapping");
    } catch (err) {
      setError(err.message || "Could not parse the file. Please check the format and try again.");
      setPhase("error");
    }
  }

  async function processRows() {
    if (!colMap.rawTitle) return;
    setPhase("processing");

    const rows = parsedRows
      .map((row, i) => ({
        id: i + 1,
        raw:         (row[colMap.rawTitle] || "").trim(),
        // Use edited clean title from preview if available, otherwise raw
        title:       cleanPreviews[i]?.clean || (row[colMap.rawTitle] || "").trim(),
        description: colMap.description ? (row[colMap.description] || "") : "",
        country:     colMap.country     ? (row[colMap.country]     || "") : "",
      }))
      .filter(r => r.title);

    // Try API first
    const apiResults = await bulkAnalyzeViaAPI(
      rows.map(r => ({ title: r.title, description: r.description, country: r.country }))
    );

    let processed;
    if (apiResults) {
      processed = rows.map((r, i) => ({ id: r.id, raw: r.raw, country: r.country, ...apiResults[i] }));
    } else {
      processed = rows.map(r => ({ id: r.id, raw: r.raw, country: r.country, source: "local", ...analyze(r.title, r.description, r.country) }));
    }

    setResults(processed);
    onResultsReady && onResultsReady(processed);
    setPhase("done");
  }

  async function previewCleaning() {
    if (!colMap.rawTitle) return;
    setPhase("previewing_loading");
    const titles = parsedRows.map(r => (r[colMap.rawTitle] || "").trim()).filter(Boolean);
    const apiResult = await cleanPreviewViaAPI(titles);
    const pairs = apiResult
      ? apiResult.map(p => ({ raw: p.raw, clean: p.clean, original: p.clean }))
      : titles.map(t => { const c = cleanTitle(t); return { raw: t, clean: c, original: c }; });
    setCleanPreviews(pairs);
    setPhase("previewing");
  }

  function updateCleanPreview(index, value) {
    setCleanPreviews(prev => prev.map((p, i) => i === index ? { ...p, clean: value } : p));
  }

  function resetCleanPreview(index) {
    setCleanPreviews(prev => prev.map((p, i) => i === index ? { ...p, clean: p.original } : p));
  }

  function reset() {
    setPhase("idle"); setError(null); setFileName(""); setParsedRows([]); setHeaders([]);
    setColMap({ rawTitle: "", description: "", country: "" }); setCleanPreviews([]); setResults([]);
  }

  const onDrop = e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  // ── Render: Idle ──
  if (phase === "idle") return (
    <div>
      <SectionTitle children="Bulk Upload" sub="Upload a CSV or XLSX file to process multiple titles at once. Download export-ready structured output." />
      <Card>
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)} onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ border: `2px dashed ${dragOver ? C.accent : C.border}`, borderRadius: 10, padding: "52px 24px", textAlign: "center", background: dragOver ? C.accentLight : C.bg, cursor: "pointer", transition: "all 0.15s" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>📁</div>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 15, marginBottom: 6 }}>Drag & drop your file here</div>
          <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 18 }}>Supports CSV and XLSX · up to 10,000 rows</div>
          <button style={{ padding: "10px 26px", borderRadius: 8, border: `1.5px solid ${C.accent}`, background: C.card, color: C.accent, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Browse File
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>
        <div style={{ marginTop: 16, padding: "12px 16px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 5 }}>REQUIRED COLUMN</div>
          <div style={{ fontSize: 13, color: C.text }}>
            <code style={{ background: C.pill, padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>raw_title</code>
            <span style={{ color: C.textMuted, marginLeft: 10 }}>Optional: </span>
            <code style={{ background: C.pill, padding: "2px 7px", borderRadius: 4, fontSize: 12, marginLeft: 4 }}>description</code>
            <code style={{ background: C.pill, padding: "2px 7px", borderRadius: 4, fontSize: 12, marginLeft: 6 }}>country</code>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.textMuted }}>
            If your columns have different names, you'll be prompted to map them after uploading.
          </div>
        </div>
      </Card>
    </div>
  );

  // ── Render: Parsing ──
  if (phase === "parsing") return (
    <div>
      <SectionTitle children="Bulk Upload" />
      <Card style={{ padding: 48, textAlign: "center", color: C.textMuted }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
        <div style={{ fontWeight: 600, color: C.text, marginBottom: 6 }}>Reading file…</div>
        <div style={{ fontSize: 13 }}>{fileName}</div>
      </Card>
    </div>
  );

  // ── Render: Error ──
  if (phase === "error") return (
    <div>
      <SectionTitle children="Bulk Upload" />
      <Card style={{ background: C.redLight, border: `1.5px solid ${C.redBorder}` }}>
        <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 15, marginBottom: 8 }}>⚠ Upload Error</div>
        <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.7, marginBottom: 18 }}>{error}</div>
        <button onClick={reset} style={{ padding: "9px 20px", borderRadius: 8, background: C.card, border: `1px solid ${C.redBorder}`, color: C.red, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          ← Try Another File
        </button>
      </Card>
    </div>
  );

  // ── Render: Column Mapping ──
  if (phase === "mapping") return (
    <div>
      <SectionTitle children="Bulk Upload" sub="We couldn't auto-detect your column names. Please map them below." />
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 18 }}>
          📄 {fileName} · {parsedRows.length} rows detected
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          {[
            { key: "rawTitle", label: "Raw Title", required: true, note: "The messy job title column" },
            { key: "description", label: "Job Description", required: false, note: "Optional — improves classification" },
            { key: "country", label: "Country", required: false, note: "Optional" },
          ].map(({ key, label, required, note }) => (
            <div key={key}>
              <FieldLabel>{label} {required ? "*" : <span style={{ fontWeight: 400, color: C.textMuted }}>optional</span>}</FieldLabel>
              <select value={colMap[key]} onChange={e => setColMap(p => ({ ...p, [key]: e.target.value }))} style={{ ...inputStyle }}>
                <option value="">— None —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 5 }}>{note}</div>
            </div>
          ))}
        </div>
        {colMap.rawTitle && parsedRows[0] && (
          <div style={{ padding: "12px 16px", background: C.accentLight, borderRadius: 8, border: `1px solid ${C.accentBorder}`, marginBottom: 20, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: C.accent }}>Preview — first row: </span>
            <span style={{ fontFamily: "monospace", color: C.text }}>{parsedRows[0][colMap.rawTitle]}</span>
          </div>
        )}
        {!colMap.rawTitle && (
          <div style={{ padding: "10px 14px", background: C.amberLight, borderRadius: 8, border: `1px solid ${C.amberBorder}`, marginBottom: 20, fontSize: 13, color: "#78350f" }}>
            ⚠ A Raw Title column is required to continue.
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
            ← Back
          </button>
          <button onClick={() => setPhase("ready")} disabled={!colMap.rawTitle}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: colMap.rawTitle ? C.accent : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 13, cursor: colMap.rawTitle ? "pointer" : "default", fontFamily: "inherit" }}>
            Continue →
          </button>
        </div>
      </Card>
    </div>
  );

  // ── Render: Ready / Processing / Done ──
  return (
    <div>
      <SectionTitle children="Bulk Upload" sub="Upload a CSV or XLSX file to process multiple titles at once." />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* File bar */}
        <Card style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: C.accentLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📄</div>
              <div>
                <div style={{ fontWeight: 600, color: C.text }}>{fileName}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                  {parsedRows.length} rows · {phase === "done" ? `${total - structured} row${total - structured !== 1 ? "s" : ""} flagged for review` : "Ready to process"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={reset} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                Remove
              </button>
              {phase === "ready" && (
                <button onClick={previewCleaning} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Preview Cleaning →
                </button>
              )}
              {phase === "previewing_loading" && (
                <div style={{ padding: "8px 22px", borderRadius: 8, background: C.accentLight, color: C.accent, fontWeight: 600, fontSize: 13 }}>Loading preview…</div>
              )}
              {phase === "previewing" && (
                <button onClick={processRows} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                  Run Classifier →
                </button>
              )}
              {phase === "processing" && (
                <div style={{ padding: "8px 22px", borderRadius: 8, background: C.accentLight, color: C.accent, fontWeight: 600, fontSize: 13 }}>Processing…</div>
              )}
              {phase === "done" && (
                <div style={{ padding: "6px 14px", borderRadius: 8, background: C.greenLight, color: C.green, fontWeight: 700, fontSize: 12, border: `1px solid ${C.greenBorder}` }}>✓ Complete</div>
              )}
            </div>
          </div>
        </Card>

        {/* Fallback warning */}
        {phase === "done" && results[0]?.source === "local" && (
          <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#78350f" }}>
            ⚠ API unavailable — all results from local classifier. Accuracy may differ from the Python engine.
          </div>
        )}

        {/* Summary cards — shown when done */}
        {phase === "done" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[
              { label: "Total Rows",              value: total,          bg: C.card,       border: C.border,       text: C.text,   sub: C.textMuted },
              { label: "Structured Successfully", value: structured,     bg: C.greenLight, border: C.greenBorder,  text: C.green,  sub: "#166534" },
              { label: "Review Required",         value: reviewRequired, bg: C.amberLight, border: C.amberBorder,  text: C.amber,  sub: "#78350f" },
              { label: "Out of Scope",            value: outOfScope,     bg: C.redLight,   border: C.redBorder,    text: C.red,    sub: "#991b1b" },
            ].map(({ label, value, bg, border, text, sub }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "16px 18px" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: text, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: sub, marginTop: 6, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Preview table */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>
              {phase === "done" ? "Structured Output Preview" : phase === "previewing" ? "Cleaning Preview" : "Input Preview"}
            </div>
            {phase === "previewing" && (() => {
              const changed = cleanPreviews.filter(p => p.raw !== p.clean).length;
              return changed > 0
                ? <div style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>{changed} title{changed !== 1 ? "s" : ""} will be cleaned</div>
                : <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>All titles already clean</div>;
            })()}
            {phase === "done" && (total - structured) > 0 && (
              <div style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>⚑ {total - structured} row{total - structured !== 1 ? "s" : ""} flagged</div>
            )}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                  {["#", "Raw Title",
                    ...(phase === "previewing" ? ["Clean Title (editable)"] : []),
                    ...(phase === "done" ? ["Clean Title","Functional Area","Seniority","Confidence","Status"] : [])
                  ].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 16px", color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(phase === "done"
                  ? results
                  : phase === "previewing"
                  ? cleanPreviews.map((p, i) => ({ id: i + 1, raw: p.raw, clean: p.clean, original: p.original }))
                  : parsedRows.slice(0, 12).map((r, i) => ({ id: i + 1, raw: r[colMap.rawTitle] || "(empty)" }))
                ).map((row, i) => {
                  const isOOS = phase === "done" && row.domain === "Other/Noise";
                  const needsRev = phase === "done" && row.needsReview;
                  const autoCleaned = phase === "previewing" && row.raw !== row.original;
                  const manualEdited = phase === "previewing" && row.clean !== row.original;
                  const rowBg = isOOS ? C.redLight : needsRev ? C.amberLight : manualEdited ? "#fffbeb" : autoCleaned ? C.accentLight : i % 2 === 0 ? C.card : C.bg;
                  return (
                    <tr key={row.id || i} style={{ borderBottom: `1px solid ${C.border}`, background: rowBg }}>
                      <td style={{ padding: "10px 16px", color: C.textMuted, fontSize: 12 }}>{row.id || i + 1}</td>
                      <td style={{ padding: "10px 16px", color: C.textMuted, maxWidth: 220, fontFamily: "monospace", fontSize: 12 }}>{row.raw}</td>
                      {phase === "previewing" && (
                        <td style={{ padding: "6px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              value={row.clean}
                              onChange={e => updateCleanPreview(i, e.target.value)}
                              style={{ flex: 1, fontFamily: "monospace", fontSize: 12, padding: "5px 8px", borderRadius: 6, border: `1.5px solid ${manualEdited ? C.amberBorder : autoCleaned ? C.accentBorder : C.border}`, background: "transparent", color: C.text, outline: "none" }}
                            />
                            {(autoCleaned || manualEdited) && (
                              <button onClick={() => resetCleanPreview(i)} title="Reset to auto-cleaned"
                                style={{ padding: "4px 7px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", fontSize: 12, color: C.textMuted, lineHeight: 1 }}>
                                ↺
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                      {phase === "done" && <>
                        <td style={{ padding: "10px 16px", fontWeight: 600, color: C.text }}>{row.cleanTitle}</td>
                        <td style={{ padding: "10px 16px" }}><Badge tone={domainTone(row.domain)} size="sm">{row.domain}</Badge></td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: C.textMuted }}>{row.seniority}</td>
                        <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 13, color: row.confidence >= 80 ? C.green : row.confidence >= 60 ? C.amber : C.red }}>
                          {row.confidence}%
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {isOOS
                            ? <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>✗ Out of scope</span>
                            : needsRev
                            ? <span style={{ fontSize: 11, fontWeight: 600, color: C.amber }}>⚑ Review</span>
                            : <span style={{ fontSize: 11, color: C.green }}>✓ Structured</span>}
                        </td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Export bar */}
        {phase === "done" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, marginRight: 4 }}>EXPORT AS</div>
            <button onClick={() => doDownloadCSV(results)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
              📄 CSV
            </button>
            <button onClick={() => doDownloadJSON(results)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
              {"{ }"} JSON
            </button>
            <button onClick={() => doDownloadXLSX(results)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card, fontSize: 13, cursor: "pointer", fontWeight: 600, color: C.text, fontFamily: "inherit" }}>
              📊 Excel
            </button>
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.textMuted }}>
              {total} rows · {structured} structured · {total - structured} flagged
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page 3: Skill Mapper ─────────────────────────────────────────────────────

function SkillMapper() {
  const [input, setInput]     = useState("");
  const [results, setResults] = useState([]);

  function mapSkills() {
    const phrases = input.split(/[,\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    setResults(phrases.map(phrase => {
      const match = Object.entries(SKILL_SYNONYMS).find(([k]) => phrase.includes(k) || k.includes(phrase));
      return { raw: phrase, normalized: match ? match[1] : null };
    }));
  }

  function exportResults() {
    if (!results.length) return;
    const lines = ["raw_phrase,canonical_label,matched", ...results.map(r => `"${r.raw}","${r.normalized || ""}","${r.normalized ? "Yes" : "No"}"`)] ;
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    triggerDownload(blob, "skill_mapping.csv");
  }

  const EXAMPLES = ["wms, tms, sap, erp, crm", "advanced excel, sql, kpi management, s&op", "customs clearance, incoterms, rf scanning, ohs"];

  const matched   = results.filter(r => r.normalized).length;
  const unmatched = results.filter(r => !r.normalized).length;

  return (
    <div>
      <SectionTitle children="Skill Mapper" sub="Enter inconsistent skill phrases — see how they normalize into standard canonical labels." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <FieldLabel>Raw Skill Phrases <span style={{ fontWeight: 400, color: C.textMuted }}>comma or line separated</span></FieldLabel>
          <textarea value={input} onChange={e => setInput(e.target.value)} rows={9}
            placeholder={"wms, tms, crm\nadvanced excel, sql\nkpi management, s&op\nohs, edi"}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 13 }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => { setInput(ex); setResults([]); }}
                style={{ padding: "4px 11px", borderRadius: 20, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit" }}>
                {ex.slice(0, 34)}…
              </button>
            ))}
          </div>
          <button onClick={mapSkills} disabled={!input.trim()}
            style={{ width: "100%", padding: "11px", borderRadius: 8, background: input.trim() ? C.accent : "#d1d5db", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: input.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
            Normalize Skills →
          </button>
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <FieldLabel>Normalized Output</FieldLabel>
            {results.length > 0 && (
              <button onClick={exportResults}
                style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11, cursor: "pointer", color: C.textMuted, fontFamily: "inherit", fontWeight: 600 }}>
                ⬇ Export CSV
              </button>
            )}
          </div>
          {results.length === 0
            ? <div style={{ color: C.textMuted, fontSize: 13, paddingTop: 60, textAlign: "center", opacity: 0.7 }}>Results will appear here</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map((r, i) => (
                  <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: r.normalized ? C.greenLight : C.redLight, border: `1px solid ${r.normalized ? C.greenBorder : C.redBorder}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: C.text, flexShrink: 0 }}>{r.raw}</span>
                      <span style={{ color: C.textMuted, fontSize: 11 }}>→</span>
                      {r.normalized
                        ? <Badge tone="green">{r.normalized}</Badge>
                        : <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>⚑ No match — review</span>}
                    </div>
                    {r.normalized && SKILL_DESCRIPTIONS[r.normalized] && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#166534", lineHeight: 1.6 }}>
                        {SKILL_DESCRIPTIONS[r.normalized]}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ padding: "8px 14px", borderRadius: 8, background: C.bg, fontSize: 12, color: C.textMuted, border: `1px solid ${C.border}`, marginTop: 4 }}>
                  {matched} of {results.length} phrases matched · {unmatched} flagged for review
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.accentLight, border: `1px solid ${C.accentBorder}`, fontSize: 12, color: "#1e40af", lineHeight: 1.6 }}>
                  <strong>Canonical label</strong> = the standardized output used in export files.<br />
                  <strong>Common variants</strong> like "wms software", "warehouse management system", "wms" all map to the same canonical label.
                </div>
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}

// ── Page 4: Title Cleaner ────────────────────────────────────────────────────

const TC_SAMPLES = [
  "Sr. Freight Coordinator – FCL/LCL (Auckland, NZ)",
  "Ops Mgr - 3PL Warehouse [Fixed Term]",
  "BD Executive, Last Mile & Parcel (AU)",
  "Customs Clearance Officer / Import-Export",
  "APAC Supply Chain Planner - Immediate Start",
  "Retail Health Consultant (Full Time)",
  "Warehouse Assistant – Night Shift – Casual",
  "Customer Service / Dispatch Coordinator",
];

function TitleCleaner() {
  const [manualInput, setManualInput]   = useState("");
  const [manualResult, setManualResult] = useState(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [sampleResults, setSampleResults] = useState(() =>
    TC_SAMPLES.map(raw => ({ raw, ...analyze(raw, "", "") }))
  );

  useEffect(() => {
    bulkAnalyzeViaAPI(TC_SAMPLES.map(title => ({ title, description: "", country: "" })))
      .then(res => {
        if (res) setSampleResults(TC_SAMPLES.map((raw, i) => ({ raw, ...res[i] })));
      });
  }, []);

  async function runManual() {
    if (!manualInput.trim()) return;
    setManualLoading(true);
    const apiResult = await analyzeViaAPI(manualInput.trim());
    setManualResult(apiResult ?? { ...analyze(manualInput.trim(), "", ""), source: "local" });
    setManualLoading(false);
  }

  return (
    <div>
      <SectionTitle children="Title Cleaner" sub="See how raw titles are transformed — abbreviations expanded, noise removed, location stripped." />

      {/* Manual input section */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Test Your Own Title</div>
        <div style={{ display: "flex", gap: 10 }}>
          <input value={manualInput} onChange={e => { setManualInput(e.target.value); setManualResult(null); }}
            onKeyDown={e => e.key === "Enter" && runManual()}
            placeholder="Paste any raw title and press Clean →"
            style={{ ...inputStyle, flex: 1 }} />
          <button onClick={runManual} disabled={!manualInput.trim() || manualLoading}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: manualInput.trim() ? C.accent : "#d1d5db", color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: manualInput.trim() && !manualLoading ? "pointer" : "default", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {manualLoading ? "…" : "Clean →"}
          </button>
        </div>
        {manualResult?.source === "local" && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 7, background: C.amberLight, border: `1px solid ${C.amberBorder}`, fontSize: 12, color: "#78350f" }}>
            ⚠ API unavailable — result from local classifier.
          </div>
        )}
        {manualResult && (
          <div style={{ marginTop: 16, padding: "16px 18px", borderRadius: 9, background: C.accentLight, border: `1px solid ${C.accentBorder}`, display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
            <div>
              <FieldLabel>Clean Title</FieldLabel>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>{manualResult.cleanTitle}</div>
              {manualResult.cleanTitle !== manualInput.trim() && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
                  Was: <span style={{ fontFamily: "monospace", background: C.pill, padding: "1px 5px", borderRadius: 3 }}>{manualInput}</span>
                </div>
              )}
            </div>
            <div>
              <FieldLabel>Functional Area</FieldLabel>
              <Badge tone={domainTone(manualResult.domain)}>{manualResult.domain}</Badge>
            </div>
            <div>
              <FieldLabel>Seniority</FieldLabel>
              <span style={{ fontSize: 13, color: C.textMuted }}>{manualResult.seniority}</span>
            </div>
            <div>
              <FieldLabel>Confidence</FieldLabel>
              <span style={{ fontSize: 13, fontWeight: 700, color: manualResult.confidence >= 80 ? C.green : manualResult.confidence >= 60 ? C.amber : C.red }}>
                {manualResult.confidence}%
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Sample table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <div style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>Before / After — Sample Titles</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Shows what gets cleaned from real logistics job ad titles</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
                {["Raw Title", "Clean Title", "Suggested Functional Area", "Suggested Seniority"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 18px", color: C.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleResults.map((res, i) => {
                const changed = res.cleanTitle.toLowerCase().replace(/\s/g,"") !== res.raw.toLowerCase().replace(/\s/g,"");
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : C.bg }}>
                    <td style={{ padding: "13px 18px", fontFamily: "monospace", fontSize: 12, color: "#6b1a1a", background: "#fff8f8", maxWidth: 220 }}>{res.raw}</td>
                    <td style={{ padding: "13px 18px", fontWeight: 600, color: res.domain === "Other/Noise" ? C.red : "#14532d" }}>
                      {res.cleanTitle}
                      {changed && <span style={{ display: "block", fontSize: 10, color: C.textMuted, fontWeight: 400, marginTop: 2 }}>cleaned</span>}
                    </td>
                    <td style={{ padding: "13px 18px" }}><Badge tone={domainTone(res.domain)}>{res.domain}</Badge></td>
                    <td style={{ padding: "13px 18px", fontSize: 12, color: C.textMuted }}>{res.seniority}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Page 5: Export ──────────────────────────────────────────────────────────

const DEMO_TITLES = [
  "Senior Freight Coordinator – FCL (NZ)",
  "Ops Mgr 3PL Warehouse [Contract]",
  "Retail Health Consultant",
  "Customs Clearance / Import Export Officer",
  "APAC Supply Chain Planner",
  "TMS/WMS Systems Analyst",
  "Warehouse Assistant – Night Shift",
  "Customer Service / Dispatch Coordinator",
];

const DEMO_RESULTS = DEMO_TITLES.map((raw, i) => ({ id: i + 1, raw, country: "", ...analyze(raw, "", "") }));

function ExportPage({ bulkResults }) {
  const [format, setFormat]   = useState("csv");
  const [fields, setFields]   = useState(["raw_title","clean_title","functional_area","work_nature","seniority","confidence","needs_review"]);
  const allFields = EXPORT_FIELDS;
  const toggle = f => setFields(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);

  const hasRealData = bulkResults && bulkResults.length > 0;
  const data = hasRealData ? bulkResults : DEMO_RESULTS;
  const label = hasRealData ? `${data.length} rows from Bulk Upload` : `${data.length} demo rows (upload a file in Bulk Upload to use your own data)`;

  function doDownload() {
    const filtered = data.map(r => {
      const row = buildExportRow(r);
      const out = {};
      fields.forEach(f => { out[f] = row[f]; });
      return { raw: r.raw, cleanTitle: r.cleanTitle, domain: r.domain, nature: r.nature, seniority: r.seniority, skills: r.skills, confidence: r.confidence, flags: r.flags, needsReview: r.needsReview, country: r.country, ...out };
    });
    if (format === "csv")  doDownloadCSV(data, `logistics_export_${Date.now()}.csv`);
    if (format === "json") doDownloadJSON(data, `logistics_export_${Date.now()}.json`);
    if (format === "xlsx") doDownloadXLSX(data, `logistics_export_${Date.now()}.xlsx`);
  }

  return (
    <div>
      <SectionTitle children="Export" sub="Choose your format and fields. Download a clean, structured file." />
      <div style={{ marginBottom: 16, padding: "10px 16px", background: hasRealData ? C.greenLight : C.bg, border: `1px solid ${hasRealData ? C.greenBorder : C.border}`, borderRadius: 9, fontSize: 13, color: hasRealData ? "#166534" : C.textMuted }}>
        {hasRealData ? "✓ " : "ℹ "}{label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Output Format</div>
          {[
            ["csv",  "CSV",          "Best for Excel, databases, and spreadsheets"],
            ["xlsx", "Excel (.xlsx)","Formatted spreadsheet with column headers"],
            ["json", "JSON",         "For developers and downstream integrations"],
          ].map(([val, lbl, desc]) => (
            <div key={val} onClick={() => setFormat(val)}
              style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 15px", borderRadius: 9, marginBottom: 9, border: `2px solid ${format === val ? C.accent : C.border}`, background: format === val ? C.accentLight : C.card, cursor: "pointer" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${format === val ? C.accent : C.border}`, background: format === val ? C.accent : C.card, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {format === val && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{lbl}</div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Fields to Include</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 22 }}>
            {allFields.map(f => (
              <label key={f} style={{ display: "flex", alignItems: "center", gap: 11, cursor: "pointer" }}>
                <input type="checkbox" checked={fields.includes(f)} onChange={() => toggle(f)} style={{ width: 15, height: 15, accentColor: C.accent }} />
                <span style={{ fontSize: 13, fontFamily: "monospace", color: C.text }}>{f}</span>
              </label>
            ))}
          </div>
          <div style={{ padding: "10px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 14, fontSize: 12, color: C.textMuted }}>
            {fields.length} field{fields.length !== 1 ? "s" : ""} selected · {data.length} rows
          </div>
          <button onClick={doDownload} disabled={!fields.length}
            style={{ width: "100%", padding: "12px", borderRadius: 8, background: fields.length ? C.accent : "#d1d5db", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: fields.length ? "pointer" : "default", fontFamily: "inherit" }}>
            Download {format.toUpperCase()}
          </button>
        </Card>
      </div>
    </div>
  );
}

// ── Page 6: About ────────────────────────────────────────────────────────────

function About() {
  const [showAboutFeedback, setShowAboutFeedback] = useState(false);
  return (
    <div>
      <SectionTitle children="About" sub="What this tool does, what it doesn't, and how it works." />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ fontSize: 34 }}>📦</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Logistics Title Mapper</div>
              <div style={{ fontSize: 13, color: C.textMuted, marginTop: 3 }}>Rule-based normalization tool for messy logistics job text</div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, marginBottom: 16 }}>
            Logistics Title Mapper helps recruiters, HR teams, and analysts turn messy job titles and descriptions into clean, structured, reviewable draft outputs — including cleaned titles, normalized skills, suggested role labels, and export-ready fields. When titles are ambiguous, the tool uses description context and rule-based signals to generate a suggested draft classification.
          </div>
          <div style={{ padding: "13px 18px", borderRadius: 9, background: C.accentLight, border: `1px solid ${C.accentBorder}`, fontSize: 14, color: "#1e40af", fontStyle: "italic", lineHeight: 1.6 }}>
            "Turn unstructured logistics job text into usable structured data."
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 14 }}>✓ What this tool does</div>
            {[
              "Cleans messy job titles and removes noise",
              "Normalizes inconsistent skill labels",
              "Generates suggested functional area classification",
              "Infers suggested seniority level from title text",
              "Detects suggested work nature (Management / Specialist / Operational)",
              "Flags ambiguous, low-confidence, or out-of-scope cases",
              "Uses description context when title alone is ambiguous",
              "Produces export-ready structured output (CSV, Excel, JSON)",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start" }}>
                <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
                <span style={{ lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 14 }}>✗ What this tool is NOT</div>
            {[
              "Not a market intelligence or hiring trends platform",
              "Not a job board or candidate sourcing tool",
              "Not a reporting or analytics dashboard",
              "Not a salary benchmarking tool",
              "Not a universal authoritative logistics taxonomy",
              "Not a replacement for human review on ambiguous cases",
            ].map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start" }}>
                <span style={{ color: C.red, flexShrink: 0 }}>✗</span>
                <span style={{ lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </Card>
        </div>

        <Card style={{ background: C.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>How Classification Works</div>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.85 }}>
            Classification follows a three-stage rule engine. <strong>Stage 1</strong> matches title keywords against a logistics domain taxonomy — producing 88% confidence when matched. <strong>Stage 2</strong> applies fuzzy repair rules for ambiguous or abbreviated titles — producing 74% (or 30% if outside logistics scope). <strong>Stage 3</strong> uses description text when the title alone is insufficient — producing 60–72% confidence depending on how many domain keywords appear in the description. All outputs are <strong>suggested draft classifications</strong> intended for normalization and review support, not final authoritative labels.
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Output Fields</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {[
              { f: "clean_title",      d: "Standardized title with abbreviations expanded and noise removed" },
              { f: "functional_area",  d: "Suggested logistics category (e.g. Freight Forwarding, Warehouse)" },
              { f: "work_nature",      d: "Suggested nature: Management, Specialist / Support, or Operational" },
              { f: "seniority",        d: "Suggested level from Junior / Entry to Executive / Strategic" },
              { f: "skills",           d: "Normalized skill tags mapped from title and description text" },
              { f: "confidence_score", d: "0–100 score indicating how certain the rule engine is" },
              { f: "review_flags",     d: "Flags for ambiguous, short, noisy, or out-of-scope inputs" },
            ].map(({ f, d }) => (
              <div key={f} style={{ padding: "12px 14px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: C.accent, fontWeight: 700, marginBottom: 5 }}>{f}</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>{d}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Feedback */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14, marginBottom: 3 }}>Have feedback or found an issue?</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Let us know — it helps improve the tool.</div>
          </div>
          <button
            onClick={() => setShowAboutFeedback(true)}
            style={{ padding: "10px 22px", borderRadius: 8, background: C.accent, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0, marginLeft: 20 }}>
            💬 Give Feedback
          </button>
        </div>
        {showAboutFeedback && <FeedbackModal page="about" onClose={() => setShowAboutFeedback(false)} />}

      </div>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────

const NAV = [
  { id: "analyzer", label: "Single Analyzer", icon: "🔍", component: SingleAnalyzer },
  { id: "bulk",     label: "Bulk Upload",     icon: "📂", component: BulkUpload },
  { id: "skills",   label: "Skill Mapper",    icon: "🧩", component: SkillMapper },
  { id: "titles",   label: "Title Cleaner",   icon: "✏️", component: TitleCleaner },
  { id: "export",   label: "Export",          icon: "⬇️", component: ExportPage },
  { id: "about",    label: "About",           icon: "ℹ️", component: About },
];

export default function App() {
  const [showLanding, setShowLanding]     = useState(true);
  const [page, setPage]                   = useState("analyzer");
  const [bulkResults, setBulkResults]     = useState([]);
  const [showFeedback, setShowFeedback]   = useState(false);

  function handleEnter(targetPage) {
    setShowLanding(false);
    if (targetPage) setPage(targetPage);
  }

  if (showLanding) return <LandingPage onEnter={handleEnter} />;

  const navItem = NAV.find(n => n.id === page);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif", background: C.bg }}>

      {/* Sidebar */}
      <div style={{ width: 218, background: C.sidebar, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 18px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#2d3550", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📦</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>Logistics<br />Title Mapper</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#3d4668", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Normalization Tool · v2</div>
        </div>

        <nav style={{ flex: 1, padding: "4px 10px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 11px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", background: page === n.id ? C.sidebarActive : "transparent", color: page === n.id ? "#fff" : C.sidebarText, fontSize: 13.5, fontWeight: page === n.id ? 600 : 400, marginBottom: 2, fontFamily: "inherit", transition: "background 0.12s" }}>
              <span style={{ fontSize: 15, width: 20, textAlign: "center", opacity: page === n.id ? 1 : 0.7 }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: "1px solid #232840" }}>
          <button onClick={() => setShowLanding(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#3d4668", fontFamily: "inherit", padding: 0, lineHeight: 1.8, display: "block" }}>
            ← Back to Landing Page
          </button>
          <button
            onClick={() => setShowFeedback(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#4a527a", fontFamily: "inherit", padding: 0, lineHeight: 1.8, display: "block", marginTop: 4 }}>
            💬 Give Feedback
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 38px" }}>
        {page === "bulk"   && <BulkUpload onResultsReady={setBulkResults} />}
        {page === "export" && <ExportPage bulkResults={bulkResults} />}
        {page !== "bulk" && page !== "export" && navItem && <navItem.component />}
      </div>

      {showFeedback && <FeedbackModal page={page} onClose={() => setShowFeedback(false)} />}
    </div>
  );
}
