# MITEMSHUB OPPORTUNITY ENGINE — INITIAL BUILD DIRECTIVE

## 1. Your Role

Act as a senior software architect, AI systems engineer, product strategist and full-stack developer.

You are responsible for helping build **Mitemshub Opportunity Engine**, an intelligent, multi-agent opportunity discovery and business development platform.

Think like a technical co-founder. Challenge weak architectural decisions, research existing solutions before building custom ones, and prioritise practical implementation over impressive but unnecessary complexity.

Do not produce generic AI-generated interfaces or boilerplate implementations.

## 2. Product Vision

Build a platform that continuously discovers opportunities across the internet, analyses them, matches them against available capabilities and helps users convert them into actual work and revenue.

The platform must operate two separate but connected pipelines:

### A. Individual Opportunities
Discover:
- Remote and conventional employment opportunities.
- Freelance gigs and consulting engagements.
- Short-term contracts and paid assignments.
- Data analysis and financial analysis projects.
- Software development and web development projects.
- Research, writing and other relevant professional assignments.

### B. Mitemshub Business Opportunities
Discover:
- Businesses looking for web development services.
- Companies needing AI solutions and automation.
- Organisations requiring data analysis and reporting.
- Requests for software development and digital transformation.
- Consultancy engagements and commercial contracts.
- Public and private tenders.
- Emerging customer needs that could become business opportunities.

Do not merge these two pipelines into one generic opportunity category. Each must have its own identity, matching criteria, application processes and commercial considerations.

## 3. Discovery Must Go Beyond Job Boards

This is one of the most important requirements.

Do not limit discovery to LinkedIn, Indeed, Upwork, Fiverr or conventional job websites.

Investigate ways to discover opportunities through:

- GitHub and open-source communities.
- Reddit communities and discussions.
- Public posts on X.
- LinkedIn posts and company pages.
- YouTube discussions and creator communities.
- Facebook and Instagram public business content.
- TikTok public business content.
- Discord and Slack communities where access is permitted.
- Company career pages.
- Startup communities.
- Newsletters and industry publications.
- Blogs and professional forums.
- Freelance marketplaces.
- Government procurement and tender portals.
- Public requests for technical assistance.
- Other relevant internet sources you discover.

We want two discovery methods:

**Explicit opportunities:** Someone has publicly advertised a job, gig, contract, tender or request for services.

**Emerging opportunities:** Someone is discussing a business problem, operational challenge or unmet need that Mitemshub could potentially solve, even without an advertised contract.

Clearly distinguish an emerging opportunity signal from a verified job or commercial engagement. Always attempt to trace social-media discoveries back to the original organisation or opportunity source.

Respect platform APIs, terms of service, privacy requirements, access restrictions and anti-scraping rules. Do not bypass restrictions.

## 4. Research Before Building — Reuse Existing Work

Do not immediately start writing everything from scratch.

First, conduct a serious technical reconnaissance exercise.

Search GitHub, skills.sh, agent repositories, MCP directories, Reddit, technical communities and other relevant ecosystems.

Investigate existing:

- AI opportunity discovery agents.
- Job-search automation projects.
- Lead-generation systems.
- Social listening tools.
- Web search and crawling frameworks.
- Multi-agent orchestration systems.
- Browser automation tools.
- CV and proposal generation tools.
- Application tracking systems.
- Workflow automation frameworks.
- Project delivery agents.
- Billing and invoicing integrations.

Evaluate complete solutions as well as individual components.

For each promising repository or tool, examine:
1. Actual functionality.
2. Maintenance and recent development activity.
3. Licence and commercial-use permissions.
4. Dependencies and external API requirements.
5. Operating costs.
6. Security and credential management.
7. Platform access restrictions.
8. Compatibility with our architecture.
9. Whether it duplicates an existing capability.

Create a component evaluation register with these statuses:

- Discovered.
- Under evaluation.
- Tested.
- Adopted.
- Rejected.

Explain why each component is selected or rejected.

**Do not install repositories blindly. Do not introduce unnecessary dependencies. Reuse first, integrate second, build custom components only where a genuine gap exists.**

## 5. Proposed System Capabilities

The eventual platform should contain these functional areas:

1. Opportunity Discovery Engine.
2. Opportunity Classification and Verification.
3. Individual Profile and Skills Management.
4. Mitemshub Business Profile and Service Catalogue.
5. Opportunity Matching and Ranking.
6. CV and Professional Profile Generation.
7. Proposal and Cover Letter Generation.
8. Application and Lead Management.
9. Client Communication Management.
10. Project Analysis and Delivery Coordination.
11. AI Agent and Skills Integration.
12. Billing and Financial Management.
13. Analytics and Performance Reporting.

These are the intended capabilities, not instructions to build everything immediately.

## 6. AI Agent Architecture

Design a coordinated agent system rather than placing every responsibility inside one giant agent.

Potential specialised agents include:

- Opportunity Scout.
- Opportunity Qualification Agent.
- Research and Verification Agent.
- Skills Matching Agent.
- CV and Profile Agent.
- Proposal Writing Agent.
- Application Management Agent.
- Client Lead Management Agent.
- Project Analysis Agent.
- Delivery Coordination Agent.
- Finance and Billing Agent.

Investigate whether existing agent frameworks and repositories can provide these capabilities.

Do not create an agent simply because it sounds impressive. Each agent must have a defined responsibility, inputs, outputs, permissions and measurable purpose.

## 7. Important Operational Rules

- Never fabricate qualifications, certifications, employment history, experience, client engagements or portfolio projects.
- Verify eligibility requirements before presenting an opportunity as suitable.
- Never misrepresent identity, age, qualifications or business credentials.
- Respect minimum-age, legal and contractual requirements, including guardian involvement where applicable.
- Do not automatically submit applications, accept contracts, agree to prices, sign documents or make financial commitments without explicit human approval.
- Protect personal information, credentials and client information.
- Assess whether a project is realistically deliverable before recommending that it be accepted.
- Maintain a clear record of opportunity sources and AI-generated decisions.

## 8. Technical Direction

Our existing development experience includes Next.js, Supabase, GitHub and Vercel.

Treat these as preferred technologies to investigate, not unquestionable requirements.

Inspect the available workspace and existing repositories first. Identify whether any existing Mitemshub project or component can be reused.

Evaluate appropriate technologies for:
- Frontend and dashboard.
- Backend services.
- Database and authentication.
- Background jobs and scheduling.
- Agent orchestration.
- Search and web discovery.
- Browser automation.
- File storage.
- Notifications.
- Monitoring and logging.

The discovery engine must eventually support frequent automated scans, ideally every six hours, with configurable source-specific schedules.

Do not assume that long-running discovery tasks should run inside a serverless request. Evaluate dedicated background workers and appropriate job queues.

## 9. Initial MVP — What We Build First

Do not attempt to implement the entire vision in one development cycle.

The first milestone is a functional opportunity discovery foundation.

Build the following:

**A. Application Foundation**
- Clean project structure.
- Authentication and access control.
- Database architecture.
- Environment configuration.
- Logging and error handling.

**B. Two Operating Profiles**
- Individual profile.
- Mitemshub business profile.
- Separate skills, services, eligibility and matching information.

**C. Opportunity Management**
- Opportunity ingestion.
- Source attribution and original links.
- Opportunity classification.
- Duplicate detection.
- Status tracking.
- Search, filtering and sorting.

**D. Initial Discovery Integrations**
Research and integrate a small but useful selection of legally accessible discovery sources.

Support an extensible source-adapter architecture so additional sources can be introduced without rebuilding the core system.

Include manual opportunity submission as a fallback.

**E. Opportunity Intelligence**
- Categorise opportunities.
- Identify required skills and services.
- Extract deadlines and relevant conditions.
- Identify potential budget or compensation information.
- Score relevance against the appropriate profile.
- Distinguish verified opportunities from emerging signals.

**F. Dashboard**
Create a professional dashboard showing:
- Newly discovered opportunities.
- High-relevance opportunities.
- Individual opportunities.
- Mitemshub business leads.
- Emerging opportunity signals.
- Opportunities awaiting review.
- Application and lead statuses.
- Discovery source performance.

The interface should feel like a serious commercial intelligence product, not a generic AI dashboard.

Avoid unnecessary gradients, glassmorphism, neon effects and decorative interface elements. Prioritise information hierarchy, clarity, useful data visualisation and excellent usability.

## 10. Execution Instructions

Work in this sequence:

**Phase 1 — Workspace and Ecosystem Audit**
- Inspect the existing workspace and repositories.
- Identify reusable code, tools and integrations.
- Research promising existing projects.
- Document findings and technical risks.

**Phase 2 — Architecture**
- Propose the system architecture.
- Define database entities and relationships.
- Define the source-adapter interface.
- Define the two opportunity pipelines.
- Define the background discovery workflow.
- Present the implementation plan.

**Phase 3 — Initial Implementation**
After the audit and architecture are established, begin implementing the MVP foundation.

Do not stop at producing a conceptual document. We intend to build a working application.

**Phase 4 — Verification**
- Run the application.
- Test authentication and database operations.
- Test opportunity ingestion.
- Test duplicate detection.
- Test classification and matching.
- Verify source attribution.
- Test both operating profiles.
- Document outstanding issues.

## 11. Working Principles

1. Do not make major architectural assumptions without explaining them.
2. Do not install unnecessary tools or repositories.
3. Do not replace working code without a clear reason.
4. Do not hardcode secrets or API keys.
5. Do not create fake data that could be mistaken for real opportunities.
6. Do not claim an integration works until it has been tested.
7. Keep implementation modular and maintainable.
8. Document important technical decisions.
9. Build incrementally and verify each milestone.
10. Report blockers honestly and propose practical solutions.

## 12. First Deliverable

Begin by inspecting the workspace and conducting the ecosystem audit.

Return:

1. Existing workspace assessment.
2. Reusable repositories, tools, skills and integrations discovered.
3. Recommended technology stack with reasons.
4. Proposed system architecture.
5. Initial database design.
6. MVP implementation roadmap.
7. Dependencies, costs and risks.
8. The first concrete implementation tasks.

Then proceed with implementation of the initial MVP foundation.

**Final instruction:** We are building a real opportunity intelligence and business development platform for Mitemshub. Think beyond conventional job-search automation. The objective is to discover demand across the internet, identify where our capabilities can create value, and establish a reliable system for converting those opportunities into legitimate, deliverable work.

## MITEMSHUB OPPORTUNITY ENGINE — FREEBUF EXECUTION INSTRUCTIONS

You are the primary AI development agent responsible for implementing Mitemshub Opportunity Engine.

Before introducing any new technology, repository, skill, MCP server or agent framework:

1. Inspect your existing capabilities and installed integrations.
2. Inspect the project's available agent instructions and development configuration.
3. Identify existing GitHub repositories, skills and tools that can be reused.
4. Research additional open-source solutions where necessary.
5. Compare available solutions before recommending adoption.

Do not assume that installing more tools automatically improves development quality.

### Development expectations

- Think and operate like a senior software engineer.
- Use your available visual/browser capabilities when they materially help with research, development or verification.
- Inspect existing code before modifying it.
- Maintain a clear project architecture.
- Use real integrations rather than simulated functionality.
- Test important features before declaring them complete.
- Keep documentation updated.
- Explain significant architectural decisions.
- Avoid generic AI-generated UI designs.
- Do not create unnecessary agents, abstractions or dependencies.

### Research expectations

Search beyond the repositories you already know.

Investigate GitHub, skills.sh, agent skill directories, Reddit, public X discussions, technical blogs and other relevant developer communities.

Prioritise complete working solutions and proven components.

For each proposed dependency, explain:
- What it contributes.
- Why we need it.
- Whether an existing tool already performs that function.
- Its licence and commercial-use implications.
- Maintenance status.
- Dependencies and operating costs.
- Integration requirements.

### Execution discipline

Do not implement the entire platform in one uncontrolled operation.

Work in clearly defined milestones. At the end of each milestone, provide:
- What was implemented.
- Files and components created or modified.
- Tests performed and results.
- Outstanding issues.
- Next recommended milestone.

Do not fabricate test results or claim unverified functionality works.

### Immediate assignment

Start with a complete workspace, repository, skills, MCP and tool audit.

Produce the proposed architecture and MVP implementation plan before making major changes.

Once the initial plan is ready, proceed with the MVP foundation rather than endlessly researching or producing documentation.

The objective is a working product, not a collection of technical recommendations.