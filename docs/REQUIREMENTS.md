# CSPC EquiHub - Requirements (Week 4 starter)

**Stakeholders:** students, faculty, employees (borrowers); equipment office / department custodians (admins); CSPC IT office; Data Privacy Officer.

## Functional requirements
| ID | Requirement |
|---|---|
| FR1 | A visitor can browse equipment grouped by department and category with image and available quantity. |
| FR2 | A visitor can search and filter by keyword, department, category and availability. |
| FR3 | A user can sign up with e-mail or CSPC Google and log in. |
| FR4 | A logged-in user can submit a borrow request only when quantity, borrow date, return date and purpose are provided. |
| FR5 | A user cannot submit or be approved for a new request while earlier equipment is not confirmed returned. |
| FR6 | A user uploads a return-proof image; an admin confirms or rejects it. |
| FR7 | A user sees notifications, profile, request history and activity logs. |
| FR8 | An admin manages categories (per department) and equipment (image, name, description, status, total / available quantity). |
| FR9 | An admin approves or declines requests and can block / unblock users. |
| FR10 | An admin dashboard summarises requests, returns, users and recent activity. |

## Non-functional requirements
| ID | Requirement | Measure |
|---|---|---|
| NFR1 | Security | All queries parameterised; no inline scripts; CSRF token on every POST; passwords hashed (bcrypt). |
| NFR2 | Privacy (RA 10173) | Only name, e-mail, ID number, department stored; privacy notice at sign-up; user can download their data. |
| NFR3 | Performance | Catalog page renders in under 2 s on a 4 Mbps connection; skeleton screen shown after 300 ms. |
| NFR4 | Accessibility | Labelled inputs, visible focus, table headers with scope, status shown as text not colour alone. |
| NFR5 | Inclusivity (GAD) | No gender field required; names up to 120 characters; optional fields marked. |

## Main use case: borrow equipment
1. User opens an equipment page and chooses **Borrow**. 2. System requires login. 3. User enters quantity, dates, purpose. 4. System validates on the server. 5. Request is stored as *pending*; admin is notified via the dashboard.
**Exceptions:** blocked user -> refusal with reason; unreturned item -> refusal with reference; stock changed -> "only N available".
