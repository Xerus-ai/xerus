export interface Assistant {
  id: string;
  name: string;
  description: string;
  category: string;
  avatar: string;
  tags: string[];
  isActive: boolean;
  usageCount: number;
  lastUsed?: Date;
  capabilities: string[];
  knowledge_base?: string[];
  tools?: string[];
}

export const sampleAssistants: Assistant[] = [
  {
    id: "customer-support",
    name: "Customer Support Assistant",
    description: "Designed to resolve customer issues efficiently while ensuring a positive experience. Helps diagnose problems, suggest solutions, and provide step-by-step guidance.",
    category: "Support",
    avatar: "👥",
    tags: ["customer-service", "troubleshooting", "support"],
    isActive: true,
    usageCount: 1247,
    lastUsed: new Date("2024-01-15"),
    capabilities: ["Problem Resolution", "Escalation Management", "Customer Communication"],
    knowledge_base: ["Support Documentation", "Product Knowledge", "FAQ Database"],
    tools: ["Ticket System", "Knowledge Base Search", "Customer History"]
  },
  {
    id: "it-support",
    name: "IT Support Assistant", 
    description: "Designed to help troubleshoot and resolve technical issues efficiently. Specializes in hardware, software, and network problems with systematic diagnostic approaches.",
    category: "Technical",
    avatar: "💻",
    tags: ["technical-support", "troubleshooting", "IT"],
    isActive: true,
    usageCount: 892,
    lastUsed: new Date("2024-01-14"),
    capabilities: ["System Diagnostics", "Network Troubleshooting", "Software Installation"],
    knowledge_base: ["Technical Documentation", "Error Code Database", "System Configurations"],
    tools: ["Remote Desktop", "Network Scanner", "Log Analyzer"]
  },
  {
    id: "hr-assistant",
    name: "HR Assistant",
    description: "Designed to provide guidance on HR policies, employee relations, and recruitment processes. Helps streamline HR operations and improve employee experience.",
    category: "Human Resources", 
    avatar: "👔",
    tags: ["human-resources", "policies", "recruitment"],
    isActive: true,
    usageCount: 634,
    lastUsed: new Date("2024-01-13"),
    capabilities: ["Policy Guidance", "Employee Relations", "Recruitment Support"],
    knowledge_base: ["HR Policies", "Employment Law", "Company Handbook"],
    tools: ["ATS Integration", "Policy Database", "Employee Portal"]
  },
  {
    id: "legal-assistant",
    name: "Legal Assistant",
    description: "Designed to support drafting and analyzing legal documents. Provides insights on contracts, compliance, and legal research with attention to detail.",
    category: "Legal",
    avatar: "⚖️",
    tags: ["legal", "contracts", "compliance"],
    isActive: true,
    usageCount: 445,
    lastUsed: new Date("2024-01-12"),
    capabilities: ["Document Analysis", "Contract Review", "Legal Research"],
    knowledge_base: ["Legal Precedents", "Regulatory Frameworks", "Contract Templates"],
    tools: ["Document Scanner", "Legal Database", "Compliance Checker"]
  },
  {
    id: "marketing-assistant",
    name: "Marketing Assistant",
    description: "Designed to support content creation, marketing campaign management, and brand strategy. Helps create engaging content and analyze market trends.",
    category: "Marketing",
    avatar: "📈",
    tags: ["marketing", "content", "campaigns"],
    isActive: true,
    usageCount: 756,
    lastUsed: new Date("2024-01-11"),
    capabilities: ["Content Creation", "Campaign Management", "Market Analysis"],
    knowledge_base: ["Brand Guidelines", "Market Research", "Content Library"],
    tools: ["Social Media Scheduler", "Analytics Dashboard", "Content Generator"]
  },
  {
    id: "qa-assistant", 
    name: "QA Assistant",
    description: "Create test cases, summarizing bugs and inconsistencies, and ensure comprehensive quality coverage across products and features.",
    category: "Quality Assurance",
    avatar: "🔍",
    tags: ["quality-assurance", "testing", "bugs"],
    isActive: true,
    usageCount: 398,
    lastUsed: new Date("2024-01-10"),
    capabilities: ["Test Case Generation", "Bug Analysis", "Quality Metrics"],
    knowledge_base: ["Testing Protocols", "Bug Database", "Quality Standards"],
    tools: ["Test Management", "Bug Tracker", "Automated Testing"]
  },
  {
    id: "product-assistant",
    name: "Product Information Assistant",
    description: "Designed to support product documentation, feature analysis, and product strategy. Helps maintain product knowledge and specifications.",
    category: "Product Management", 
    avatar: "📦",
    tags: ["product-management", "documentation", "features"],
    isActive: true,
    usageCount: 523,
    lastUsed: new Date("2024-01-09"),
    capabilities: ["Product Documentation", "Feature Analysis", "Specification Management"],
    knowledge_base: ["Product Catalog", "Feature Documentation", "Technical Specifications"],
    tools: ["Product Database", "Feature Tracker", "Documentation Tools"]
  },
  {
    id: "qc-assistant",
    name: "QC Assistant",
    description: "Create test cases, summarizing bugs and inconsistencies, and ensure comprehensive quality control across all processes and deliverables.",
    category: "Quality Control",
    avatar: "✅",
    tags: ["quality-control", "testing", "validation"],
    isActive: false,
    usageCount: 234,
    lastUsed: new Date("2024-01-08"),
    capabilities: ["Quality Control", "Process Validation", "Standards Compliance"],
    knowledge_base: ["QC Procedures", "Quality Standards", "Compliance Requirements"],
    tools: ["Quality Checker", "Compliance Monitor", "Standards Database"]
  },
  {
    id: "sales-assistant",
    name: "Sales Assistant", 
    description: "Designed to support sales processes, lead management, and customer relationship building. Helps optimize sales strategies and close deals effectively.",
    category: "Sales",
    avatar: "💼",
    tags: ["sales", "leads", "crm"],
    isActive: true,
    usageCount: 867,
    lastUsed: new Date("2024-01-07"),
    capabilities: ["Lead Management", "Sales Strategy", "Customer Relations"],
    knowledge_base: ["Sales Playbooks", "Customer Data", "Product Information"],
    tools: ["CRM Integration", "Lead Tracker", "Sales Analytics"]
  }
];

export const assistantCategories = [
  "All",
  "Support", 
  "Technical",
  "Human Resources",
  "Legal",
  "Marketing", 
  "Quality Assurance",
  "Product Management",
  "Quality Control",
  "Sales"
]; 