# **CROPSY**

## **Software Requirements Specification (SRS), User Stories & System Analysis**

**Project Name:** CROPSY  
**Project Category:** Agricultural Technology / Multi-Vendor Marketplace / Supply Chain Management  
**Project Type:** Cross-Platform Digital Ecosystem  
**Target Market:** Bangladesh  
**Platforms:** Web Application, Android Application, iOS Application  
**Document Version:** 1.0  
**Document Status:** Initial Requirements Baseline

**Project Tagline:** Empower Farmers. Transform Markets.

---

# **1\. Executive Summary**

CROPSY is a farmer-centric, AI-powered agricultural marketplace and supply chain management ecosystem designed to modernize agricultural trading in Bangladesh.

The platform aims to connect farmers directly with wholesalers, retailers, restaurants, institutional buyers, and consumers through a transparent digital marketplace.

Traditional agricultural supply chains often involve multiple intermediaries, fragmented market information, limited price transparency, inefficient logistics, and unequal bargaining power. These problems can reduce farmers' earnings while increasing procurement costs for buyers and final consumers.

CROPSY addresses these challenges by introducing a unified digital ecosystem that enables:

* Direct farmer-to-buyer trading.  
* Competitive bidding and transparent price discovery.  
* Agricultural product listing and inventory management.  
* Real-time market price intelligence.  
* AI-powered price and demand forecasting.  
* Intelligent farmer-buyer matching.  
* Digital payments and financial transaction tracking.  
* Agricultural logistics and transportation management.  
* Product quality inspection and traceability.  
* Warehouse and collection center management.  
* Data-driven market monitoring and analytics.

CROPSY will operate through three interconnected client applications:

1. CROPSY Web Platform.  
2. CROPSY Android Application.  
3. CROPSY iOS Application.

All applications will use a shared backend, centralized database, authentication system, business logic, and AI intelligence services.

The primary objective is not to eliminate every intermediary regardless of their economic role, but to reduce unnecessary intermediation, increase competition, improve transparency, and strengthen farmers' ability to negotiate fair prices.

---

# **2\. Problem Statement**

## **2.1 Existing Problems in Bangladesh's Agricultural Market**

### **P-01: Excessive Intermediation**

Farmers often depend on several intermediaries to reach wholesale and retail markets. Each additional transaction layer can increase costs and reduce the farmer's share of the final selling price.

### **P-02: Lack of Price Transparency**

Farmers may not have reliable access to current wholesale prices in different markets. Consequently, they may sell products without knowing whether a better opportunity exists elsewhere.

### **P-03: Limited Buyer Access**

Individual farmers often struggle to identify and contact multiple potential buyers, especially buyers outside their immediate locality.

### **P-04: Weak Bargaining Power**

When farmers have limited access to alternative buyers or market information, their negotiating position may become weaker.

### **P-05: Unstructured Trading**

Agricultural trading frequently relies on informal communication, verbal agreements, and fragmented transaction records.

### **P-06: Inefficient Transportation**

Individual farmers may not have enough product volume to justify transportation to distant markets. This can increase per-unit logistics costs.

### **P-07: Product Waste and Spoilage**

Perishable agricultural products may remain unsold or experience delays during collection, storage, and transportation.

### **P-08: Inconsistent Product Quality Information**

Buyers may find it difficult to assess product quality before purchasing. Farmers may also lack standardized quality grading information.

### **P-09: Limited Demand Visibility**

Farmers may make production and selling decisions without reliable information about future market demand.

### **P-10: Limited Financial Transparency**

Informal transactions can make it difficult to maintain accurate records of sales, deductions, payments, refunds, and outstanding balances.

### **P-11: Market Manipulation Risks**

Concentrated buying power, coordinated trading behavior, artificial bidding, and other potentially unfair market practices may reduce competition.

### **P-12: Limited Digital Accessibility**

Many farmers need simple Bangla interfaces, low-bandwidth experiences, mobile-friendly workflows, and assisted digital services.

---

# **3\. Proposed Solution**

CROPSY will provide a centralized agricultural trading ecosystem.

The platform will allow farmers to publish available agricultural products, receive competitive offers, compare potential buyers, negotiate prices, and manage transactions.

Buyers will be able to discover agricultural products, compare offers, submit bids, purchase products, and coordinate delivery.

AI-powered services will provide decision support through price forecasting, demand analysis, intelligent recommendations, and anomaly detection.

## **3.1 Core Solution Components**

| Component | Proposed Solution |
| ----- | ----- |
| Digital Marketplace | Direct agricultural product trading |
| Price Intelligence | Market price comparison and forecasting |
| Trading Engine | Competitive bidding and negotiation |
| Buyer Discovery | Farmer-buyer matching |
| Financial System | Digital payment and transaction ledger |
| Logistics | Transportation and delivery coordination |
| Quality Management | Product grading and inspection |
| Warehouse Management | Agricultural storage and inventory |
| AI Intelligence | Forecasting, recommendations, and anomaly detection |
| Market Analytics | Market transparency and operational reporting |

---

# **4\. Project Objectives**

## **4.1 Primary Objectives**

1. Establish a digital marketplace connecting farmers and buyers.  
2. Improve farmers' access to competitive buyers.  
3. Increase agricultural price transparency.  
4. Reduce unnecessary supply-chain costs.  
5. Introduce structured and traceable agricultural trading.  
6. Improve buyer procurement efficiency.  
7. Support collective selling by farmer groups.  
8. Improve logistics coordination.  
9. Reduce avoidable agricultural product waste.  
10. Introduce AI-based agricultural decision support.

## **4.2 Secondary Objectives**

* Encourage digital financial transactions.  
* Improve market information accessibility.  
* Support institutional agricultural procurement.  
* Improve product quality verification.  
* Establish reliable agricultural transaction records.  
* Support data-driven agricultural market analysis.  
* Provide scalable digital infrastructure for future agricultural services.

---

# **5\. Project Scope**

## **5.1 In-Scope Features**

### **Platform and User Management**

* Multi-role registration and authentication.  
* User verification.  
* Farmer and buyer profiles.  
* Role-based access control.  
* District and upazila-based location management.

### **Marketplace**

* Agricultural product listings.  
* Product categories.  
* Product images and descriptions.  
* Product availability and quantity.  
* Search and filtering.  
* Location-based product discovery.  
* Inventory management.

### **Trading**

* Fixed-price selling.  
* Competitive bidding.  
* Reverse offers and counteroffers.  
* Auction management.  
* Real-time bid updates.  
* Collective farmer selling.

### **Order and Payment**

* Order creation.  
* Order tracking.  
* Payment processing.  
* Transaction history.  
* Refund management.  
* Financial ledger.  
* Payment reconciliation.

### **Supply Chain**

* Transporter management.  
* Vehicle management.  
* Collection centers.  
* Warehouse management.  
* Quality inspection.  
* Weight verification.  
* Delivery tracking.  
* QR-based traceability.

### **AI**

* Price forecasting.  
* Demand forecasting.  
* Buyer matching.  
* Farmer recommendations.  
* Trading anomaly detection.  
* Preliminary visual quality assessment.  
* Bangla AI assistant.  
* Market intelligence reports.

### **Administration**

* User verification.  
* Marketplace moderation.  
* Transaction monitoring.  
* Dispute resolution.  
* System configuration.  
* Analytics and reporting.

## **5.2 Out-of-Scope for Initial MVP**

The following features are not mandatory for the first public release:

* Fully automated agricultural production planning.  
* Autonomous purchasing or selling.  
* Fully automated legal enforcement against market manipulation.  
* Blockchain-based financial infrastructure.  
* Automated pesticide residue detection using ordinary product images.  
* National-scale physical warehouse infrastructure owned by CROPSY.  
* Guaranteed future agricultural price predictions.

These features may be evaluated for future versions.

---

# **6\. Stakeholder Analysis**

| Stakeholder | Interest | Responsibility |
| ----- | ----- | ----- |
| Farmers | Fair prices and market access | Product supply and trading |
| Farmer Groups | Collective selling | Product aggregation |
| Wholesalers | Bulk procurement | Large-volume purchasing |
| Retailers | Regular product supply | Retail procurement |
| Restaurants | Fresh agricultural products | Commercial purchasing |
| Institutions | Reliable procurement | Institutional orders |
| Consumers | Product availability and fair prices | Retail purchases |
| Transporters | Delivery opportunities | Transportation |
| Quality Inspectors | Quality verification | Product inspection |
| Warehouse Managers | Storage operations | Inventory management |
| Administrators | Platform governance | System management |
| Government / Data Partners | Market information | Data provision where agreements exist |

---

# **7\. User Roles and Permissions**

## **7.1 Super Administrator**

The Super Administrator manages the entire CROPSY ecosystem.

Permissions:

* Manage all users.  
* Manage administrator accounts.  
* Configure platform settings.  
* Manage roles and permissions.  
* Monitor transactions.  
* View system-wide analytics.  
* Review security alerts.  
* Configure commission and service fees.  
* Manage marketplace policies.  
* Access audit records.

## **7.2 District Administrator**

Permissions:

* Monitor district-level users.  
* Verify local farmers and buyers, where authorized.  
* Monitor local product listings.  
* Review district market reports.  
* Coordinate collection centers.  
* Escalate disputes.

## **7.3 Upazila Coordinator**

Permissions:

* Assist farmer registration.  
* Verify submitted farmer information within assigned authority.  
* Support local market operations.  
* Coordinate local collection activities.  
* Report operational problems.

## **7.4 Farmer**

Permissions:

* Register and manage profile.  
* Add farm and location information.  
* Create product listings.  
* Upload product images.  
* Specify quantity and expected price.  
* Receive buyer offers.  
* Participate in negotiations.  
* Accept or reject offers.  
* Join collective selling groups.  
* Manage orders.  
* Track shipments.  
* View payments and financial history.  
* Access market intelligence.  
* Receive AI recommendations.  
* Submit complaints.

## **7.5 Farmer Group Leader**

Permissions:

* Create farmer groups.  
* Invite verified farmers.  
* Coordinate collective product listings.  
* Aggregate available quantities.  
* Manage group participation.  
* View group-level sales reports.  
* Coordinate shared transportation.

## **7.6 Wholesaler**

Permissions:

* Create buyer profiles.  
* Browse agricultural products.  
* Search by location and quantity.  
* Place bids.  
* Submit purchase offers.  
* Negotiate prices.  
* Create bulk orders.  
* Manage procurement.  
* Track deliveries.  
* Review transaction history.

## **7.7 Retailer**

Permissions:

* Browse products.  
* Purchase agricultural products.  
* Submit purchase offers.  
* Manage regular procurement.  
* Track orders.  
* View purchase records.

## **7.8 Restaurant / Institutional Buyer**

Permissions:

* Create business profiles.  
* Publish procurement requirements.  
* Specify required products and quantities.  
* Set delivery schedules.  
* Receive supplier recommendations.  
* Submit purchase orders.  
* Track deliveries.  
* Manage procurement records.

## **7.9 Consumer**

Permissions:

* Browse retail products.  
* Search agricultural products.  
* Place orders.  
* Make payments.  
* Track deliveries.  
* Submit product reviews.  
* Raise complaints.

## **7.10 Transporter**

Permissions:

* Register vehicles.  
* Manage delivery availability.  
* Receive transport requests.  
* Accept or reject assignments.  
* Update pickup and delivery status.  
* Upload delivery evidence.  
* View transportation earnings.

## **7.11 Quality Inspector**

Permissions:

* Receive inspection assignments.  
* Verify product quantity.  
* Record product quality.  
* Upload inspection images.  
* Assign authorized product grades.  
* Submit inspection reports.

## **7.12 Warehouse Manager**

Permissions:

* Manage warehouse details.  
* Record incoming stock.  
* Track outgoing stock.  
* Manage storage capacity.  
* Record product condition.  
* Report stock discrepancies.

## **7.13 Payment Officer**

Permissions:

* Review transaction records.  
* Monitor payment exceptions.  
* Reconcile payments.  
* Review refund requests.  
* Generate financial reports.

Sensitive payment actions must follow separation of duties and approval rules.

## **7.14 Dispute Officer**

Permissions:

* Review complaints.  
* Examine transaction evidence.  
* Request additional information.  
* Coordinate mediation.  
* Record dispute outcomes.  
* Escalate unresolved matters.

---

# **8\. Functional Requirements**

Functional requirements define what CROPSY must do.

## **FR-01: User Registration and Authentication**

**Description:** The system shall support secure registration and authentication for different user roles.

Requirements:

* FR-01.1: Users shall register using supported contact information.  
* FR-01.2: Users shall verify their contact information.  
* FR-01.3: Users shall select an appropriate account type.  
* FR-01.4: Farmers shall submit relevant identity and farm information.  
* FR-01.5: Buyers shall submit individual or business information as applicable.  
* FR-01.6: Users shall be able to log in and log out.  
* FR-01.7: Users shall be able to reset forgotten passwords.  
* FR-01.8: The system shall enforce role-based access control.  
* FR-01.9: The system shall support secure session management.  
* FR-01.10: Administrators shall be able to suspend accounts according to policy.

## **FR-02: Farmer Management**

* FR-02.1: Farmers shall create profiles.  
* FR-02.2: Farmers shall add farm locations.  
* FR-02.3: Farmers shall specify available crop types.  
* FR-02.4: Farmers shall provide production information.  
* FR-02.5: Farmers shall update their profile.  
* FR-02.6: Farmers shall view verification status.  
* FR-02.7: Farmers shall manage farm-related information.  
* FR-02.8: Farmers shall view personal sales performance.

## **FR-03: Buyer Management**

* FR-03.1: Buyers shall create buyer profiles.  
* FR-03.2: Buyers shall specify purchasing categories.  
* FR-03.3: Buyers shall specify preferred locations.  
* FR-03.4: Buyers shall specify required quantities.  
* FR-03.5: Buyers shall manage procurement requirements.  
* FR-03.6: Buyers shall view purchase history.  
* FR-03.7: Business buyers shall submit required verification documents.

## **FR-04: Agricultural Product Management**

* FR-04.1: Farmers shall create product listings.  
* FR-04.2: Farmers shall select product categories.  
* FR-04.3: Farmers shall specify available quantities.  
* FR-04.4: Farmers shall specify measurement units.  
* FR-04.5: Farmers shall upload product images.  
* FR-04.6: Farmers shall specify harvest or availability dates.  
* FR-04.7: Farmers shall specify expected prices.  
* FR-04.8: Farmers shall update or deactivate eligible listings.  
* FR-04.9: The system shall maintain listing status history.  
* FR-04.10: The system shall prevent sales exceeding verified available inventory.

## **FR-05: Marketplace Discovery**

* FR-05.1: Buyers shall browse agricultural products.  
* FR-05.2: Buyers shall search by product name.  
* FR-05.3: Buyers shall filter by category.  
* FR-05.4: Buyers shall filter by location.  
* FR-05.5: Buyers shall filter by price range.  
* FR-05.6: Buyers shall filter by quantity.  
* FR-05.7: Buyers shall filter by product grade.  
* FR-05.8: Buyers shall view seller information according to privacy policy.  
* FR-05.9: Buyers shall view product availability.  
* FR-05.10: The system shall support paginated search results.

## **FR-06: Price Intelligence**

* FR-06.1: Users shall view available market prices.  
* FR-06.2: Users shall compare prices across supported markets.  
* FR-06.3: Users shall view historical price trends.  
* FR-06.4: The system shall identify the price source.  
* FR-06.5: The system shall display the collection date and time.  
* FR-06.6: The system shall distinguish official market data from platform transaction data.  
* FR-06.7: The system shall display data freshness and coverage limitations.  
* FR-06.8: The system may provide estimated price ranges when sufficient validated data exists.

## **FR-07: Auction and Competitive Trading**

* FR-07.1: Eligible farmers shall create auctions.  
* FR-07.2: Farmers shall define auction quantities.  
* FR-07.3: Farmers shall define auction starting prices.  
* FR-07.4: Farmers shall define auction closing times.  
* FR-07.5: Eligible buyers shall submit bids.  
* FR-07.6: The system shall validate each bid.  
* FR-07.7: The system shall prevent invalid or duplicate bid submissions.  
* FR-07.8: The system shall update live bid information.  
* FR-07.9: Buyers shall view their own bid history.  
* FR-07.10: Farmers shall review eligible offers.  
* FR-07.11: Farmers shall accept or reject eligible offers.  
* FR-07.12: The system shall record bid history.  
* FR-07.13: The system shall prevent bids after auction closure.  
* FR-07.14: The system shall apply predefined auction closing rules.

## **FR-08: Negotiation and Offers**

* FR-08.1: Buyers shall submit direct offers.  
* FR-08.2: Farmers shall accept or reject offers.  
* FR-08.3: Farmers and buyers shall exchange counteroffers.  
* FR-08.4: The system shall record offer history.  
* FR-08.5: The system shall notify participants of offer updates.  
* FR-08.6: The system shall enforce offer expiration rules.

## **FR-09: Collective Selling**

* FR-09.1: Verified farmers shall create or join groups.  
* FR-09.2: Group leaders shall invite eligible members.  
* FR-09.3: Farmers shall submit available quantities.  
* FR-09.4: The system shall calculate aggregate available quantities.  
* FR-09.5: Groups shall create collective product listings.  
* FR-09.6: Group transactions shall record individual contribution quantities.  
* FR-09.7: The system shall calculate member-level settlement records.  
* FR-09.8: The system shall maintain group activity history.

## **FR-10: Order Management**

* FR-10.1: Buyers shall create orders from accepted offers or approved purchase flows.  
* FR-10.2: The system shall generate unique order identifiers.  
* FR-10.3: The system shall reserve eligible inventory.  
* FR-10.4: Buyers shall view order status.  
* FR-10.5: Farmers shall view incoming orders.  
* FR-10.6: Authorized users shall update permitted order states.  
* FR-10.7: The system shall maintain order status history.  
* FR-10.8: The system shall support eligible cancellation requests.  
* FR-10.9: The system shall support partial fulfillment where enabled.  
* FR-10.10: The system shall support order completion and settlement.

## **FR-11: Payment Management**

* FR-11.1: The system shall integrate approved payment providers.  
* FR-11.2: Buyers shall initiate supported payment methods.  
* FR-11.3: The system shall verify payment provider responses.  
* FR-11.4: The system shall maintain payment status.  
* FR-11.5: The system shall prevent duplicate payment processing.  
* FR-11.6: The system shall record payment references.  
* FR-11.7: The system shall support refunds under defined policies.  
* FR-11.8: The system shall provide transaction receipts.  
* FR-11.9: The system shall maintain a financial ledger.  
* FR-11.10: The system shall support payment reconciliation.

## **FR-12: Financial Ledger**

* FR-12.1: Financial transactions shall be recorded using double-entry accounting principles.  
* FR-12.2: Every posted journal entry shall balance.  
* FR-12.3: Posted financial entries shall not be silently overwritten.  
* FR-12.4: Corrections shall be represented through reversal or adjustment entries.  
* FR-12.5: The system shall maintain transaction references.  
* FR-12.6: The system shall distinguish pending, settled, failed, and refunded amounts.  
* FR-12.7: Authorized financial personnel shall generate reconciliation reports.

## **FR-13: Logistics and Transportation**

* FR-13.1: Transporters shall register vehicles.  
* FR-13.2: Farmers or authorized coordinators shall request transportation.  
* FR-13.3: The system shall support transporter assignment.  
* FR-13.4: Transporters shall update pickup status.  
* FR-13.5: Transporters shall update delivery status.  
* FR-13.6: Buyers shall track eligible shipments.  
* FR-13.7: The system shall record delivery evidence.  
* FR-13.8: The system shall support transportation cost estimates.  
* FR-13.9: The system may consolidate nearby shipments.  
* FR-13.10: The system shall record delivery exceptions.

## **FR-14: Quality and Inspection**

* FR-14.1: Authorized inspectors shall create inspection records.  
* FR-14.2: Inspectors shall record product grade.  
* FR-14.3: Inspectors shall record verified weight.  
* FR-14.4: Inspectors shall upload inspection images.  
* FR-14.5: The system shall record inspection time and inspector identity.  
* FR-14.6: Buyers shall view applicable inspection reports.  
* FR-14.7: The system shall maintain inspection history.  
* FR-14.8: AI-based visual grading shall be labeled as preliminary unless independently verified.

## **FR-15: Warehouse and Collection Center Management**

* FR-15.1: Authorized managers shall register collection centers.  
* FR-15.2: Managers shall register warehouses.  
* FR-15.3: The system shall maintain storage capacity.  
* FR-15.4: Managers shall record incoming inventory.  
* FR-15.5: Managers shall record outgoing inventory.  
* FR-15.6: The system shall maintain stock movement history.  
* FR-15.7: The system shall support product storage-condition records.  
* FR-15.8: The system shall generate warehouse reports.

## **FR-16: QR Traceability**

* FR-16.1: The system shall generate unique traceability identifiers.  
* FR-16.2: Authorized users shall associate QR identifiers with eligible products or batches.  
* FR-16.3: Scanning shall display permitted product information.  
* FR-16.4: The system shall maintain traceability events.  
* FR-16.5: Sensitive farmer or buyer information shall not be exposed through public QR pages.

## **FR-17: Communication and Notifications**

* FR-17.1: The system shall support buyer-farmer communication.  
* FR-17.2: Users shall receive relevant notifications.  
* FR-17.3: The system shall support order notifications.  
* FR-17.4: The system shall support bid notifications.  
* FR-17.5: The system shall support payment notifications.  
* FR-17.6: The system shall support delivery notifications.  
* FR-17.7: Users shall manage notification preferences.  
* FR-17.8: Administrators shall publish platform announcements.  
* FR-17.9: The system shall maintain notification delivery status where supported.

## **FR-18: Dispute Resolution**

* FR-18.1: Users shall submit complaints.  
* FR-18.2: Users shall attach relevant evidence.  
* FR-18.3: Dispute officers shall review submitted complaints.  
* FR-18.4: The system shall maintain dispute status.  
* FR-18.5: Authorized officers shall record decisions.  
* FR-18.6: Users shall receive dispute updates.  
* FR-18.7: The system shall support escalation and appeal procedures.

## **FR-19: AI Intelligence**

* FR-19.1: The system may forecast agricultural market prices.  
* FR-19.2: The system may forecast product demand.  
* FR-19.3: The system may recommend potential buyers.  
* FR-19.4: The system may recommend suitable selling opportunities.  
* FR-19.5: The system may identify unusual trading patterns.  
* FR-19.6: The system may assess visible product quality using images.  
* FR-19.7: The system may provide a Bangla agricultural assistant.  
* FR-19.8: The system may identify possible spoilage risks using validated operational data.  
* FR-19.9: The system shall display relevant prediction timestamps and uncertainty.  
* FR-19.10: The system shall not execute financial transactions solely on AI recommendations.  
* FR-19.11: Risk alerts shall be subject to authorized human review.  
* FR-19.12: AI recommendations shall not be presented as guaranteed outcomes.

## **FR-20: Analytics and Administration**

* FR-20.1: Administrators shall view platform activity.  
* FR-20.2: Administrators shall view user statistics.  
* FR-20.3: Administrators shall view product and order statistics.  
* FR-20.4: Administrators shall view transaction summaries.  
* FR-20.5: Administrators shall view district-level market information.  
* FR-20.6: Administrators shall review suspicious trading alerts.  
* FR-20.7: Administrators shall generate reports.  
* FR-20.8: Administrators shall manage platform categories and configuration.  
* FR-20.9: Sensitive administrative actions shall be audited.

---

# **9\. Complete User Stories**

User stories describe system requirements from the perspective of users.

Format:

**As a \[user\], I want \[capability\], so that \[benefit\].**

Each story includes acceptance criteria to guide implementation and testing.

## **EPIC 01: Authentication and Account Management**

### **US-001: User Registration**

As a new user, I want to register an account so that I can access CROPSY.

Acceptance Criteria:

* Given that I provide valid registration information, when I submit the form, then the system creates an account.  
* The system shall verify my supported contact method.  
* The system shall prevent duplicate accounts under applicable identity rules.  
* The system shall display appropriate validation messages.

### **US-002: Role Selection**

As a new user, I want to select my account type so that I receive the correct platform experience.

Acceptance Criteria:

* The system shall display supported account types.  
* Each account type shall have relevant registration fields.  
* Unauthorized users shall not assign themselves privileged administrative roles.

### **US-003: Secure Login**

As a registered user, I want to log in securely so that I can access my account.

Acceptance Criteria:

* Valid credentials shall grant access.  
* Invalid credentials shall be rejected.  
* Authentication failures shall be rate-limited.  
* Sessions shall be managed securely.

### **US-004: Password Recovery**

As a user, I want to recover my forgotten password so that I can regain account access.

Acceptance Criteria:

* The system shall verify account ownership.  
* Password reset tokens shall expire.  
* Reset tokens shall be single-use.

### **US-005: Profile Management**

As a user, I want to update my profile so that my information remains accurate.

Acceptance Criteria:

* Users shall update permitted profile fields.  
* Sensitive changes may require re-verification.  
* The system shall record relevant changes.

## **EPIC 02: Farmer Management**

### **US-006: Farmer Profile**

As a farmer, I want to create a farmer profile so that buyers can understand my agricultural activities.

Acceptance Criteria:

* I can provide my name and contact details.  
* I can specify my district and upazila.  
* I can provide farm-related information.  
* My verification status shall be visible to me.

### **US-007: Farm Location**

As a farmer, I want to add my farm location so that nearby buyers can discover my products.

Acceptance Criteria:

* I can select an administrative location.  
* I can optionally provide GPS coordinates.  
* The system shall use authorized location data for discovery.  
* My exact location shall not be publicly exposed without permission.

### **US-008: Farmer Verification**

As a farmer, I want to submit verification information so that buyers can trust my account.

Acceptance Criteria:

* I can submit requested information.  
* I can see pending, approved, or rejected status.  
* Authorized administrators can review the application.  
* Rejection reasons shall be recorded according to policy.

### **US-009: Sales History**

As a farmer, I want to view my sales history so that I can understand my trading performance.

Acceptance Criteria:

* The system shall display completed and pending transactions separately.  
* I can filter by date and product.  
* Financial figures shall correspond to verified transaction records.

## **EPIC 03: Buyer Management**

### **US-010: Buyer Registration**

As a buyer, I want to register as a wholesaler, retailer, restaurant, or institutional buyer so that I can purchase agricultural products.

Acceptance Criteria:

* The system shall support applicable buyer types.  
* Business users may submit required verification details.  
* Buyer accounts shall have relevant procurement permissions.

### **US-011: Procurement Requirements**

As an institutional buyer, I want to publish procurement requirements so that relevant farmers can offer products.

Acceptance Criteria:

* I can specify product type.  
* I can specify quantity.  
* I can specify preferred grade.  
* I can specify delivery location and required date.  
* Eligible farmers can discover the requirement.

## **EPIC 04: Product Marketplace**

### **US-012: Create Product Listing**

As a farmer, I want to list my agricultural products so that potential buyers can purchase them.

Acceptance Criteria:

* I can specify product name and category.  
* I can specify available quantity and unit.  
* I can upload images.  
* I can specify expected price.  
* The system shall validate listing information.  
* The listing shall be published according to moderation rules.

### **US-013: Update Product Listing**

As a farmer, I want to update an eligible listing so that buyers receive accurate information.

Acceptance Criteria:

* I can edit permitted fields.  
* The system shall record changes.  
* Critical changes may require notification to interested buyers.  
* Existing accepted orders shall not be silently modified.

### **US-014: Product Search**

As a buyer, I want to search agricultural products so that I can find suitable suppliers.

Acceptance Criteria:

* I can search by product name.  
* I can filter by location.  
* I can filter by price and quantity.  
* Search results shall support pagination.  
* Unavailable products shall be clearly identified.

### **US-015: Product Comparison**

As a buyer, I want to compare products from different farmers so that I can make an informed purchasing decision.

Acceptance Criteria:

* I can compare relevant prices.  
* I can compare available quantities.  
* I can compare product grades where verified.  
* I can compare delivery terms.  
* I can view seller information permitted by privacy policy.

## **EPIC 05: Market Price Intelligence**

### **US-016: View Market Prices**

As a farmer, I want to view agricultural market prices so that I can understand current market conditions.

Acceptance Criteria:

* I can select a product.  
* I can select a market or location.  
* The system shall display available prices.  
* Each price shall include source and timestamp.  
* Stale or incomplete data shall be identified.

### **US-017: Compare Market Prices**

As a farmer, I want to compare prices across markets so that I can evaluate alternative selling opportunities.

Acceptance Criteria:

* The system shall display available market comparisons.  
* It shall distinguish observed prices from predictions.  
* It shall not imply that the highest listed price guarantees the highest net earnings.

## **EPIC 06: Auction and Trading**

### **US-018: Create Auction**

As a farmer, I want to create an auction so that multiple buyers can compete for my products.

Acceptance Criteria:

* I can specify quantity.  
* I can specify starting price.  
* I can specify minimum bid increment where applicable.  
* I can specify auction duration.  
* The system shall validate product availability.  
* The system shall record auction rules.

### **US-019: Place Bid**

As a buyer, I want to place a bid so that I can compete to purchase agricultural products.

Acceptance Criteria:

* Only eligible buyers can bid.  
* Bids shall satisfy auction rules.  
* Bids after closing shall be rejected.  
* Accepted bids shall be recorded.  
* Concurrent bids shall be processed safely.

### **US-020: View Live Auction**

As a buyer, I want to see live auction updates so that I can make timely decisions.

Acceptance Criteria:

* Valid new bids shall be published.  
* The displayed bid shall be consistent with the authoritative auction state.  
* Reconnection shall restore current auction information.

### **US-021: Accept Offer**

As a farmer, I want to accept a buyer's offer so that I can proceed with a sale.

Acceptance Criteria:

* The offer must be valid and eligible.  
* The farmer must explicitly confirm acceptance.  
* The system shall record acceptance.  
* The relevant trading workflow shall proceed to order creation.

### **US-022: Negotiate Price**

As a farmer or buyer, I want to submit counteroffers so that we can agree on suitable trading terms.

Acceptance Criteria:

* Each offer shall have a unique identifier.  
* Offer history shall be retained.  
* Expired offers shall not be accepted.  
* Both participants shall receive updates.

## **EPIC 07: Collective Selling**

### **US-023: Create Farmer Group**

As a farmer, I want to create a farmer group so that multiple farmers can sell products collectively.

Acceptance Criteria:

* Eligible users can create groups.  
* Groups shall have unique identifiers.  
* Group membership shall require acceptance.  
* Group leaders shall have limited management permissions.

### **US-024: Aggregate Products**

As a group leader, I want to aggregate member product quantities so that we can offer larger quantities to buyers.

Acceptance Criteria:

* Members can submit available quantities.  
* The system shall calculate aggregate quantity.  
* Contributions shall remain individually traceable.  
* Members shall confirm their committed quantities.

### **US-025: Group Settlement**

As a farmer group member, I want to see my individual settlement so that I understand my earnings.

Acceptance Criteria:

* Individual contribution quantity shall be recorded.  
* Applicable deductions shall be transparent.  
* The system shall maintain member-level settlement records.  
* The group leader shall not be able to silently change completed financial entries.

## **EPIC 08: Orders and Payments**

### **US-026: Create Order**

As a buyer, I want to create an order from an accepted offer so that the purchase becomes formally recorded.

Acceptance Criteria:

* The accepted offer shall be valid.  
* The system shall verify inventory.  
* The system shall generate an order number.  
* The order shall contain agreed commercial terms.

### **US-027: Track Order**

As a farmer or buyer, I want to track my order so that I understand its current status.

Acceptance Criteria:

* The system shall show permitted order states.  
* Each status change shall be recorded.  
* Relevant participants shall receive notifications.

### **US-028: Make Payment**

As a buyer, I want to pay through supported payment methods so that I can complete my purchase.

Acceptance Criteria:

* The system shall initiate payment through an approved provider.  
* The system shall verify payment confirmation.  
* Duplicate webhook processing shall not cause duplicate settlement.  
* Payment failures shall be recorded.

### **US-029: View Earnings**

As a farmer, I want to view my earnings so that I can monitor my financial performance.

Acceptance Criteria:

* Gross sales shall be displayed.  
* Applicable fees and deductions shall be itemized.  
* Net payable amounts shall be shown.  
* Pending and settled balances shall be distinguished.

### **US-030: Request Refund**

As a buyer, I want to request a refund for an eligible transaction so that I can resolve a valid payment or order problem.

Acceptance Criteria:

* The system shall validate refund eligibility.  
* The request shall be recorded.  
* Authorized staff shall review exceptions.  
* The refund result shall be recorded.

## **EPIC 09: Logistics and Delivery**

### **US-031: Request Transportation**

As a farmer or buyer, I want to request transportation so that products can reach the buyer.

Acceptance Criteria:

* I can specify pickup and delivery locations.  
* I can specify quantity and required date.  
* The system shall show eligible transport options where available.  
* Cost estimates shall identify their assumptions.

### **US-032: Accept Delivery Assignment**

As a transporter, I want to accept a transport assignment so that I can fulfill delivery requests.

Acceptance Criteria:

* Only eligible transporters can accept.  
* The assignment shall contain pickup and delivery details.  
* Conflicting assignments shall be detected.

### **US-033: Track Delivery**

As a buyer, I want to track my shipment so that I can understand its delivery progress.

Acceptance Criteria:

* Shipment status shall be updated by authorized users.  
* Location tracking shall follow consent and privacy rules.  
* Delivery exceptions shall be recorded.

### **US-034: Confirm Delivery**

As a buyer, I want to confirm delivery so that the order can proceed to completion.

Acceptance Criteria:

* The buyer can confirm received quantity.  
* Discrepancies can be reported.  
* The system shall preserve delivery evidence.  
* Settlement shall follow the applicable completion policy.

## **EPIC 10: Quality and Warehouse**

### **US-035: Inspect Product**

As a quality inspector, I want to inspect agricultural products so that buyers receive reliable quality information.

Acceptance Criteria:

* I can record inspection results.  
* I can record verified weight.  
* I can upload supporting images.  
* The inspection shall include inspector and timestamp information.

### **US-036: Manage Warehouse**

As a warehouse manager, I want to manage stored agricultural products so that inventory remains traceable.

Acceptance Criteria:

* I can record incoming products.  
* I can record outgoing products.  
* The system shall calculate available stock.  
* Stock adjustments shall be auditable.

### **US-037: Scan Product QR**

As a buyer, I want to scan a product QR code so that I can view its permitted traceability information.

Acceptance Criteria:

* The QR code shall resolve to a unique product or batch.  
* The system shall display available traceability events.  
* Private information shall remain protected.

## **EPIC 11: Communication and Disputes**

### **US-038: Chat with Buyer or Farmer**

As a farmer or buyer, I want to communicate with the other participant so that I can clarify transaction details.

Acceptance Criteria:

* Only authorized participants can access a conversation.  
* Messages shall be associated with relevant users.  
* The system shall protect private conversations.  
* Message status shall be handled appropriately.

### **US-039: Receive Notifications**

As a user, I want to receive relevant notifications so that I do not miss important events.

Acceptance Criteria:

* I receive notifications for relevant bids, offers, orders, payments, and delivery updates.  
* I can configure supported notification preferences.  
* Failed delivery shall not silently alter the underlying business transaction.

### **US-040: Submit Dispute**

As a farmer or buyer, I want to submit a dispute so that transaction problems can be formally reviewed.

Acceptance Criteria:

* I can identify the relevant order.  
* I can explain the problem.  
* I can submit evidence.  
* I can view dispute status.  
* Authorized officers can record decisions.

## **EPIC 12: AI Intelligence**

### **US-041: Price Forecast**

As a farmer, I want to see an estimated future price range so that I can make better selling decisions.

Acceptance Criteria:

* The system shall identify the forecast horizon.  
* It shall display data freshness.  
* It shall display uncertainty or prediction intervals when validated.  
* It shall distinguish forecasts from actual observed prices.  
* It shall not guarantee future price movements.

### **US-042: Demand Forecast**

As a farmer, I want to understand expected product demand so that I can evaluate selling opportunities.

Acceptance Criteria:

* The forecast shall identify the product and location.  
* It shall identify the relevant time horizon.  
* It shall display limitations where data is insufficient.

### **US-043: Buyer Recommendation**

As a farmer, I want to receive buyer recommendations so that I can discover potential customers.

Acceptance Criteria:

* Recommendations shall consider product compatibility.  
* Recommendations shall consider location and quantity.  
* Delivery and transport cost may be included.  
* The system shall explain relevant recommendation factors.  
* The farmer shall retain final decision authority.

### **US-044: Trading Risk Alert**

As an administrator, I want to receive alerts about unusual trading patterns so that I can investigate potentially unfair activity.

Acceptance Criteria:

* The system shall identify unusual patterns.  
* The alert shall include supporting evidence and reason codes.  
* Risk scores shall not be treated as proof of misconduct.  
* Authorized personnel shall review alerts.  
* Users shall have access to appropriate appeal mechanisms.

### **US-045: Product Image Assessment**

As a farmer, I want to upload a product image for preliminary quality assessment so that I can understand visible quality characteristics.

Acceptance Criteria:

* The system shall analyze supported images.  
* It shall display only supported visual findings.  
* Uncertain assessments shall be marked as uncertain.  
* Commercial grading shall require authorized verification where applicable.

### **US-046: Bangla AI Assistant**

As a farmer, I want to ask agricultural marketplace questions in Bangla so that I can use CROPSY more easily.

Acceptance Criteria:

* The assistant shall support defined Bangla queries.  
* It shall retrieve relevant authorized platform information.  
* It shall identify unavailable information.  
* It shall not invent prices or transactions.  
* It shall not execute financial actions without explicit user confirmation.

## **EPIC 13: Administration and Market Analytics**

### **US-047: Monitor Platform Activity**

As a Super Administrator, I want to monitor platform activity so that I can manage CROPSY effectively.

Acceptance Criteria:

* I can view registered users.  
* I can view active product listings.  
* I can view order summaries.  
* I can view relevant operational metrics.  
* Sensitive information shall be permission-controlled.

### **US-048: Monitor Market Trends**

As an authorized administrator, I want to view market trends so that I can understand regional supply and demand.

Acceptance Criteria:

* I can select a product.  
* I can select a geographic area.  
* I can view supported price and supply information.  
* Data sources and timestamps shall be visible.

### **US-049: Review Risk Alerts**

As a dispute or compliance officer, I want to review suspicious trading alerts so that I can investigate potential market integrity problems.

Acceptance Criteria:

* Each alert shall have an identifier.  
* Supporting evidence shall be available to authorized reviewers.  
* Review decisions shall be recorded.  
* The system shall distinguish automated detection from verified findings.

### **US-050: Generate Reports**

As an administrator, I want to generate operational reports so that I can evaluate platform performance.

Acceptance Criteria:

* Reports shall support date and geographic filters.  
* Financial reports shall use authoritative ledger records.  
* Exported reports shall follow permission and privacy rules.

---

# **10\. Primary User Journey Analysis**

## **10.1 Farmer Journey**

1. Farmer opens CROPSY.  
2. Farmer selects Farmer Registration.  
3. Farmer enters contact and profile information.  
4. Farmer verifies contact information.  
5. Farmer submits verification information.  
6. Authorized personnel review the application.  
7. Farmer accesses the Farmer Dashboard.  
8. Farmer creates an agricultural product listing.  
9. Farmer specifies product quantity and expected price.  
10. Farmer publishes the listing.  
11. Buyer discovery and matching services identify relevant opportunities.  
12. Farmer receives buyer offers or auction bids.  
13. Farmer compares offers.  
14. Farmer accepts an offer.  
15. CROPSY creates an order.  
16. Payment authorization is processed.  
17. Product inspection and weight verification take place where required.  
18. Transportation is arranged.  
19. Buyer receives the product.  
20. Delivery is confirmed or disputed.  
21. Settlement is processed under the agreed terms.  
22. Farmer views the completed transaction.

## **10.2 Buyer Journey**

1. Buyer registers.  
2. Buyer verifies the account where required.  
3. Buyer accesses the Buyer Dashboard.  
4. Buyer searches for agricultural products.  
5. Buyer filters by location, quantity, price, and grade.  
6. Buyer compares available suppliers.  
7. Buyer submits a bid or offer.  
8. Buyer receives negotiation updates.  
9. Farmer accepts an offer.  
10. Buyer confirms order details.  
11. Buyer completes payment.  
12. Buyer tracks delivery.  
13. Buyer confirms received quantity and condition.  
14. Buyer receives transaction records.

## **10.3 Institutional Buyer Journey**

1. Institution registers a business account.  
2. Institution submits required business verification.  
3. Institution creates procurement requirements.  
4. Institution specifies products, quantities, grades, and delivery schedules.  
5. CROPSY discovers suitable suppliers or farmer groups.  
6. Institution reviews offers.  
7. Institution negotiates terms.  
8. Institution confirms purchase orders.  
9. Payment and delivery are coordinated.  
10. Institution views procurement reports.

## **10.4 Administrator Journey**

1. Administrator logs in securely.  
2. Administrator views the management dashboard.  
3. Administrator reviews user verification requests.  
4. Administrator monitors listings and transactions.  
5. Administrator reviews flagged activity.  
6. Administrator handles escalated complaints.  
7. Administrator reviews market and platform reports.  
8. Administrator updates permitted system configuration.  
9. All sensitive administrative activities are audited.

---

# **11\. Non-Functional Requirements**

Non-functional requirements define how well the system must operate.

## **NFR-01: Performance**

* Public product listing APIs should target a p95 response time below 500 ms under the agreed normal-load test profile, excluding external dependencies.  
* Search operations should be optimized for common filters.  
* Large reports shall run asynchronously.  
* Images shall be optimized and delivered through a CDN where appropriate.  
* Real-time updates should be delivered promptly under the agreed network conditions.

These are engineering targets, not measured performance claims.

## **NFR-02: Scalability**

* Backend instances shall support horizontal scaling.  
* Application services shall be stateless where practical.  
* Background workers shall scale independently.  
* Database queries shall use suitable indexes.  
* Read replicas may be introduced when read workloads justify them.  
* High-volume services may be extracted when operationally justified.

## **NFR-03: Availability**

* The production system shall define an availability target.  
* Critical services shall have health checks.  
* Failed background jobs shall be retried safely.  
* External provider outages shall not corrupt internal transactions.  
* Backup and disaster recovery procedures shall be documented.

## **NFR-04: Security**

* Passwords shall use a modern password hashing algorithm.  
* All production communication shall use HTTPS.  
* Access shall be controlled through RBAC and resource-level authorization.  
* Sensitive information shall be encrypted where appropriate.  
* Payment webhook signatures shall be verified.  
* APIs shall implement input validation and rate limiting.  
* Administrative actions shall be audited.  
* File uploads shall be validated and protected.  
* Security testing shall be performed before production release.

## **NFR-05: Privacy**

* Users shall be informed about relevant data collection.  
* Only necessary personal data shall be collected.  
* Exact farm and personal locations shall have appropriate access restrictions.  
* Users shall have access to applicable privacy controls.  
* Data retention and deletion policies shall be defined.  
* Third-party AI providers shall receive only the minimum necessary data.

## **NFR-06: Usability**

* The interface shall be simple and accessible.  
* Bangla shall be a primary supported language.  
* English may be provided as an additional language.  
* Interfaces shall support mobile devices.  
* Error messages shall be understandable.  
* Important financial information shall be presented clearly.

## **NFR-07: Accessibility**

* The Web Platform should follow WCAG 2.2 AA as a design target.  
* Text shall have sufficient contrast.  
* Interactive controls shall support keyboard navigation.  
* Screen-reader labels shall be provided.  
* Mobile interfaces shall support platform accessibility features.

## **NFR-08: Reliability**

* Critical database transactions shall maintain consistency.  
* Payment processing shall be idempotent.  
* Inventory shall not become negative through concurrent sales.  
* Event processing shall support retry and duplicate delivery.  
* Financial records shall remain auditable.

## **NFR-09: Compatibility**

* The Web Platform shall support modern major browsers.  
* Android and iOS applications shall support declared minimum OS versions.  
* Responsive layouts shall support desktop, tablet, and mobile screens.  
* Mobile releases shall follow the relevant app-store policies.

## **NFR-10: Maintainability**

* The backend shall use modular architecture.  
* APIs shall be documented.  
* Database changes shall use versioned migrations.  
* Code shall follow defined standards.  
* Automated testing shall be part of CI/CD.  
* Environment-specific configuration shall be separated from source code.

## **NFR-11: Localization**

* Bangla and English shall be supported.  
* Currency shall be displayed in BDT.  
* Dates and times shall use appropriate local formatting.  
* Weight and quantity units shall be configurable.  
* Local administrative geography shall support Bangladesh's division, district, and upazila structure.

## **NFR-12: Observability**

* Application logs shall be structured.  
* Critical operations shall be traceable.  
* API latency and error rates shall be monitored.  
* Queue backlogs shall be monitored.  
* Payment failures shall trigger appropriate alerts.  
* Security events shall be logged.

---

# **12\. Business Rules**

The following business rules govern CROPSY operations.

## **BR-01: Account Eligibility**

Only accounts meeting the relevant registration and verification requirements may perform restricted operations.

## **BR-02: Product Ownership**

A farmer may modify or deactivate only listings they own or are explicitly authorized to manage.

## **BR-03: Product Availability**

A product cannot be sold beyond its valid available quantity.

## **BR-04: Auction Integrity**

All bids must be validated against authoritative server-side auction rules.

## **BR-05: Auction Closing**

The server shall determine auction closing based on the authoritative configured closing time.

## **BR-06: Farmer Decision Authority**

A farmer must explicitly accept applicable offers. The platform shall not force a sale based solely on an algorithmic recommendation.

## **BR-07: Offer Validity**

Offers shall have defined expiration and acceptance rules.

## **BR-08: Inventory Reservation**

Inventory shall be reserved atomically during the relevant order confirmation process.

## **BR-09: Payment Confirmation**

Payment shall be confirmed using authoritative payment provider verification.

## **BR-10: Financial Consistency**

Every posted double-entry journal transaction must balance.

## **BR-11: Refund Policy**

Refunds shall follow published policies and authorized approval procedures.

## **BR-12: Delivery Confirmation**

Delivery shall be recorded using authorized status updates and applicable evidence.

## **BR-13: Inspection Integrity**

Inspection records shall identify the inspector, time, product or batch, and recorded findings.

## **BR-14: Data Source Transparency**

Market prices shall identify their source and observation timestamp.

## **BR-15: AI Prediction Transparency**

AI outputs shall be presented as estimates, not guaranteed market outcomes.

## **BR-16: Risk Detection**

Automated risk alerts shall not automatically constitute proof of fraud, collusion, or misconduct.

## **BR-17: Dispute Resolution**

Users shall have a defined mechanism to submit complaints and provide evidence.

## **BR-18: Administrative Accountability**

Sensitive administrative actions shall be logged and subject to permission controls.

## **BR-19: Group Selling**

Collective sales shall preserve individual member contribution and settlement records.

## **BR-20: Data Privacy**

Users shall only access personal, commercial, and transaction information they are authorized to view.

---

# **13\. System Architecture Requirements**

## **13.1 Recommended Technology Stack**

| Layer | Technology |
| ----- | ----- |
| Web Frontend | Next.js \+ JavaScript |
| Android Application | React Native \+ Expo |
| iOS Application | React Native \+ Expo |
| UI Styling | Tailwind CSS / NativeWind |
| Backend | Node.js \+ Fastify |
| Primary Language | JavaScript |
| AI Language | Python |
| Database | PostgreSQL |
| Geospatial Extension | PostGIS |
| ORM | Prisma |
| Cache | Redis |
| Queue | BullMQ |
| Real-time | Socket.IO |
| AI API | FastAPI |
| Machine Learning | Scikit-learn, XGBoost, PyTorch |
| Object Storage | S3-compatible storage |
| API Documentation | OpenAPI |
| Testing | Jest, Playwright, Maestro |
| Load Testing | k6 |
| Monitoring | OpenTelemetry, Grafana, Sentry |
| Deployment | Vercel \+ Cloud Infrastructure |

## **13.2 Architectural Style**

CROPSY shall initially use a Modular Monolith architecture.

The backend shall be separated into business modules:

1. Identity and Access Management.  
2. Farmer Management.  
3. Buyer Management.  
4. Marketplace.  
5. Product Management.  
6. Trading and Auction.  
7. Order Management.  
8. Payment and Ledger.  
9. Logistics.  
10. Quality and Inspection.  
11. Warehouse Management.  
12. Market Intelligence.  
13. AI Services.  
14. Notifications and Communication.  
15. Dispute Management.  
16. Analytics and Administration.

Modules shall have defined boundaries and controlled communication interfaces.

## **13.3 Design Patterns**

* Clean Architecture.  
* Domain-Driven Design principles.  
* Repository Pattern.  
* Service Layer Pattern.  
* Strategy Pattern.  
* Factory Pattern.  
* Adapter Pattern.  
* Observer / Domain Event Pattern.  
* State Machine Pattern.  
* Specification Pattern.  
* Dependency Injection.  
* Transactional Outbox Pattern.  
* Saga Pattern where distributed workflows require it.

## **13.4 Data Flow Requirements**

The primary business data flow shall be:

User Application → API Gateway → Authentication → Business Module → Database → Domain Event → Background Processing → Notification / Analytics / AI.

AI data flow shall be:

Data Ingestion → Validation → Cleaning → Feature Engineering → Model Training and Evaluation → Model Registry → Prediction API → Backend → User Interface.

## **13.5 Control Flow Requirements**

Critical state transitions shall be server-controlled.

Examples:

* Registration and verification.  
* Auction creation and closure.  
* Bid validation.  
* Inventory reservation.  
* Order confirmation.  
* Payment verification.  
* Delivery confirmation.  
* Financial settlement.  
* Dispute resolution.

The frontend shall never be treated as the authority for sensitive business state.

---

# **14\. Database Requirements**

The primary database shall use PostgreSQL with PostGIS.

## **14.1 Core Entities**

### **Identity**

* users  
* roles  
* permissions  
* user\_roles  
* sessions  
* verification\_requests

### **Geography**

* divisions  
* districts  
* upazilas  
* locations

### **Farmer and Buyer**

* farmers  
* farms  
* farmer\_groups  
* farmer\_group\_members  
* buyers  
* buyer\_business\_profiles

### **Products**

* products  
* product\_categories  
* product\_images  
* product\_batches  
* inventories  
* inventory\_movements

### **Trading**

* auctions  
* bids  
* offers  
* counteroffers  
* trading\_events

### **Orders**

* orders  
* order\_items  
* order\_status\_history

### **Financial**

* payments  
* refunds  
* ledger\_accounts  
* ledger\_transactions  
* ledger\_entries  
* payment\_webhook\_events

### **Logistics**

* transporters  
* vehicles  
* shipments  
* shipment\_events  
* delivery\_assignments

### **Quality**

* inspections  
* inspection\_results  
* product\_grades  
* inspection\_images

### **Warehouse**

* warehouses  
* storage\_slots  
* warehouse\_stock  
* warehouse\_movements

### **AI**

* ai\_predictions  
* recommendations  
* risk\_alerts  
* model\_versions  
* model\_evaluations

### **Communication**

* conversations  
* messages  
* notifications

### **Governance**

* disputes  
* dispute\_evidence  
* audit\_logs

## **14.2 Database Design Principles**

* Use primary and foreign key constraints.  
* Use appropriate decimal types for financial values.  
* Use database transactions for critical operations.  
* Maintain immutable financial posting records.  
* Use indexes for frequent queries.  
* Use PostGIS indexes for geographic search.  
* Apply pagination to large collections.  
* Use migrations for schema evolution.  
* Avoid storing large binary files directly in relational tables.  
* Implement appropriate retention policies.

---

# **15\. External Integrations**

CROPSY may require the following integrations.

| Integration | Purpose | Dependency |
| ----- | ----- | ----- |
| SMS Provider | OTP and notifications | Provider availability |
| Email Provider | Account communication | Provider availability |
| Payment Gateway | Digital transactions | Merchant approval |
| Map Service | Location and routes | API terms and cost |
| Push Notification | Mobile notifications | FCM / APNs |
| Object Storage | Media files | Storage provider |
| Government Agricultural Data | Market price information | Data access and licensing |
| AI Provider | Optional language model | Provider terms and privacy |
| Analytics Service | Product analytics | Privacy policy |

All external integrations shall use adapters so that providers can be replaced without rewriting core business logic.

---

# **16\. AI Requirements and Feasibility**

AI shall function as a decision-support layer rather than an autonomous authority over transactions.

## **AI-01: Agricultural Price Forecasting**

Input:

* Historical market prices.  
* Product category.  
* Location.  
* Season.  
* Available supply.  
* Observed transactions.

Output:

* Estimated price range.  
* Forecast horizon.  
* Trend.  
* Prediction uncertainty.  
* Data timestamp.

Candidate models:

* XGBoost.  
* LightGBM.  
* SARIMAX.  
* Other validated time-series methods.

## **AI-02: Demand Forecasting**

Input:

* Historical orders.  
* Buyer requirements.  
* Preorders.  
* Supply availability.  
* Seasonal patterns.

Output:

* Expected demand.  
* Potential shortages.  
* Potential surplus.  
* Forecast uncertainty.

## **AI-03: Farmer-Buyer Matching**

The recommendation engine shall consider:

* Product compatibility.  
* Available quantity.  
* Buyer requirements.  
* Geographic distance.  
* Transport cost.  
* Delivery requirements.  
* Buyer reliability based on valid platform history.

The recommendation score shall indicate compatibility, not guaranteed transaction success.

## **AI-04: Trading Anomaly Detection**

Potential signals:

* Unusual repeated bidding.  
* Abnormal cancellation patterns.  
* Unusual linked-account activity.  
* Concentrated purchasing patterns.  
* Repeated coordinated transaction patterns.  
* Unusual price movements.

Candidate methods:

* Isolation Forest.  
* Statistical anomaly detection.  
* Graph-based analysis.  
* Supervised learning when verified labels exist.

Outputs shall be risk alerts for authorized human review.

## **AI-05: Computer Vision**

The system may assess visible:

* Surface defects.  
* Color variations.  
* Visible damage.  
* Size consistency.  
* Maturity indicators for supported products.

Image-based assessment shall not claim to detect pesticide residues, internal contamination, or food safety without appropriate validated testing.

## **AI-06: Bangla Agricultural Assistant**

The assistant may:

* Explain platform features.  
* Retrieve current authorized market information.  
* Summarize buyer offers.  
* Explain order status.  
* Provide selling comparisons.  
* Guide users through permitted workflows.

The assistant shall not invent platform records or execute payments and sales without explicit authorization.

## **AI Data Readiness**

At launch, CROPSY may not possess sufficient verified data for reliable machine learning.

Initial deployment should prioritize:

* Verified price collection.  
* Basic statistical comparisons.  
* Rule-based matching.  
* Historical transaction recording.  
* Data-quality monitoring.

ML predictions should be introduced only after sufficient data and validation are available.

---

# **17\. Mobile Application Requirements**

The Android and iOS applications shall be developed using React Native and Expo.

## **17.1 Common Mobile Features**

* User registration.  
* Secure authentication.  
* Farmer dashboard.  
* Buyer dashboard.  
* Product listing.  
* Camera-based image upload.  
* Marketplace search.  
* Auction and bidding.  
* Order management.  
* Payment workflows.  
* Push notifications.  
* GPS-based discovery.  
* Messaging.  
* AI assistant.  
* Profile management.

## **17.2 Offline and Low-Bandwidth Requirements**

* Save incomplete product listings locally.  
* Compress product images before upload.  
* Support retryable uploads.  
* Provide clear network failure messages.  
* Cache permitted non-sensitive information.  
* Synchronize drafts after reconnection.  
* Prevent duplicate submissions through idempotency.

Financial transactions and time-sensitive bids shall not be represented as completed while offline.

## **17.3 Platform Release Requirements**

Android:

* Android-compatible application build.  
* Google Play Console configuration.  
* Internal and closed testing.  
* Production release.  
* Privacy and permissions disclosures.

iOS:

* iOS-compatible application build.  
* Apple Developer configuration.  
* TestFlight testing.  
* App Store review.  
* Privacy disclosures and permission descriptions.

---

# **18\. Web Application Requirements**

The Web Platform shall provide:

## **Public Website**

* Home page.  
* About CROPSY.  
* Marketplace.  
* Product details.  
* Market prices.  
* Buyer and farmer information.  
* Help center.  
* Contact and support.

## **Farmer Portal**

* Farmer dashboard.  
* Profile management.  
* Farm management.  
* Product listing.  
* Auction management.  
* Offer management.  
* Orders.  
* Financial records.  
* AI recommendations.

## **Buyer Portal**

* Buyer dashboard.  
* Product search.  
* Procurement requirements.  
* Bidding and negotiation.  
* Orders.  
* Payments.  
* Shipment tracking.  
* Purchase reports.

## **Admin Portal**

* Dashboard.  
* User management.  
* Verification management.  
* Marketplace management.  
* Auction monitoring.  
* Order monitoring.  
* Financial monitoring.  
* Dispute management.  
* Market intelligence.  
* Risk alerts.  
* System configuration.  
* Audit logs.

---

# **19\. Testing and Quality Assurance Requirements**

## **19.1 Unit Testing**

Test:

* Price calculation.  
* Bid validation.  
* Order state transitions.  
* Permission checks.  
* Ledger balancing.  
* Inventory reservation.  
* Refund calculations.

## **19.2 Integration Testing**

Test:

* API and database interactions.  
* Payment provider integration.  
* Queue processing.  
* Notification integration.  
* AI service communication.  
* Real-time event processing.

## **19.3 End-to-End Testing**

Test complete workflows:

1. Farmer registration.  
2. Farmer verification.  
3. Product listing.  
4. Buyer search.  
5. Bid submission.  
6. Offer acceptance.  
7. Order creation.  
8. Payment confirmation.  
9. Product delivery.  
10. Financial settlement.

## **19.4 Performance Testing**

Test:

* Concurrent product searches.  
* Concurrent bids.  
* Concurrent inventory reservations.  
* Large product listings.  
* High-volume notifications.  
* Background queue processing.

## **19.5 Security Testing**

Test:

* Broken access control.  
* Authentication weaknesses.  
* SQL injection.  
* Cross-site scripting.  
* CSRF.  
* File upload vulnerabilities.  
* Session management.  
* Payment webhook security.  
* Privilege escalation.

---

# **20\. Deployment and Infrastructure Requirements**

## **20.1 Recommended Deployment Architecture**

* Next.js Website: Vercel or suitable cloud hosting.  
* Fastify API: Container-based cloud hosting.  
* Android and iOS: Google Play Store and Apple App Store.  
* PostgreSQL: Managed database.  
* Redis: Managed Redis.  
* AI Service: Separate Python hosting.  
* Background Workers: Separate worker processes.  
* Object Storage: S3-compatible storage.  
* Monitoring: OpenTelemetry, Grafana, Sentry.

## **20.2 Scaling Strategy**

Stage 1:

* Modular Monolith.  
* Single primary database.  
* Basic caching.  
* Background workers.

Stage 2:

* Multiple backend instances.  
* Shared Redis.  
* Queue worker scaling.  
* CDN integration.

Stage 3:

* PostgreSQL read replicas.  
* Query optimization.  
* Database partitioning where justified.

Stage 4:

* Extract high-load services.  
* Independent AI scaling.  
* Dedicated search infrastructure if needed.  
* Event-driven service communication.

Kubernetes, Kafka, and full microservices are optional future infrastructure decisions, not initial MVP requirements.

---

# **21\. Risk Analysis**

| Risk | Potential Impact | Mitigation |
| ----- | ----- | ----- |
| Insufficient farmer adoption | Low marketplace liquidity | Local onboarding and training |
| Insufficient buyer adoption | Limited sales opportunities | Buyer partnerships |
| Inaccurate market data | Misleading decisions | Source verification and timestamps |
| Low AI data availability | Unreliable forecasts | Gradual data collection |
| Payment gateway failure | Transaction disruption | Retry and reconciliation |
| Fraudulent listings | Financial losses | Verification and moderation |
| Auction manipulation | Reduced trading trust | Auditable bidding and monitoring |
| Logistics limitations | Delivery delays | Multiple transport partners |
| Poor network connectivity | User experience problems | Offline drafts and low-bandwidth design |
| Data breach | Privacy and financial damage | Security controls and incident response |
| Inventory inconsistency | Overselling | Atomic transactions and constraints |
| Market concentration | Reduced competition | Transparent market analytics and monitoring |
| AI false positives | Unfair user treatment | Human review and appeals |
| Operational disputes | User dissatisfaction | Clear evidence and dispute workflows |

---

# **22\. MVP Definition and Release Criteria**

## **MVP Scope**

The first public version shall prioritize the following:

### **User Management**

* Farmer registration.  
* Buyer registration.  
* Authentication.  
* Profile management.  
* Verification workflow.  
* Role-based access control.

### **Marketplace**

* Product categories.  
* Product listing.  
* Product image upload.  
* Product search.  
* Location filters.  
* Inventory tracking.

### **Trading**

* Fixed-price sales.  
* Buyer offers.  
* Basic competitive bidding.  
* Offer acceptance.  
* Transaction history.

### **Order and Payment**

* Order creation.  
* Order tracking.  
* At least one approved payment integration.  
* Payment verification.  
* Basic financial ledger.  
* Refund workflow.

### **Administration**

* Admin dashboard.  
* User verification.  
* Product moderation.  
* Order monitoring.  
* Basic reports.

### **Applications**

* Public website.  
* Farmer and buyer Web portals.  
* Android application.  
* iOS application.

## **MVP Acceptance Criteria**

The MVP may be considered ready for pilot release when:

1. Farmers can register and publish valid products.  
2. Buyers can register and discover products.  
3. Buyers can submit valid offers.  
4. Farmers can accept or reject offers.  
5. The system can create orders correctly.  
6. Payment status can be verified reliably.  
7. Inventory remains consistent under concurrent requests.  
8. Users can track order progress.  
9. Administrators can verify accounts and monitor transactions.  
10. Web, Android, and iOS applications can use the shared backend.  
11. Critical security and integration tests pass.  
12. Backup and recovery procedures have been tested.  
13. User-facing terms, privacy policy, and transaction policies are available.

---

# **23\. Development Roadmap**

| Phase | Development Focus | Main Deliverable |
| ----- | ----- | ----- |
| Phase 1 | Requirements and system design | SRS, ERD, architecture, UI/UX |
| Phase 2 | Repository and infrastructure | Working development environment |
| Phase 3 | Authentication and profiles | Multi-role identity system |
| Phase 4 | Marketplace | Product discovery and listings |
| Phase 5 | Trading engine | Auction and negotiation |
| Phase 6 | Order and payment | Transaction system |
| Phase 7 | Logistics and quality | Supply chain operations |
| Phase 8 | AI intelligence | Forecasts and recommendations |
| Phase 9 | Testing and security | Release candidate |
| Phase 10 | Deployment | Web and mobile release |

Suggested implementation approach:

* Build a functioning vertical slice early.  
* Develop Web and Mobile interfaces in parallel after API contracts are established.  
* Introduce advanced AI features after the data foundation is operational.  
* Pilot in selected markets before broader expansion.

---

# **24\. Success Metrics and KPIs**

CROPSY's success shall be measured through platform adoption, transaction performance, farmer outcomes, buyer experience, and operational reliability.

## **Farmer Metrics**

* Number of verified active farmers.  
* Number of successful farmer sales.  
* Average farmer net proceeds per unit.  
* Average time to sell.  
* Number of competing buyers per listing.  
* Farmer retention rate.

## **Buyer Metrics**

* Number of active buyers.  
* Buyer procurement completion rate.  
* Average procurement cost per unit.  
* Supplier discovery time.  
* Repeat purchase rate.

## **Marketplace Metrics**

* Number of active listings.  
* Listing-to-order conversion rate.  
* Average offers per eligible listing.  
* Successful auction rate.  
* Transaction volume.  
* Market coverage by district.

## **Logistics Metrics**

* Average delivery time.  
* Transportation cost per kilogram.  
* On-time delivery rate.  
* Product damage rate.  
* Shipment completion rate.

## **Financial Metrics**

* Payment success rate.  
* Refund rate.  
* Settlement time.  
* Reconciliation discrepancy rate.

## **AI Metrics**

* Forecast MAE and RMSE.  
* Demand forecast WAPE.  
* Matching Precision@K and Recall@K.  
* Anomaly detection precision and false-positive rate.  
* Product image classification F1.  
* AI assistant task completion rate.

## **Platform Metrics**

* API p95 latency.  
* System availability.  
* Application crash-free sessions.  
* Queue processing delay.  
* Error rate.  
* Security incident count.

All KPI baselines and targets shall be established using pilot data rather than invented in advance.

---

# **25\. Assumptions and Constraints**

## **Assumptions**

1. Farmers and buyers will have access to supported smartphones or Web access.  
2. Internet access will be available for core online transactions.  
3. Payment providers will permit the required merchant operations.  
4. External market data may be available through authorized sources.  
5. Local transport and collection partners can be onboarded.  
6. Farmers will provide reasonably accurate product and quantity information.  
7. Buyers will provide valid procurement information.

## **Constraints**

1. The initial launch is focused on Bangladesh.  
2. Market price data availability may vary by location.  
3. Government data access and licensing must be verified.  
4. AI performance depends on data quality and volume.  
5. Mobile releases depend on app-store review and policy compliance.  
6. Payment operations depend on provider approval and applicable regulations.  
7. Physical logistics infrastructure cannot be guaranteed by software alone.

---

# **26\. Future Enhancement Opportunities**

Potential future modules include:

* Agricultural input marketplace for seeds, fertilizer, and equipment.  
* Crop planning assistance.  
* Contract farming management.  
* Agricultural insurance integration.  
* Financing and credit partner integration.  
* Cold storage booking.  
* Advanced vehicle route optimization.  
* Digital procurement contracts.  
* Farmer cooperative management.  
* Export-oriented agricultural marketplace.  
* IoT-enabled warehouse monitoring.  
* Advanced market concentration analysis.  
* Multilingual agricultural voice interaction.  
* Government and institutional procurement integrations.

Future features shall undergo separate feasibility, regulatory, privacy, and business analysis before implementation.

---

# **27\. Final Project Vision**

CROPSY is envisioned as a unified digital agricultural ecosystem that connects farmers, buyers, logistics providers, warehouses, and institutional procurement organizations through transparent trading and data-driven decision-making.

Its long-term purpose is to:

* Strengthen farmers' market access.  
* Improve price transparency.  
* Encourage competitive agricultural trading.  
* Reduce unnecessary intermediary costs.  
* Improve supply-chain coordination.  
* Make agricultural transactions traceable.  
* Improve the efficiency of agricultural procurement.  
* Support evidence-based market decisions.

**CROPSY is not merely an agricultural product-selling website. It is a cross-platform agricultural marketplace and supply-chain infrastructure designed to improve how agricultural products are discovered, priced, traded, transported, and delivered.**

**CROPSY — Empower Farmers. Transform Markets.**

---

# **Appendix A: Requirements Traceability**

| Problem ID | Related Requirements | Primary Module |
| ----- | ----- | ----- |
| P-01 | FR-04, FR-05, FR-07, FR-09 | Marketplace and Trading |
| P-02 | FR-06, FR-19 | Market Intelligence |
| P-03 | FR-05, FR-07, FR-19 | Buyer Discovery |
| P-04 | FR-06, FR-07, FR-09 | Price and Trading |
| P-05 | FR-07, FR-08, FR-10 | Trading and Orders |
| P-06 | FR-13 | Logistics |
| P-07 | FR-14, FR-15, FR-19 | Quality and Storage |
| P-08 | FR-14, FR-16 | Quality and Traceability |
| P-09 | FR-06, FR-19 | Forecasting |
| P-10 | FR-11, FR-12 | Financial System |
| P-11 | FR-07, FR-19, FR-20 | Trading Integrity |
| P-12 | FR-01, FR-17, Mobile Requirements | Accessibility |

# **Appendix B: Definition of Done**

A feature is considered complete only when:

1. Its functional requirements are implemented.  
2. Input validation is implemented.  
3. Authorization checks are implemented.  
4. Database changes are versioned.  
5. Unit tests pass.  
6. Relevant integration tests pass.  
7. API documentation is updated.  
8. Error handling is implemented.  
9. Audit logging is implemented where necessary.  
10. Web and Mobile integration is verified where applicable.  
11. Security implications are reviewed.  
12. Acceptance criteria are demonstrably satisfied.

**End of Document — CROPSY SRS v1.0**

