# **CROPSY**

# **Software Design Document (SDD)**

**Project:** CROPSY — Agricultural Marketplace and Supply Chain Ecosystem  
**Tagline:** Empower Farmers. Transform Markets.  
**Document Type:** Software Design Document  
**Version:** 1.0  
**Status:** Proposed Technical Baseline  
**Date:** 25 November 2026  
**Platforms:** Web, Android, iOS  
**Primary Language:** JavaScript  
**Architecture:** Modular Monolith \+ Separate AI Service

---

# **1\. Introduction**

## **1.1 Purpose**

This Software Design Document (SDD) defines the technical architecture, internal modules, database structure, API contracts, data flow, control flow, security mechanisms, design patterns, deployment architecture, and implementation decisions for CROPSY.

It translates the CROPSY Software Requirements Specification (SRS) into an implementable technical design.

The document is intended for:

* Software architects  
* Backend developers  
* Frontend developers  
* Mobile application developers  
* AI/ML engineers  
* Database engineers  
* QA and security engineers  
* Project managers

## **1.2 System Overview**

CROPSY is a multi-platform agricultural marketplace and supply-chain management ecosystem.

It connects:

* Farmers  
* Farmer groups and cooperatives  
* Wholesalers  
* Retailers  
* Restaurants  
* Institutional buyers  
* Consumers  
* Transporters  
* Warehouses  
* Quality inspectors  
* Administrators

The system enables agricultural product discovery, trading, auctions, collective selling, order processing, payment management, logistics coordination, product quality verification, and AI-powered market intelligence.

## **1.3 Design Objectives**

| Objective | Design approach |
| ----- | ----- |
| Maintainability | Modular monolith, Clean Architecture |
| Scalability | Stateless APIs, Redis, queues, horizontal scaling |
| Data integrity | PostgreSQL transactions and constraints |
| Security | RBAC, ownership checks, audit logs |
| Performance | Indexing, caching, pagination |
| Reliability | Idempotency, retries, transactional outbox |
| Cross-platform support | Shared REST API |
| AI extensibility | Independent Python AI service |
| Geospatial functionality | PostgreSQL \+ PostGIS |
| Real-time communication | Socket.IO |
| Accessibility | Bangla-first, low-bandwidth-friendly interfaces |

## **1.4 Scope**

This SDD covers:

1. System architecture  
2. Technology stack  
3. Module decomposition  
4. Module dependencies  
5. Database ERD  
6. Database design specifications  
7. REST API contracts  
8. Authentication and authorization  
9. Sequence diagrams  
10. Data Flow Diagrams (DFD)  
11. Control Flow Graphs (CFG)  
12. Business workflow state machines  
13. AI architecture  
14. Security architecture  
15. Deployment architecture  
16. Scalability strategy  
17. Architecture Decision Records (ADRs)  
18. Testing and implementation guidance

---

# **2\. System Architecture**

## **2.1 Recommended Architecture**

CROPSY should initially use a **Modular Monolith Architecture**.

A modular monolith is a single deployable application whose internal modules have clearly defined responsibilities and boundaries.

It is preferable to starting with microservices because CROPSY is initially being developed by a small team. It reduces infrastructure complexity while preserving the option to extract high-load modules into independent services later.

### **High-level architecture**

```
flowchart TB
    subgraph Clients["Client Applications"]
        WEB["Web Application<br/>Next.js + JavaScript"]
        AND["Android Application<br/>React Native + Expo"]
        IOS["iOS Application<br/>React Native + Expo"]
    end

    subgraph Edge["Application Edge"]
        CDN["CDN / WAF"]
        API["API Gateway / Backend Entry"]
    end

    subgraph Backend["CROPSY Backend - Modular Monolith"]
        AUTH["Identity & Access"]
        USER["User & Farmer Management"]
        MARKET["Marketplace"]
        TRADE["Trading & Auctions"]
        ORDER["Orders"]
        PAY["Payments & Ledger"]
        LOG["Logistics"]
        QUALITY["Quality & Warehouse"]
        COMM["Communication"]
        ADMIN["Administration"]
        AIADAPTER["AI Integration Module"]
    end

    subgraph Infrastructure["Infrastructure"]
        DB[("PostgreSQL + PostGIS")]
        REDIS[("Redis")]
        QUEUE["Background Job Queue"]
        STORAGE["Object Storage"]
        SOCKET["Real-time Gateway"]
    end

    subgraph AI["AI Platform"]
        AIGW["Python FastAPI"]
        PRICE["Price Forecasting"]
        MATCH["Matching Engine"]
        ANOMALY["Anomaly Detection"]
        VISION["Computer Vision"]
        RAG["Bangla AI Assistant / RAG"]
    end

    subgraph External["External Providers"]
        PAYMENT["Payment Provider"]
        SMS["SMS / Email Provider"]
        MAP["Map / Geocoding Provider"]
    end

    WEB --> CDN
    AND --> API
    IOS --> API
    CDN --> API

    API --> AUTH
    API --> USER
    API --> MARKET
    API --> TRADE
    API --> ORDER
    API --> PAY
    API --> LOG
    API --> QUALITY
    API --> COMM
    API --> ADMIN
    API --> AIADAPTER

    AUTH --> DB
    USER --> DB
    MARKET --> DB
    TRADE --> DB
    ORDER --> DB
    PAY --> DB
    LOG --> DB
    QUALITY --> DB
    COMM --> DB
    ADMIN --> DB

    Backend --> REDIS
    Backend --> QUEUE
    Backend --> STORAGE
    Backend --> SOCKET

    AIADAPTER --> AIGW
    AIGW --> PRICE
    AIGW --> MATCH
    AIGW --> ANOMALY
    AIGW --> VISION
    AIGW --> RAG

    PAY --> PAYMENT
    COMM --> SMS
    LOG --> MAP
```

## **2.2 Architectural Layers**

### **Layer 1: Presentation**

Responsibilities:

* Display application interfaces.  
* Collect user input.  
* Perform client-side validation.  
* Manage application navigation.  
* Display server responses.  
* Handle authentication sessions.  
* Support Bangla and English localization.

Technologies:

* Web: Next.js \+ JavaScript  
* Mobile: React Native \+ Expo  
* Web styling: Tailwind CSS  
* Mobile styling: NativeWind or a reusable React Native component system

The frontend must not independently decide whether a transaction, payment, auction bid, or order is valid.

### **Layer 2: API / Application Layer**

Responsibilities:

* Receive HTTP requests.  
* Validate request schemas.  
* Authenticate users.  
* Authorize operations.  
* Invoke application services.  
* Manage transactions.  
* Return standardized responses.

Recommended backend:

* Node.js  
* Fastify  
* JavaScript  
* Zod for validation  
* Prisma ORM

### **Layer 3: Domain Layer**

Contains the core business rules.

Examples:

* A farmer cannot sell more available quantity than they own.  
* An expired auction cannot accept a new bid.  
* A buyer cannot access another buyer's private procurement information.  
* An order cannot be marked delivered without the required delivery transition.  
* A payment cannot be marked successful solely because the browser redirected to a success page.

The domain layer should not depend on HTTP, React, database-specific implementation details, or external payment-provider SDKs.

### **Layer 4: Infrastructure Layer**

Responsibilities:

* Database persistence  
* Redis caching  
* Job processing  
* File storage  
* External API integration  
* Payment communication  
* Email and SMS delivery  
* Logging and monitoring

### **Layer 5: AI Layer**

The AI layer operates as an independent service.

It provides predictions, recommendations, image analysis, anomaly alerts, and assistant functionality.

AI outputs are advisory. The backend remains authoritative for business transactions.

---

# **3\. Technology Stack**

## **3.1 Application Stack**

| Component | Recommended technology | Purpose |
| ----- | ----- | ----- |
| Web frontend | Next.js \+ JavaScript | Web application |
| UI | React \+ Tailwind CSS | Interface |
| Android | React Native \+ Expo | Android application |
| iOS | React Native \+ Expo | iOS application |
| Backend | Node.js \+ Fastify | REST API |
| Main language | JavaScript | Application development |
| Validation | Zod | Input validation |
| ORM | Prisma | Database access |
| Database | PostgreSQL | Transactional data |
| Geospatial | PostGIS | Location and distance |
| Cache | Redis | Caching and distributed coordination |
| Queue | BullMQ | Background jobs |
| Real-time | Socket.IO | Chat and notifications |
| AI service | Python \+ FastAPI | AI inference |
| ML | Scikit-learn, XGBoost, PyTorch | Machine learning |
| Optimization | Google OR-Tools | Logistics optimization |
| API documentation | OpenAPI | API contracts |
| Unit testing | Jest or Vitest | Unit tests |
| API testing | Supertest / Fastify inject | Integration tests |
| Web E2E | Playwright | Browser testing |
| Mobile E2E | Maestro | Mobile testing |
| Load testing | k6 | Performance testing |
| Monitoring | OpenTelemetry, Grafana | Observability |
| Error monitoring | Sentry | Error reporting |

## **3.2 Repository Structure**

Recommended monorepo:

```
CROPSY/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── public/
│   │
│   ├── mobile/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── navigation/
│   │   ├── services/
│   │   └── assets/
│   │
│   └── api/
│       ├── src/
│       │   ├── modules/
│       │   ├── common/
│       │   ├── config/
│       │   ├── infrastructure/
│       │   ├── plugins/
│       │   ├── routes/
│       │   └── server.js
│       ├── prisma/
│       └── tests/
│
├── services/
│   └── ai-service/
│       ├── app/
│       │   ├── api/
│       │   ├── models/
│       │   ├── pipelines/
│       │   ├── services/
│       │   └── schemas/
│       ├── tests/
│       └── requirements.txt
│
├── packages/
│   ├── shared-schemas/
│   ├── api-client/
│   ├── constants/
│   └── shared-utils/
│
├── infrastructure/
│   ├── database/
│   ├── monitoring/
│   └── deployment/
│
├── docs/
│   ├── SRS.md
│   ├── SDD.md
│   ├── API.md
│   ├── ERD.md
│   └── ADR/
│
├── .env.example
├── package.json
└── README.md
```

**Important:** Keep the AI service in Python, but keep the primary application and API in JavaScript. Shared API contracts should be documented independently so that both services can communicate consistently.

---

# **4\. Domain and Module Design**

## **4.1 Core Modules**

| Module | Main responsibility |
| ----- | ----- |
| Identity | Registration, login, sessions |
| Access Control | Roles, permissions |
| User Management | User profiles and account status |
| Farmer Management | Farmer profiles and verification |
| Buyer Management | Buyer profiles and verification |
| Farmer Groups | Cooperative and collective selling |
| Product Catalog | Products, categories, units |
| Marketplace | Listings, search and discovery |
| Price Intelligence | Market price observations |
| Trading | Offers, counteroffers and auctions |
| Orders | Order lifecycle |
| Payments | Payment provider integration |
| Financial Ledger | Financial accounting |
| Logistics | Transport and shipment |
| Quality | Inspection and grading |
| Warehouse | Storage and inventory |
| Traceability | QR and product batch history |
| Communication | Chat and notifications |
| Disputes | Complaints and resolution |
| AI Intelligence | Forecasts, matching and anomalies |
| Administration | Platform configuration and moderation |
| Analytics | Operational and market reports |
| Audit | Sensitive action history |

## **4.2 Module Internal Structure**

Each business module should follow a consistent structure.

Example:

```
marketplace/
│
├── marketplace.routes.js
├── marketplace.controller.js
├── marketplace.service.js
├── marketplace.repository.js
├── marketplace.schema.js
├── marketplace.policy.js
├── marketplace.events.js
├── marketplace.constants.js
└── tests/
    ├── marketplace.unit.test.js
    └── marketplace.integration.test.js
```

Responsibilities:

* `routes`: HTTP route definitions.  
* `controller`: HTTP request and response handling.  
* `service`: Application use cases.  
* `repository`: Data persistence.  
* `schema`: Input validation.  
* `policy`: Authorization and business permissions.  
* `events`: Domain event definitions.

The domain rules should live in the service/domain logic, not in route handlers.

## **4.3 Module Dependency Diagram**

```
flowchart TD
    ID["Identity & Access"]
    USER["User Management"]
    FARM["Farmer Management"]
    BUYER["Buyer Management"]
    GROUP["Farmer Groups"]
    PRODUCT["Product Catalog"]
    MARKET["Marketplace"]
    PRICE["Price Intelligence"]
    TRADE["Trading & Auctions"]
    ORDER["Orders"]
    PAYMENT["Payments & Ledger"]
    LOG["Logistics"]
    QUALITY["Quality & Warehouse"]
    TRACE["Traceability"]
    COMM["Communication"]
    DISPUTE["Disputes"]
    AI["AI Intelligence"]
    ADMIN["Administration"]
    AUDIT["Audit"]

    ID --> USER
    USER --> FARM
    USER --> BUYER
    FARM --> GROUP
    PRODUCT --> MARKET
    FARM --> MARKET
    MARKET --> TRADE
    PRICE --> MARKET
    TRADE --> ORDER
    GROUP --> ORDER
    ORDER --> PAYMENT
    ORDER --> LOG
    QUALITY --> MARKET
    QUALITY --> LOG
    QUALITY --> TRACE
    ORDER --> COMM
    ORDER --> DISPUTE
    PAYMENT --> DISPUTE
    MARKET --> AI
    PRICE --> AI
    TRADE --> AI
    LOG --> AI
    ID --> ADMIN
    ADMIN --> AUDIT
    PAYMENT --> AUDIT
    TRADE --> AUDIT
```

## **4.4 Dependency Rules**

1. Modules must not directly access another module's internal repository.  
2. Modules should communicate through public application services or domain events.  
3. Shared utilities must not contain business-specific rules.  
4. Avoid circular dependencies.  
5. Payment and order modules must have explicit transaction boundaries.  
6. AI must not write directly into core transaction tables.  
7. Administrative actions must produce audit records.  
8. External provider integrations must be isolated behind adapters.

---

# **5\. Design Patterns**

## **5.1 Repository Pattern**

Purpose: Separate data access from business logic.

Example:

```
export class ProductRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findById(productId) {
    return this.prisma.product.findUnique({
      where: { id: productId }
    });
  }

  async create(data) {
    return this.prisma.product.create({
      data
    });
  }
}
```

## **5.2 Service Layer Pattern**

Purpose: Centralize application use cases.

```
export class CreateListingService {
  constructor(productRepository, listingRepository) {
    this.productRepository = productRepository;
    this.listingRepository = listingRepository;
  }

  async execute(input, actor) {
    const product = await this.productRepository.findById(
      input.productId
    );

    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND");
    }

    if (actor.status !== "ACTIVE") {
      throw new Error("ACCOUNT_NOT_ACTIVE");
    }

    return this.listingRepository.create({
      ...input,
      farmerId: actor.userId
    });
  }
}
```

Production implementation should use structured domain errors rather than generic errors.

## **5.3 Strategy Pattern**

Useful for payment providers, pricing rules, notification channels, and matching strategies.

```
class PaymentStrategy {
  async initiatePayment() {
    throw new Error("NOT_IMPLEMENTED");
  }

  async verifyPayment() {
    throw new Error("NOT_IMPLEMENTED");
  }
}

class PaymentProviderAdapter extends PaymentStrategy {
  async initiatePayment(payment) {
    // Provider-specific integration
  }

  async verifyPayment(reference) {
    // Verify against the provider
  }
}
```

The actual provider must be selected after business and regulatory requirements are confirmed.

## **5.4 State Machine Pattern**

Use state machines for:

* Orders  
* Auctions  
* Payments  
* Shipments  
* Disputes  
* Product listings

State transitions must be explicitly validated.

## **5.5 Adapter Pattern**

Use adapters for:

* Payment providers  
* SMS providers  
* Email providers  
* Mapping services  
* AI model providers  
* Object storage

This avoids coupling core business logic to one vendor.

## **5.6 Observer / Domain Event Pattern**

Examples:

```
OrderCreated
PaymentVerified
AuctionClosed
ShipmentPickedUp
ShipmentDelivered
ProductInspected
DisputeOpened
```

A domain event can trigger notifications, analytics updates, and background tasks.

## **5.7 Transactional Outbox Pattern**

When a database transaction changes business state and must publish an event, write the event to an outbox table in the same transaction.

A background worker publishes the event and marks it processed.

This avoids the failure scenario where the database commits but event publication fails.

## **5.8 Saga Pattern**

Use a saga only when a workflow crosses multiple independently committed systems.

Example: order fulfillment involving payment, inventory reservation, and shipment creation.

For the initial modular monolith, a database transaction is simpler whenever all relevant records share one database.

---

# **6\. Database Architecture**

## **6.1 Database Selection**

**Primary database:** PostgreSQL

**Geospatial extension:** PostGIS

Reasons:

* Strong relational integrity  
* ACID transactions  
* Complex filtering and reporting  
* JSON support  
* Geospatial queries  
* Indexing  
* Mature concurrency control

## **6.2 Database Naming Standards**

| Item | Convention | Example |
| ----- | ----- | ----- |
| Tables | snake\_case, plural | `users` |
| Columns | snake\_case | `created_at` |
| Primary key | `id` | UUID |
| Foreign key | `{entity}_id` | `farmer_id` |
| Index | `idx_{table}_{columns}` | `idx_listings_status` |
| Unique constraint | `uq_{table}_{columns}` | `uq_users_email` |

Recommended identifier type: UUID.

Use UTC timestamps in the database. Convert to the user's local timezone in the application.

## **6.3 Core Database Entities**

The following ERD is a logical baseline. Exact columns and constraints should be refined during implementation.

### **Database ERD — Identity and User Management**

```
erDiagram
    USERS {
        uuid id PK
        string full_name
        string email UK
        string phone UK
        string password_hash
        string status
        string preferred_language
        timestamp email_verified_at
        timestamp phone_verified_at
        timestamp created_at
        timestamp updated_at
    }

    ROLES {
        uuid id PK
        string name UK
        string description
    }

    PERMISSIONS {
        uuid id PK
        string key UK
        string description
    }

    USER_ROLES {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        uuid assigned_by FK
        timestamp assigned_at
    }

    ROLE_PERMISSIONS {
        uuid role_id FK
        uuid permission_id FK
    }

    USER_SESSIONS {
        uuid id PK
        uuid user_id FK
        string refresh_token_hash
        timestamp expires_at
        timestamp revoked_at
    }

    USER_ADDRESSES {
        uuid id PK
        uuid user_id FK
        string address_line
        uuid district_id FK
        uuid upazila_id FK
        decimal latitude
        decimal longitude
        boolean is_default
    }

    USERS ||--o{ USER_ROLES : has
    ROLES ||--o{ USER_ROLES : assigned
    ROLES ||--o{ ROLE_PERMISSIONS : contains
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : grants
    USERS ||--o{ USER_SESSIONS : owns
    USERS ||--o{ USER_ADDRESSES : has
```

### **Database ERD — Agricultural Marketplace**

```
erDiagram
    USERS {
        uuid id PK
    }

    FARMER_PROFILES {
        uuid id PK
        uuid user_id FK
        string farm_name
        string verification_status
        decimal farm_area
        string farm_area_unit
        timestamp created_at
    }

    BUYER_PROFILES {
        uuid id PK
        uuid user_id FK
        string business_name
        string business_type
        string verification_status
    }

    PRODUCT_CATEGORIES {
        uuid id PK
        string name
        uuid parent_id FK
    }

    PRODUCTS {
        uuid id PK
        uuid category_id FK
        string name
        string description
        string default_unit
        boolean is_active
    }

    LISTINGS {
        uuid id PK
        uuid farmer_id FK
        uuid product_id FK
        decimal quantity
        decimal available_quantity
        string unit
        decimal asking_price
        string currency
        string status
        timestamp harvest_date
        timestamp available_until
        timestamp created_at
    }

    LISTING_IMAGES {
        uuid id PK
        uuid listing_id FK
        string object_key
        string image_type
    }

    MARKET_PRICE_OBSERVATIONS {
        uuid id PK
        uuid product_id FK
        uuid district_id FK
        decimal price
        string price_type
        string source
        timestamp observed_at
    }

    USERS ||--o| FARMER_PROFILES : owns
    USERS ||--o| BUYER_PROFILES : owns
    FARMER_PROFILES ||--o{ LISTINGS : creates
    PRODUCT_CATEGORIES ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ LISTINGS : listed_as
    LISTINGS ||--o{ LISTING_IMAGES : contains
    PRODUCTS ||--o{ MARKET_PRICE_OBSERVATIONS : has
```

### **Database ERD — Groups and Collective Selling**

```
erDiagram
    USERS {
        uuid id PK
    }

    FARMER_GROUPS {
        uuid id PK
        string name
        string description
        uuid leader_user_id FK
        string status
        timestamp created_at
    }

    FARMER_GROUP_MEMBERS {
        uuid id PK
        uuid group_id FK
        uuid user_id FK
        string member_status
        timestamp joined_at
    }

    GROUP_COLLECTIONS {
        uuid id PK
        uuid group_id FK
        uuid product_id FK
        decimal target_quantity
        decimal collected_quantity
        string status
    }

    GROUP_CONTRIBUTIONS {
        uuid id PK
        uuid collection_id FK
        uuid farmer_id FK
        decimal quantity
        string verification_status
    }

    USERS ||--o{ FARMER_GROUPS : leads
    FARMER_GROUPS ||--o{ FARMER_GROUP_MEMBERS : has
    USERS ||--o{ FARMER_GROUP_MEMBERS : joins
    FARMER_GROUPS ||--o{ GROUP_COLLECTIONS : organizes
    GROUP_COLLECTIONS ||--o{ GROUP_CONTRIBUTIONS : receives
```

### **Database ERD — Offers, Auctions and Bids**

```
erDiagram
    LISTINGS {
        uuid id PK
    }

    USERS {
        uuid id PK
    }

    OFFERS {
        uuid id PK
        uuid listing_id FK
        uuid buyer_id FK
        decimal offered_price
        decimal quantity
        string status
        timestamp expires_at
        timestamp created_at
    }

    COUNTER_OFFERS {
        uuid id PK
        uuid offer_id FK
        uuid sender_id FK
        decimal proposed_price
        decimal proposed_quantity
        timestamp expires_at
    }

    AUCTIONS {
        uuid id PK
        uuid listing_id FK
        decimal starting_price
        decimal minimum_increment
        decimal reserve_price
        timestamp starts_at
        timestamp ends_at
        string status
    }

    BIDS {
        uuid id PK
        uuid auction_id FK
        uuid buyer_id FK
        decimal bid_amount
        timestamp created_at
    }

    LISTINGS ||--o{ OFFERS : receives
    USERS ||--o{ OFFERS : submits
    OFFERS ||--o{ COUNTER_OFFERS : negotiates
    LISTINGS ||--o| AUCTIONS : may_have
    AUCTIONS ||--o{ BIDS : receives
    USERS ||--o{ BIDS : places
```

### **Database ERD — Orders, Payments and Ledger**

```
erDiagram
    USERS {
        uuid id PK
    }

    LISTINGS {
        uuid id PK
    }

    ORDERS {
        uuid id PK
        string order_number UK
        uuid buyer_id FK
        uuid farmer_id FK
        string status
        decimal subtotal
        decimal delivery_fee
        decimal platform_fee
        decimal total_amount
        string currency
        timestamp created_at
    }

    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        uuid listing_id FK
        decimal quantity
        decimal unit_price
        decimal line_total
    }

    PAYMENTS {
        uuid id PK
        uuid order_id FK
        string provider
        string provider_reference
        decimal amount
        string status
        timestamp verified_at
    }

    PAYMENT_TRANSACTIONS {
        uuid id PK
        uuid payment_id FK
        string transaction_type
        string provider_reference
        string status
        json provider_response
    }

    LEDGER_ACCOUNTS {
        uuid id PK
        string account_code UK
        string account_name
        string account_type
    }

    JOURNAL_ENTRIES {
        uuid id PK
        string reference_type
        uuid reference_id
        string status
        timestamp posted_at
    }

    JOURNAL_LINES {
        uuid id PK
        uuid journal_entry_id FK
        uuid ledger_account_id FK
        decimal debit
        decimal credit
    }

    USERS ||--o{ ORDERS : purchases
    ORDERS ||--|{ ORDER_ITEMS : contains
    LISTINGS ||--o{ ORDER_ITEMS : sold_from
    ORDERS ||--o{ PAYMENTS : paid_through
    PAYMENTS ||--o{ PAYMENT_TRANSACTIONS : records
    JOURNAL_ENTRIES ||--|{ JOURNAL_LINES : contains
    LEDGER_ACCOUNTS ||--o{ JOURNAL_LINES : referenced
```

### **Database ERD — Logistics and Delivery**

```
erDiagram
    USERS {
        uuid id PK
    }

    ORDERS {
        uuid id PK
    }

    TRANSPORTER_PROFILES {
        uuid id PK
        uuid user_id FK
        string verification_status
        string service_area
    }

    VEHICLES {
        uuid id PK
        uuid transporter_id FK
        string vehicle_type
        decimal capacity
        string capacity_unit
        string registration_number
        string status
    }

    SHIPMENTS {
        uuid id PK
        uuid order_id FK
        uuid transporter_id FK
        uuid vehicle_id FK
        string status
        timestamp pickup_at
        timestamp delivered_at
    }

    SHIPMENT_EVENTS {
        uuid id PK
        uuid shipment_id FK
        string event_type
        decimal latitude
        decimal longitude
        timestamp occurred_at
    }

    USERS ||--o| TRANSPORTER_PROFILES : owns
    TRANSPORTER_PROFILES ||--o{ VEHICLES : operates
    TRANSPORTER_PROFILES ||--o{ SHIPMENTS : handles
    VEHICLES ||--o{ SHIPMENTS : assigned
    ORDERS ||--o{ SHIPMENTS : fulfilled_by
    SHIPMENTS ||--o{ SHIPMENT_EVENTS : records
```

### **Database ERD — Quality, Warehouse and Traceability**

```
erDiagram
    PRODUCTS {
        uuid id PK
    }

    USERS {
        uuid id PK
    }

    ORDERS {
        uuid id PK
    }

    QUALITY_INSPECTIONS {
        uuid id PK
        uuid product_id FK
        uuid inspector_id FK
        uuid order_id FK
        string grade
        string result
        json inspection_details
        timestamp inspected_at
    }

    WAREHOUSES {
        uuid id PK
        string name
        string address
        decimal latitude
        decimal longitude
        string status
    }

    INVENTORY_BATCHES {
        uuid id PK
        uuid warehouse_id FK
        uuid product_id FK
        decimal quantity
        string batch_code
        timestamp received_at
    }

    TRACEABILITY_BATCHES {
        uuid id PK
        uuid product_id FK
        uuid farmer_id FK
        string batch_code UK
        string qr_code_reference
        timestamp created_at
    }

    TRACEABILITY_EVENTS {
        uuid id PK
        uuid batch_id FK
        string event_type
        string description
        timestamp occurred_at
    }

    PRODUCTS ||--o{ QUALITY_INSPECTIONS : inspected
    USERS ||--o{ QUALITY_INSPECTIONS : performs
    ORDERS ||--o{ QUALITY_INSPECTIONS : may_require
    WAREHOUSES ||--o{ INVENTORY_BATCHES : stores
    PRODUCTS ||--o{ INVENTORY_BATCHES : stored_as
    PRODUCTS ||--o{ TRACEABILITY_BATCHES : identified_by
    TRACEABILITY_BATCHES ||--o{ TRACEABILITY_EVENTS : records
```

### **Database ERD — Communication, Disputes and AI**

```
erDiagram
    USERS {
        uuid id PK
    }

    ORDERS {
        uuid id PK
    }

    CONVERSATIONS {
        uuid id PK
        string conversation_type
        timestamp created_at
    }

    CONVERSATION_PARTICIPANTS {
        uuid id PK
        uuid conversation_id FK
        uuid user_id FK
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        uuid sender_id FK
        string message_type
        text content
        timestamp created_at
    }

    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        string notification_type
        string title
        string status
        timestamp created_at
    }

    DISPUTES {
        uuid id PK
        uuid order_id FK
        uuid opened_by FK
        string category
        string status
        text description
    }

    DISPUTE_EVIDENCE {
        uuid id PK
        uuid dispute_id FK
        string object_key
        string evidence_type
    }

    AI_PREDICTIONS {
        uuid id PK
        string prediction_type
        uuid entity_id
        json input_snapshot
        json output
        string model_version
        timestamp created_at
    }

    AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        string action
        string entity_type
        uuid entity_id
        json metadata
        timestamp created_at
    }

    USERS ||--o{ CONVERSATION_PARTICIPANTS : participates
    CONVERSATIONS ||--o{ CONVERSATION_PARTICIPANTS : contains
    CONVERSATIONS ||--o{ MESSAGES : contains
    USERS ||--o{ MESSAGES : sends
    USERS ||--o{ NOTIFICATIONS : receives
    ORDERS ||--o{ DISPUTES : may_have
    DISPUTES ||--o{ DISPUTE_EVIDENCE : contains
    USERS ||--o{ AUDIT_LOGS : performs
```

## **6.4 Additional Database Tables**

The diagrams show the core relationships. The production schema should also include:

| Table | Purpose |
| ----- | ----- |
| `districts` | Bangladesh district reference data |
| `upazilas` | Upazila reference data |
| `unions` | Union reference data, if required |
| `units` | Standardized product measurement units |
| `listing_reservations` | Inventory reservations |
| `order_status_history` | Order transition history |
| `payment_webhook_events` | Idempotent webhook processing |
| `refunds` | Refund records |
| `ledger_reversals` | Financial correction references |
| `outbox_events` | Reliable event publication |
| `idempotency_keys` | Duplicate request prevention |
| `file_assets` | Uploaded file metadata |
| `user_consents` | Privacy and consent records |
| `verification_documents` | Account verification evidence |
| `auction_status_history` | Auction transition history |
| `shipment_status_history` | Shipment transition history |
| `notification_preferences` | User notification settings |
| `ai_model_versions` | AI model registry |
| `ai_feedback` | User feedback on AI recommendations |
| `market_data_sources` | External market data provenance |
| `platform_settings` | Configurable business settings |

## **6.5 Important Database Constraints**

### **User constraints**

* Email must be unique when provided.  
* Phone number must be unique when provided.  
* Password hashes must never be returned through public APIs.  
* User status must be controlled through authorized transitions.

### **Listing constraints**

* Quantity must be greater than zero.  
* Available quantity must not be negative.  
* Available quantity must not exceed the original quantity.  
* Asking price must be non-negative.  
* Inactive or expired listings cannot accept new transactions.

### **Auction constraints**

* A bid must meet the minimum increment.  
* Bids must be submitted before the server-controlled closing time.  
* A buyer cannot bid on their own listing.  
* Concurrent bids must be serialized or safely compared within a transaction.

### **Payment constraints**

* Provider references must be unique within the relevant provider scope.  
* A successful payment must have provider verification evidence.  
* Duplicate webhooks must not create duplicate financial postings.  
* Posted journal entries must not be edited or deleted.

### **Ledger constraints**

For each posted journal entry:

\[  
\\sum Debit \= \\sum Credit  
\]

A journal entry must contain at least two valid lines.

Use a database transaction and validation before posting.

## **6.6 Indexing Strategy**

Recommended indexes:

```
CREATE INDEX idx_listings_status
ON listings(status);

CREATE INDEX idx_listings_product_status
ON listings(product_id, status);

CREATE INDEX idx_listings_farmer
ON listings(farmer_id);

CREATE INDEX idx_listings_available_until
ON listings(available_until);

CREATE INDEX idx_orders_buyer_created
ON orders(buyer_id, created_at DESC);

CREATE INDEX idx_orders_farmer_created
ON orders(farmer_id, created_at DESC);

CREATE INDEX idx_bids_auction_amount
ON bids(auction_id, bid_amount DESC);

CREATE INDEX idx_messages_conversation_created
ON messages(conversation_id, created_at DESC);

CREATE INDEX idx_payments_order_status
ON payments(order_id, status);

CREATE INDEX idx_notifications_user_created
ON notifications(user_id, created_at DESC);
```

Use GiST indexes for PostGIS geography columns.

Example:

```
CREATE INDEX idx_farmer_locations_geo
ON farmer_locations
USING GIST(location);
```

The `farmer_locations` table is an optional dedicated location table if a normalized location model is preferred.

## **6.7 Financial Ledger Design**

CROPSY should use double-entry bookkeeping for financial records.

Example accounts:

| Account code | Account |
| ----- | ----- |
| 1000 | Payment provider clearing |
| 1100 | Platform receivable |
| 2000 | Farmer payable |
| 2100 | Buyer refund payable |
| 4000 | Platform commission revenue |
| 5000 | Payment processing expense |

Illustrative accounting flow for a verified transaction:

* Debit payment provider clearing.  
* Credit farmer payable.  
* Credit platform commission revenue.

The exact accounting entries depend on the legal and contractual payment flow.

Do not treat this illustrative example as a finalized accounting policy.

**Financial rules:**

1. Posted journal entries are immutable.  
2. Corrections use reversal or adjustment entries.  
3. Every entry has a reference to its source transaction.  
4. Payment provider reconciliation is required.  
5. Refunds must create traceable financial records.  
6. Payment success must be verified server-side.

---

# **7\. API Architecture and Contracts**

## **7.1 API Standards**

Base URL:

```
/api/v1
```

Format: REST over HTTPS.

Content type:

```
application/json
```

Authentication: Bearer access token or a securely managed session mechanism.

All endpoints must validate input on the server.

## **7.2 Standard Response Format**

Successful response:

```
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "ACTIVE"
  },
  "meta": {
    "requestId": "request-uuid"
  }
}
```

Error response:

```
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The submitted data is invalid.",
    "details": [
      {
        "field": "quantity",
        "message": "Quantity must be greater than zero."
      }
    ]
  },
  "meta": {
    "requestId": "request-uuid"
  }
}
```

## **7.3 HTTP Status Codes**

| Status | Meaning |
| ----- | ----- |
| 200 | Successful request |
| 201 | Resource created |
| 202 | Request accepted for asynchronous processing |
| 204 | Successful request with no response body |
| 400 | Invalid request |
| 401 | Authentication required |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict or invalid state transition |
| 422 | Business rule validation failure |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
| 502 | External provider failure |
| 503 | Service temporarily unavailable |

## **7.4 Authentication APIs**

| Method | Endpoint | Description | Access |
| ----- | ----- | ----- | ----- |
| POST | `/auth/register` | Register account | Public |
| POST | `/auth/login` | Login | Public |
| POST | `/auth/logout` | Logout | Authenticated |
| POST | `/auth/refresh` | Refresh session | Session |
| POST | `/auth/forgot-password` | Request reset | Public |
| POST | `/auth/reset-password` | Reset password | Public |
| POST | `/auth/verify-phone` | Verify phone | Authenticated |
| POST | `/auth/verify-email` | Verify email | Authenticated |
| GET | `/auth/me` | Current user | Authenticated |

### **Register request**

```
{
  "fullName": "Example User",
  "email": "user@example.com",
  "phone": "+8801XXXXXXXXX",
  "password": "StrongPassword",
  "preferredLanguage": "bn",
  "accountType": "FARMER"
}
```

### **Register response**

```
{
  "success": true,
  "data": {
    "userId": "uuid",
    "status": "PENDING_VERIFICATION"
  }
}
```

The backend must normalize and validate email and phone values, hash passwords using a modern password hashing algorithm, and enforce registration policies.

## **7.5 User and Profile APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| GET | `/users/me` | Retrieve own profile |
| PATCH | `/users/me` | Update own profile |
| GET | `/farmers/me` | Retrieve farmer profile |
| PUT | `/farmers/me` | Update farmer profile |
| POST | `/farmers/verification` | Submit verification |
| GET | `/farmers/:id/public` | Public farmer profile |
| GET | `/buyers/me` | Retrieve buyer profile |
| PUT | `/buyers/me` | Update buyer profile |
| POST | `/buyers/verification` | Submit buyer verification |

Sensitive verification documents must be stored privately and accessed through authorized, short-lived links.

## **7.6 Product APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| GET | `/products` | Browse product catalog |
| GET | `/products/:id` | Product details |
| POST | `/products` | Create product, authorized roles only |
| PATCH | `/products/:id` | Update product |
| GET | `/categories` | Product categories |
| GET | `/units` | Measurement units |

## **7.7 Marketplace APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| GET | `/listings` | Search listings |
| GET | `/listings/:id` | Listing details |
| POST | `/listings` | Create listing |
| PATCH | `/listings/:id` | Update listing |
| POST | `/listings/:id/publish` | Publish listing |
| POST | `/listings/:id/pause` | Pause listing |
| POST | `/listings/:id/cancel` | Cancel listing |
| GET | `/listings/:id/availability` | Check availability |

### **Create listing request**

```
{
  "productId": "uuid",
  "quantity": 500,
  "unit": "KG",
  "askingPrice": 45.50,
  "currency": "BDT",
  "harvestDate": "2026-11-20",
  "availableUntil": "2026-12-05T18:00:00Z",
  "location": {
    "districtId": "uuid",
    "upazilaId": "uuid",
    "latitude": 23.8103,
    "longitude": 90.4125
  }
}
```

The backend must validate that the authenticated farmer owns the listing.

### **Listing search query**

```
GET /api/v1/listings
    ?productId=uuid
    &districtId=uuid
    &minPrice=20
    &maxPrice=80
    &minQuantity=100
    &sort=createdAt
    &order=desc
    &page=1
    &limit=20
```

Use bounded pagination. Do not expose unbounded listing queries.

## **7.8 Offers and Auctions APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| POST | `/listings/:id/offers` | Submit offer |
| GET | `/offers/:id` | Retrieve offer |
| POST | `/offers/:id/counter` | Counteroffer |
| POST | `/offers/:id/accept` | Accept offer |
| POST | `/offers/:id/reject` | Reject offer |
| POST | `/auctions` | Create auction |
| GET | `/auctions/:id` | Auction details |
| POST | `/auctions/:id/bids` | Place bid |
| GET | `/auctions/:id/bids` | Bid history |
| POST | `/auctions/:id/cancel` | Cancel eligible auction |

### **Place bid request**

```
{
  "amount": 25000.00,
  "idempotencyKey": "unique-client-generated-key"
}
```

### **Place bid response**

```
{
  "success": true,
  "data": {
    "bidId": "uuid",
    "auctionId": "uuid",
    "amount": 25000.00,
    "status": "ACCEPTED",
    "createdAt": "2026-11-25T10:30:00Z"
  }
}
```

### **Bid processing rules**

The server must:

1. Authenticate the buyer.  
2. Confirm the buyer is eligible.  
3. Load the auction inside a transaction.  
4. Verify auction status and server time.  
5. Lock or serialize the auction's current bid state.  
6. Validate minimum increment.  
7. Insert the bid.  
8. Update the auction's current bid state if stored.  
9. Write an audit/domain event.  
10. Commit the transaction.

A browser countdown is only a visual aid. The server determines whether a bid is on time.

## **7.9 Order APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| POST | `/orders` | Create order |
| GET | `/orders` | List current user's orders |
| GET | `/orders/:id` | Order details |
| POST | `/orders/:id/confirm` | Confirm eligible order |
| POST | `/orders/:id/cancel` | Request cancellation |
| POST | `/orders/:id/complete` | Complete eligible order |
| GET | `/orders/:id/history` | Status history |

### **Create order request**

```
{
  "items": [
    {
      "listingId": "uuid",
      "quantity": 100,
      "unit": "KG"
    }
  ],
  "deliveryAddressId": "uuid",
  "paymentMethod": "ONLINE"
}
```

The server calculates all prices, fees, taxes if applicable, and totals. It must not trust totals supplied by the client.

The API should return an order summary and payment initiation instructions where applicable.

## **7.10 Payment APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| POST | `/payments/initiate` | Start payment |
| GET | `/payments/:id` | Payment status |
| POST | `/payments/:id/verify` | Request verification |
| POST | `/payments/webhooks/:provider` | Provider webhook |
| POST | `/payments/:id/refund` | Request eligible refund |
| GET | `/payments/:id/receipt` | Retrieve receipt |

### **Payment initiation request**

```
{
  "orderId": "uuid",
  "provider": "CONFIGURED_PROVIDER",
  "idempotencyKey": "unique-request-key"
}
```

### **Payment initiation response**

```
{
  "success": true,
  "data": {
    "paymentId": "uuid",
    "status": "PENDING",
    "checkoutUrl": "provider-generated-checkout-url"
  }
}
```

The checkout URL must be generated by the verified provider integration. It must not be fabricated by the application.

### **Webhook contract**

The webhook endpoint must:

* Verify provider signature.  
* Validate event structure.  
* Record the provider event identifier.  
* Reject or safely ignore duplicate events.  
* Verify payment reference and amount.  
* Update payment state through an allowed transition.  
* Create financial journal records exactly once.  
* Return a provider-compatible acknowledgement.

A redirect to a frontend success page does not prove payment success.

## **7.11 Logistics APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| POST | `/shipments` | Create shipment |
| GET | `/shipments/:id` | Shipment details |
| POST | `/shipments/:id/assign` | Assign transporter |
| POST | `/shipments/:id/pickup` | Confirm pickup |
| POST | `/shipments/:id/events` | Add shipment event |
| POST | `/shipments/:id/deliver` | Confirm delivery |
| GET | `/transporters` | Search eligible transporters |
| POST | `/vehicles` | Register vehicle |

Shipment location updates must be permission-checked and rate-limited.

## **7.12 Quality and Warehouse APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| POST | `/quality/inspections` | Create inspection |
| GET | `/quality/inspections/:id` | Inspection details |
| POST | `/warehouses` | Register warehouse |
| GET | `/warehouses` | Search warehouses |
| POST | `/warehouses/:id/batches` | Receive inventory |
| GET | `/warehouses/:id/inventory` | Retrieve inventory |
| GET | `/traceability/:batchCode` | Public traceability lookup |

Inspection results must distinguish verified inspection observations from AI-generated visual estimates.

## **7.13 Communication and Dispute APIs**

| Method | Endpoint | Description |
| ----- | ----- | ----- |
| GET | `/conversations` | List conversations |
| POST | `/conversations` | Create conversation |
| GET | `/conversations/:id/messages` | Message history |
| POST | `/conversations/:id/messages` | Send message |
| GET | `/notifications` | List notifications |
| PATCH | `/notifications/:id/read` | Mark notification read |
| POST | `/disputes` | Open dispute |
| GET | `/disputes/:id` | Dispute details |
| POST | `/disputes/:id/evidence` | Submit evidence |
| POST | `/disputes/:id/resolve` | Resolve dispute, authorized officer |

## **7.14 AI APIs**

The Node.js backend should expose the public application API and call the internal AI service.

The AI service should not be publicly exposed without authentication and access controls.

| Public API | Internal AI capability |
| ----- | ----- |
| POST `/ai/price-forecast` | Price forecasting |
| POST `/ai/matching/recommendations` | Farmer-buyer matching |
| POST `/ai/anomaly-analysis` | Trading anomaly analysis |
| POST `/ai/image-quality-analysis` | Product image analysis |
| POST `/ai/assistant/messages` | Bangla assistant |
| POST `/ai/selling-recommendations` | Net selling comparison |

### **Price forecast request**

```
{
  "productId": "uuid",
  "locationId": "uuid",
  "quantityKg": 500,
  "forecastDays": 7
}
```

### **Price forecast response**

```
{
  "success": true,
  "data": {
    "productId": "uuid",
    "currency": "BDT",
    "unit": "KG",
    "forecast": {
      "lowerEstimate": null,
      "upperEstimate": null,
      "trend": "INSUFFICIENT_DATA"
    },
    "uncertainty": null,
    "modelVersion": null,
    "dataUpdatedAt": null
  }
}
```

Null values are intentional until a valid model and adequate data are available.

The AI response should include:

* Prediction timestamp  
* Data freshness  
* Model version  
* Confidence or uncertainty representation where statistically justified  
* Relevant limitations  
* Whether the model has sufficient data

Never present an uncalibrated score as a probability.

## **7.15 API Security Requirements**

* Authentication on protected endpoints.  
* Role-based authorization.  
* Resource ownership validation.  
* Input schema validation.  
* Output filtering.  
* Rate limiting.  
* Request size limits.  
* Secure file upload validation.  
* Idempotency for financial and other sensitive operations.  
* Audit logging for privileged actions.  
* Consistent error responses.  
* CORS restricted to approved origins.  
* CSRF protection where cookie-based authentication is used.  
* Secure secret management.  
* No passwords, tokens, or sensitive documents in application logs.

---

# **8\. Sequence Diagrams**

## **8.1 Farmer Registration**

```
sequenceDiagram
    actor Farmer
    participant App as Web/Mobile
    participant API as CROPSY API
    participant Auth as Identity Module
    participant DB as PostgreSQL
    participant Notify as Notification Worker

    Farmer->>App: Submit registration
    App->>API: POST /auth/register
    API->>Auth: Validate registration
    Auth->>DB: Check email and phone uniqueness
    DB-->>Auth: Uniqueness result
    Auth->>Auth: Hash password
    Auth->>DB: Create user and profile
    DB-->>Auth: Created
    Auth->>DB: Create verification/outbox event
    Auth-->>API: Registration result
    API-->>App: Pending verification
    Notify->>Farmer: Send verification message
```

## **8.2 Farmer Creates a Listing**

```
sequenceDiagram
    actor Farmer
    participant App
    participant API
    participant Market as Marketplace Service
    participant DB
    participant Queue

    Farmer->>App: Submit product listing
    App->>API: POST /listings
    API->>Market: Create listing command
    Market->>Market: Validate farmer status
    Market->>Market: Validate product and quantity
    Market->>DB: Save listing
    Market->>DB: Save outbox event
    DB-->>Market: Commit
    Market-->>API: Listing created
    API-->>App: 201 Created
    Queue->>Queue: Process listing event
    Queue->>Queue: Trigger search indexing/notification
```

## **8.3 Buyer Places an Auction Bid**

```
sequenceDiagram
    actor Buyer
    participant App
    participant API
    participant Auction as Auction Service
    participant DB
    participant Socket as Real-time Gateway

    Buyer->>App: Submit bid
    App->>API: POST /auctions/:id/bids
    API->>Auction: Place bid command
    Auction->>DB: Begin transaction
    Auction->>DB: Lock auction state
    Auction->>Auction: Validate auction and bid
    Auction->>DB: Insert bid
    Auction->>DB: Update current bid state
    Auction->>DB: Write outbox event
    Auction->>DB: Commit
    Auction-->>API: Bid accepted
    API-->>App: Bid result
    Socket->>App: Broadcast updated auction state
```

## **8.4 Order and Payment**

```
sequenceDiagram
    actor Buyer
    participant App
    participant API
    participant Order as Order Service
    participant DB
    participant Payment as Payment Adapter
    participant Provider as Payment Provider
    participant Worker as Webhook Worker

    Buyer->>App: Checkout
    App->>API: POST /orders
    API->>Order: Create order
    Order->>DB: Validate and reserve inventory
    Order->>DB: Create order
    Order->>DB: Commit transaction
    Order-->>API: Order created
    API-->>App: Order summary

    App->>API: POST /payments/initiate
    API->>Payment: Initiate payment
    Payment->>Provider: Create payment session
    Provider-->>Payment: Checkout reference
    Payment->>DB: Store pending payment
    API-->>App: Checkout URL

    Buyer->>Provider: Complete payment
    Provider->>Worker: Signed webhook
    Worker->>DB: Verify event idempotency
    Worker->>Payment: Verify provider transaction
    Payment->>DB: Update payment and ledger
    Worker->>DB: Write outbox event
    Worker->>DB: Commit transaction
    Worker-->>App: Notify payment status
```

## **8.5 Shipment Delivery**

```
sequenceDiagram
    actor Farmer
    actor Transporter
    actor Buyer
    participant API
    participant Logistics
    participant DB
    participant Notify

    Farmer->>API: Request shipment
    API->>Logistics: Create shipment
    Logistics->>DB: Save shipment
    Logistics-->>API: Shipment created

    Transporter->>API: Accept assignment
    API->>Logistics: Assign transporter
    Logistics->>DB: Update assignment

    Transporter->>API: Confirm pickup
    API->>Logistics: Record pickup
    Logistics->>DB: Save shipment event

    Transporter->>API: Confirm delivery
    API->>Logistics: Record delivery
    Logistics->>DB: Update shipment status
    Logistics->>DB: Write outbox event

    Notify->>Farmer: Delivery update
    Notify->>Buyer: Delivery update
```

## **8.6 AI Price Forecast**

```
sequenceDiagram
    actor Farmer
    participant App
    participant API as Node.js API
    participant AI as Python AI Service
    participant DB as PostgreSQL
    participant Model as Forecast Model

    Farmer->>App: Request price forecast
    App->>API: POST /ai/price-forecast
    API->>API: Authenticate and authorize
    API->>DB: Retrieve eligible market data
    API->>AI: Forecast request
    AI->>AI: Validate feature availability
    AI->>Model: Generate forecast
    Model-->>AI: Prediction and uncertainty
    AI->>AI: Validate output and model status
    AI-->>API: Forecast response
    API->>DB: Store prediction metadata
    API-->>App: Display estimate and limitations
```

---

# **9\. Data Flow Diagrams (DFD)**

DFDs describe how data moves through the system. They are not substitutes for control flow or database transaction design.

## **9.1 Context-Level DFD (Level 0\)**

```
flowchart LR
    FARMER["Farmer"]
    BUYER["Buyer"]
    TRANSPORTER["Transporter"]
    ADMIN["Administrator"]
    PAYMENT["Payment Provider"]
    AI["AI Service"]

    CROPSY(("CROPSY System"))

    FARMER -->|"Listings, profile, harvest data"| CROPSY
    CROPSY -->|"Orders, prices, notifications"| FARMER

    BUYER -->|"Search, offers, orders, payments"| CROPSY
    CROPSY -->|"Listings, order status, recommendations"| BUYER

    TRANSPORTER -->|"Availability, shipment updates"| CROPSY
    CROPSY -->|"Delivery assignments"| TRANSPORTER

    ADMIN -->|"Moderation, configuration"| CROPSY
    CROPSY -->|"Reports, alerts, audit information"| ADMIN

    CROPSY -->|"Payment initiation and verification"| PAYMENT
    PAYMENT -->|"Payment events and status"| CROPSY

    CROPSY -->|"Authorized inference requests"| AI
    AI -->|"Predictions and analysis"| CROPSY
```

## **9.2 Level 1 DFD**

```
flowchart TB
    FARMER["Farmer"]
    BUYER["Buyer"]
    ADMIN["Administrator"]

    P1(("1. Identity Management"))
    P2(("2. Marketplace Management"))
    P3(("3. Trading Management"))
    P4(("4. Order & Payment Management"))
    P5(("5. Logistics Management"))
    P6(("6. AI Intelligence"))
    P7(("7. Administration"))

    D1[("D1: User Database")]
    D2[("D2: Product & Listing Database")]
    D3[("D3: Trading Database")]
    D4[("D4: Order & Ledger Database")]
    D5[("D5: Shipment Database")]
    D6[("D6: AI Prediction Database")]

    FARMER --> P1
    BUYER --> P1
    P1 <--> D1

    FARMER --> P2
    BUYER --> P2
    P2 <--> D2

    BUYER --> P3
    FARMER --> P3
    P3 <--> D3
    P3 --> D2

    BUYER --> P4
    P4 <--> D4
    P4 --> D2

    P4 --> P5
    P5 <--> D5

    P2 --> P6
    P3 --> P6
    P5 --> P6
    P6 <--> D6

    ADMIN --> P7
    P7 <--> D1
    P7 <--> D2
    P7 <--> D3
    P7 <--> D4
```

## **9.3 Level 2 DFD — Marketplace Listing**

```
flowchart TD
    FARMER["Farmer"]
    INPUT(("2.1 Receive Listing"))
    VALIDATE(("2.2 Validate Listing"))
    PRODUCT[("Product Database")]
    PROFILE[("Farmer Profile Database")]
    LISTING(("2.3 Create Listing"))
    STORAGE[("Listing Database")]
    EVENT(("2.4 Publish Listing Event"))
    SEARCH(("2.5 Update Search Index"))

    FARMER --> INPUT
    INPUT --> VALIDATE
    VALIDATE <--> PRODUCT
    VALIDATE <--> PROFILE
    VALIDATE --> LISTING
    LISTING --> STORAGE
    LISTING --> EVENT
    EVENT --> SEARCH
```

## **9.4 Level 2 DFD — Order and Payment**

```
flowchart TD
    BUYER["Buyer"]
    REQUEST(("Receive Checkout Request"))
    VALIDATE(("Validate Buyer and Listing"))
    INVENTORY[("Listing Inventory")]
    CALC(("Calculate Server-Side Price"))
    ORDER(("Create Order"))
    DB[("Order Database")]
    PAYMENT(("Initiate Payment"))
    PROVIDER["Payment Provider"]
    VERIFY(("Verify Payment"))
    LEDGER[("Financial Ledger")]
    RESULT["Payment Status"]

    BUYER --> REQUEST
    REQUEST --> VALIDATE
    VALIDATE <--> INVENTORY
    VALIDATE --> CALC
    CALC --> ORDER
    ORDER --> DB
    ORDER --> PAYMENT
    PAYMENT --> PROVIDER
    PROVIDER --> VERIFY
    VERIFY --> LEDGER
    VERIFY --> RESULT
    RESULT --> BUYER
```

---

# **10\. Control Flow Graphs (CFG)**

A Control Flow Graph represents possible execution paths through a program. The following are conceptual CFGs for critical CROPSY operations.

## **10.1 Listing Creation CFG**

```
flowchart TD
    A([Start]) --> B["Receive listing request"]
    B --> C{"Authenticated?"}

    C -->|No| X["Return 401"]
    C -->|Yes| D{"Farmer permission?"}

    D -->|No| Y["Return 403"]
    D -->|Yes| E["Validate input"]

    E --> F{"Valid input?"}
    F -->|No| Z["Return 422"]
    F -->|Yes| G["Load farmer profile"]

    G --> H{"Verified / eligible?"}
    H -->|No| I["Reject listing"]
    H -->|Yes| J["Validate product"]

    J --> K{"Product active?"}
    K -->|No| L["Reject product"]
    K -->|Yes| M["Create listing"]

    M --> N["Write outbox event"]
    N --> O["Commit transaction"]
    O --> P["Return 201"]
    P --> Q([End])
```

## **10.2 Auction Bid CFG**

```
flowchart TD
    A([Start]) --> B["Receive bid"]
    B --> C{"Authenticated?"}

    C -->|No| X["Reject 401"]
    C -->|Yes| D["Begin transaction"]

    D --> E["Lock auction state"]
    E --> F{"Auction exists?"}

    F -->|No| G["Rollback and return 404"]
    F -->|Yes| H{"Auction active?"}

    H -->|No| I["Rollback and reject"]
    H -->|Yes| J{"Before server deadline?"}

    J -->|No| K["Rollback and reject"]
    J -->|Yes| L{"Buyer eligible?"}

    L -->|No| M["Rollback and reject"]
    L -->|Yes| N{"Minimum increment met?"}

    N -->|No| O["Rollback and reject"]
    N -->|Yes| P["Insert bid"]

    P --> R["Update current bid state"]
    R --> S["Write outbox event"]
    S --> T["Commit transaction"]
    T --> U["Return accepted bid"]
    U --> V([End])
```

## **10.3 Payment Verification CFG**

```
flowchart TD
    A([Start]) --> B["Receive provider webhook"]
    B --> C{"Valid signature?"}

    C -->|No| X["Reject webhook"]
    C -->|Yes| D{"Event already processed?"}

    D -->|Yes| E["Return duplicate acknowledgement"]
    D -->|No| F["Load payment"]

    F --> G{"Payment exists?"}
    G -->|No| H["Record unmatched event for review"]
    G -->|Yes| I["Verify provider reference"]

    I --> J{"Reference and amount match?"}
    J -->|No| K["Flag for reconciliation"]
    J -->|Yes| L{"Allowed payment transition?"}

    L -->|No| M["Reject or record conflict"]
    L -->|Yes| N["Update payment state"]

    N --> O["Create balanced journal entry"]
    O --> P["Record event as processed"]
    P --> Q["Commit transaction"]
    Q --> R["Publish payment event"]
    R --> S([End])
```

## **10.4 Authorization CFG**

```
flowchart TD
    A([Start]) --> B["Receive protected request"]
    B --> C{"Valid authentication?"}

    C -->|No| D["401 Unauthorized"]
    C -->|Yes| E["Load user roles and permissions"]

    E --> F{"Permission granted?"}
    F -->|No| G["403 Forbidden"]
    F -->|Yes| H{"Resource exists?"}

    H -->|No| I["404 Not Found"]
    H -->|Yes| J{"Ownership or scope valid?"}

    J -->|No| K["403 or privacy-safe 404"]
    J -->|Yes| L["Execute use case"]
    L --> M([End])
```

---

# **11\. Business Workflow State Machines**

## **11.1 Listing Lifecycle**

```
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PENDING_REVIEW
    PENDING_REVIEW --> ACTIVE
    PENDING_REVIEW --> REJECTED
    REJECTED --> DRAFT
    ACTIVE --> PAUSED
    PAUSED --> ACTIVE
    ACTIVE --> RESERVED
    RESERVED --> ACTIVE
    RESERVED --> SOLD
    ACTIVE --> EXPIRED
    ACTIVE --> CANCELLED
    PAUSED --> CANCELLED
    SOLD --> [*]
    EXPIRED --> [*]
    CANCELLED --> [*]
```

Only authorized transitions should be allowed. A reserved listing may return to active if the reservation expires or is legitimately cancelled.

## **11.2 Order Lifecycle**

```
stateDiagram-v2
    [*] --> PENDING_CONFIRMATION
    PENDING_CONFIRMATION --> CONFIRMED
    PENDING_CONFIRMATION --> CANCELLED
    CONFIRMED --> PAYMENT_PENDING
    PAYMENT_PENDING --> PAID
    PAYMENT_PENDING --> PAYMENT_FAILED
    PAYMENT_FAILED --> PAYMENT_PENDING
    PAID --> PROCESSING
    PROCESSING --> READY_FOR_PICKUP
    READY_FOR_PICKUP --> IN_TRANSIT
    IN_TRANSIT --> DELIVERED
    DELIVERED --> COMPLETED
    PAID --> REFUND_PENDING
    REFUND_PENDING --> PARTIALLY_REFUNDED
    REFUND_PENDING --> REFUNDED
    COMPLETED --> [*]
    CANCELLED --> [*]
```

The exact relationship between confirmation and payment depends on whether the selected transaction model requires prepayment, payment authorization, or post-delivery payment.

## **11.3 Payment Lifecycle**

```
stateDiagram-v2
    [*] --> CREATED
    CREATED --> PENDING
    PENDING --> PROCESSING
    PROCESSING --> SUCCEEDED
    PROCESSING --> FAILED
    PENDING --> EXPIRED
    SUCCEEDED --> REFUND_PENDING
    REFUND_PENDING --> PARTIALLY_REFUNDED
    REFUND_PENDING --> REFUNDED
    FAILED --> [*]
    EXPIRED --> [*]
    REFUNDED --> [*]
```

Payment states must be reconciled with the actual provider's supported status model.

## **11.4 Shipment Lifecycle**

```
stateDiagram-v2
    [*] --> REQUESTED
    REQUESTED --> ASSIGNED
    ASSIGNED --> ACCEPTED
    ACCEPTED --> PICKED_UP
    PICKED_UP --> IN_TRANSIT
    IN_TRANSIT --> DELIVERED
    REQUESTED --> CANCELLED
    ASSIGNED --> CANCELLED
    ACCEPTED --> CANCELLED
    IN_TRANSIT --> DELIVERY_EXCEPTION
    DELIVERY_EXCEPTION --> IN_TRANSIT
    DELIVERY_EXCEPTION --> RETURNED
    DELIVERED --> [*]
    RETURNED --> [*]
    CANCELLED --> [*]
```

---

# **12\. Authentication and Authorization Architecture**

## **12.1 Role-Based Access Control**

Recommended roles:

* SUPER\_ADMIN  
* DISTRICT\_ADMIN  
* UPAZILA\_COORDINATOR  
* FARMER  
* FARMER\_GROUP\_LEADER  
* WHOLESALER  
* RETAILER  
* INSTITUTIONAL\_BUYER  
* CONSUMER  
* TRANSPORTER  
* QUALITY\_INSPECTOR  
* WAREHOUSE\_MANAGER  
* PAYMENT\_OFFICER  
* DISPUTE\_OFFICER

Roles must map to granular permissions.

Example:

| Permission | Farmer | Buyer | Transporter | Admin |
| ----- | ----- | ----- | ----- | ----- |
| Create own listing | Yes | No | No | Configurable |
| Browse listings | Yes | Yes | Limited | Yes |
| Place bid | No | Yes | No | No |
| Manage own order | Yes | Yes | No | Yes |
| Update assigned shipment | No | No | Yes | Yes |
| Verify farmer | No | No | No | Authorized roles |
| Resolve dispute | No | No | No | Authorized roles |
| View financial reports | Own records | Own records | No | Authorized roles |

Permission checks must also enforce resource ownership, geographic scope, and assignment relationships.

## **12.2 Authentication Flow**

1. User submits credentials.  
2. Backend validates credentials.  
3. Backend checks account status.  
4. Backend creates a session.  
5. Backend returns a short-lived access credential and securely managed refresh credential.  
6. Refresh operations rotate credentials.  
7. Logout revokes the relevant session.

For web, prefer secure, HttpOnly, Secure, SameSite cookies when the deployment architecture supports them safely.

For mobile, store refresh credentials in platform-secure storage.

## **12.3 Security Controls**

* Password hashing using Argon2id or an appropriately configured modern alternative.  
* Multi-factor authentication for privileged accounts.  
* Refresh-token rotation.  
* Login rate limiting.  
* Account recovery safeguards.  
* RBAC and ownership checks.  
* Secure file upload scanning.  
* Audit logs.  
* Encryption in transit.  
* Encryption at rest where supported.  
* Secret management.  
* Database least-privilege access.  
* Dependency vulnerability scanning.  
* Security testing before production release.

---

# **13\. AI System Architecture**

## **13.1 AI Service Boundary**

The AI service is separate from the core transaction system.

```
flowchart TB
    CLIENT["Web / Mobile"]
    API["Node.js Backend"]
    ADAPTER["AI Adapter"]
    FASTAPI["Python FastAPI"]

    DATA["Verified CROPSY Data"]
    FEATURE["Feature Engineering"]
    PRICE["Price Forecasting"]
    MATCH["Buyer-Farmer Matching"]
    ANOMALY["Trading Anomaly Detection"]
    VISION["Product Image Analysis"]
    ASSISTANT["Bangla AI Assistant"]

    REGISTRY["Model Registry"]
    FEEDBACK["Prediction Feedback"]

    CLIENT --> API
    API --> ADAPTER
    ADAPTER --> FASTAPI
    DATA --> FEATURE
    FASTAPI --> FEATURE

    FEATURE --> PRICE
    FEATURE --> MATCH
    FEATURE --> ANOMALY
    FASTAPI --> VISION
    FASTAPI --> ASSISTANT

    PRICE --> REGISTRY
    MATCH --> REGISTRY
    ANOMALY --> REGISTRY
    VISION --> REGISTRY

    FASTAPI --> API
    API --> CLIENT
    CLIENT --> FEEDBACK
```

## **13.2 AI Module Specifications**

### **A. Price Forecasting**

Inputs:

* Product  
* Geographic location  
* Historical market prices  
* Seasonality  
* Verified transaction prices  
* Supply and demand indicators

Potential models:

* SARIMAX  
* XGBoost  
* LightGBM  
* Other validated time-series methods

Outputs:

* Estimated price range  
* Trend  
* Forecast horizon  
* Uncertainty  
* Data freshness  
* Model version

Do not display a forecast as reliable when the data is insufficient.

### **B. Farmer-Buyer Matching**

Initial implementation: rule-based ranking.

Candidate factors:

* Product compatibility  
* Quantity compatibility  
* Buyer location  
* Delivery distance  
* Quality requirements  
* Delivery availability  
* Transport cost  
* Buyer reliability indicators

A matching score is a ranking signal, not a guaranteed probability of transaction.

### **C. Trading Anomaly Detection**

Potential indicators:

* Repeated unusual bidding patterns  
* Abnormal cancellation rates  
* Unusual buyer concentration  
* Repeated account relationships  
* Sudden price deviations  
* Unusual timing patterns

Potential methods:

* Statistical anomaly detection  
* Isolation Forest  
* Graph analysis  
* Supervised classification when verified labels exist

**Critical policy:** An anomaly is not proof of collusion, fraud, or criminal conduct. It must trigger human review, not automatic punishment.

### **D. Computer Vision**

Potential capabilities:

* Surface damage detection  
* Color consistency  
* Size estimation  
* Visible defect classification  
* Maturity classification for supported crops

Potential stack:

* OpenCV  
* PyTorch  
* YOLO  
* MobileNet  
* EfficientNet

Image analysis cannot establish pesticide residue, internal contamination, or food safety without appropriate testing.

### **E. Bangla AI Assistant**

Capabilities:

* Explain marketplace workflows.  
* Retrieve relevant market information.  
* Help users create listings.  
* Explain offers and orders.  
* Answer platform support questions.  
* Guide users through agricultural workflows.

The assistant must retrieve live transaction information from authorized APIs rather than inventing it.

For purchases, bids, payments, account deletion, or other consequential operations, explicit user confirmation is required.

## **13.3 AI Cold-Start Strategy**

1. Collect market data with source and timestamp.  
2. Build price comparison before predictive forecasting.  
3. Start matching with transparent rules.  
4. Measure data completeness and quality.  
5. Establish training and evaluation datasets.  
6. Validate models against appropriate baselines.  
7. Deploy only models that meet documented evaluation criteria.  
8. Monitor drift and prediction quality.  
9. Retain human review for consequential decisions.

---

# **14\. Data Flow and Event Architecture**

## **14.1 Domain Events**

Suggested event names:

```
UserRegistered
UserVerified
FarmerVerified
BuyerVerified
ListingCreated
ListingPublished
ListingExpired
OfferSubmitted
OfferAccepted
AuctionBidPlaced
AuctionClosed
OrderCreated
OrderConfirmed
PaymentInitiated
PaymentVerified
PaymentFailed
RefundCompleted
ShipmentAssigned
ShipmentPickedUp
ShipmentDelivered
QualityInspectionCompleted
DisputeOpened
DisputeResolved
AIRecommendationGenerated
```

## **14.2 Event Processing**

Example:

```
OrderCreated
    |
    +--> Reserve inventory
    |
    +--> Notify farmer
    |
    +--> Notify buyer
    |
    +--> Create payment workflow
    |
    +--> Update analytics
```

For critical transactional operations, inventory reservation and order creation should happen synchronously within an appropriate database transaction.

Notifications and analytics should normally happen asynchronously.

## **14.3 Reliability Rules**

* Events should have unique IDs.  
* Consumers must be idempotent.  
* Retries must use backoff.  
* Failed events should enter a dead-letter or failure-review mechanism.  
* Event payloads should be versioned.  
* Sensitive personal information should not be unnecessarily copied into event payloads.  
* Outbox records should be retained according to an operational retention policy.

---

# **15\. Non-Functional Design**

## **15.1 Performance**

Initial engineering targets, subject to validation through load testing:

| Area | Proposed target |
| ----- | ----- |
| Standard API p95 latency | Below 500 ms under agreed normal-load profile |
| Listing search | Below 1 second under agreed normal-load profile |
| Paginated API responses | Bounded response size |
| Auction bid processing | Transactionally correct under concurrent load |
| Background processing | Retryable and observable |
| Image delivery | CDN-backed where appropriate |

These are design targets, not measured performance results.

## **15.2 Scalability**

Initial design:

* Modular monolith  
* Stateless API instances  
* PostgreSQL  
* Redis  
* Background workers  
* Object storage  
* CDN

Scaling path:

**Stage 1 — Initial release**

* One modular API deployment  
* One primary PostgreSQL database  
* Redis  
* Background workers  
* Independent AI service

**Stage 2 — Growing traffic**

* Multiple API instances  
* Load balancer  
* Shared Redis  
* Separate worker processes  
* CDN  
* Database monitoring and query optimization

**Stage 3 — High transaction volume**

* Read replicas where justified  
* Table partitioning for large event/history tables  
* Dedicated search infrastructure if necessary  
* Separate AI inference scaling  
* Extract selected high-load modules only when evidence supports it

**Stage 4 — Large-scale platform**

Potential service extraction:

* Search service  
* Notification service  
* AI inference service  
* Real-time communication service  
* Payment integration service  
* Logistics optimization service

Do not split services merely because the system has many modules.

## **15.3 Availability and Recovery**

Define operational objectives before production.

Proposed initial planning targets:

* RPO: 15 minutes or better, depending on database backup and replication design.  
* RTO: 4 hours or better for the initial production environment.

These are proposed targets, not guaranteed service levels.

Requirements:

* Automated backups  
* Restore testing  
* Database migration rollback strategy  
* Incident response procedures  
* Monitoring and alerting  
* Provider outage handling  
* Queue recovery procedures

## **15.4 Localization**

* Bangla-first interface.  
* English language option.  
* Bangladesh phone number validation.  
* BDT currency formatting.  
* Bangladesh geographic hierarchy.  
* Localized date, number, and unit formatting.  
* Avoid hardcoded text in UI components.

## **15.5 Accessibility and Usability**

Target: WCAG 2.2 AA for the web interface where applicable.

Mobile design should include:

* Large touch targets  
* Screen reader labels  
* Clear error messages  
* High contrast  
* Simple navigation  
* Low-bandwidth behavior  
* Image compression  
* Offline drafts

Offline actions must not falsely imply that a payment, bid, or order has been committed.

---

# **16\. Deployment Architecture**

## **16.1 Deployment Design**

```
flowchart TB
    USERS["Users"]

    CDN["CDN / WAF"]
    WEB["Next.js Web Hosting"]
    API["Node.js API Hosting"]
    WORKER["Background Worker Hosting"]
    AI["Python AI Hosting"]

    DB[("Managed PostgreSQL + PostGIS")]
    REDIS[("Managed Redis")]
    STORAGE["Object Storage"]
    MONITOR["Monitoring and Error Tracking"]

    USERS --> CDN
    CDN --> WEB
    USERS --> API

    WEB --> API
    API --> DB
    API --> REDIS
    API --> STORAGE
    API --> AI

    WORKER --> DB
    WORKER --> REDIS
    WORKER --> STORAGE

    API --> MONITOR
    WORKER --> MONITOR
    AI --> MONITOR
```

## **16.2 Hosting Responsibilities**

| Component | Hosting requirement |
| ----- | ----- |
| Next.js frontend | Web hosting platform |
| Node.js API | Persistent Node.js application hosting |
| Worker | Persistent background process hosting |
| PostgreSQL | Managed PostgreSQL |
| Redis | Managed Redis |
| AI service | Python-compatible application hosting |
| File storage | S3-compatible object storage |
| Mobile applications | Google Play / Apple App Store distribution |

Vercel can be used for the Next.js web application. Do not assume it is suitable for every long-running worker, persistent process, or AI inference workload.

## **16.3 Environment Variables**

Example `.env.example`:

```
NODE_ENV=development
PORT=4000

DATABASE_URL=
REDIS_URL=

ACCESS_TOKEN_SECRET=
REFRESH_TOKEN_SECRET=

OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_ACCESS_KEY=
OBJECT_STORAGE_SECRET_KEY=

AI_SERVICE_URL=
AI_SERVICE_SECRET=

PAYMENT_PROVIDER=
PAYMENT_PROVIDER_SECRET=
PAYMENT_WEBHOOK_SECRET=

EMAIL_PROVIDER_API_KEY=
SMS_PROVIDER_API_KEY=

WEB_APP_URL=
MOBILE_DEEP_LINK_SCHEME=
```

Never commit actual secrets to Git.

## **16.4 CI/CD Pipeline**

```
flowchart TD
    A["Developer Pushes Code"] --> B["Git Repository"]
    B --> C["Lint and Formatting"]
    C --> D["Unit Tests"]
    D --> E["Integration Tests"]
    E --> F["Security and Dependency Scan"]
    F --> G["Build Artifacts"]
    G --> H{"Approved Deployment?"}
    H -->|No| I["Wait for Approval"]
    H -->|Yes| J["Deploy Staging"]
    J --> K["Smoke and E2E Tests"]
    K --> L{"Release Approved?"}
    L -->|No| M["Rollback / Fix"]
    L -->|Yes| N["Deploy Production"]
    N --> O["Monitor Health"]
```

Database migrations should be backward-compatible where possible. Deploy schema changes and application changes in a safe sequence.

---

# **17\. Architecture Decision Records (ADR)**

## **ADR-001: Modular Monolith**

**Decision:** Use a modular monolith for the initial backend.

**Reason:**

* Small development team.  
* Easier deployment.  
* Lower infrastructure cost.  
* Simpler transactions.  
* Clear module boundaries.

**Consequences:**

* Modules must remain isolated.  
* Shared database access must be controlled.  
* High-load modules can be extracted later.

## **ADR-002: PostgreSQL as Primary Database**

**Decision:** Use PostgreSQL.

**Reason:**

* Relational integrity.  
* Transaction support.  
* Complex querying.  
* PostGIS support.  
* Mature indexing.

**Consequence:** Database migrations and query performance must be carefully managed.

## **ADR-003: JavaScript for the Main Application**

**Decision:** Use JavaScript for Next.js, React Native, and Node.js.

**Reason:**

* Consistent main application language.  
* Shared validation and API client packages.  
* User's preferred development language.

**Consequence:** Enforce code quality through linting, runtime validation, tests, and clear interfaces. TypeScript is not required for this baseline.

## **ADR-004: Python for AI**

**Decision:** Use a separate Python FastAPI service for ML workloads.

**Reason:**

* Mature ML ecosystem.  
* PyTorch, Scikit-learn, XGBoost, and data tooling.  
* Independent model deployment.

**Consequence:** Requires secure service-to-service authentication and versioned API contracts.

## **ADR-005: REST API for Core Application**

**Decision:** Use REST for the initial application API.

**Reason:**

* Simplicity.  
* Broad client support.  
* Easy documentation.  
* Suitable for web and mobile.

**Consequence:** Use Socket.IO only for real-time communication where needed.

## **ADR-006: Redis and Background Workers**

**Decision:** Use Redis and BullMQ.

**Reason:**

* Background notifications.  
* Asynchronous file processing.  
* Retryable tasks.  
* Scheduled auction processing.  
* Non-blocking AI jobs.

**Consequence:** Jobs must be idempotent and observable.

## **ADR-007: Double-Entry Ledger**

**Decision:** Maintain a double-entry ledger for platform financial records.

**Reason:**

* Traceability.  
* Reconciliation.  
* Financial auditability.  
* Reversible corrections.

**Consequence:** Accounting rules and account ownership must be reviewed before production.

## **ADR-008: AI as Decision Support**

**Decision:** AI cannot autonomously execute consequential marketplace actions.

**Reason:**

* Explainability.  
* Human accountability.  
* Data uncertainty.  
* Protection against harmful automated decisions.

**Consequence:** AI recommendations must display limitations and retain human confirmation for consequential actions.

## **ADR-009: Server-Authoritative Transactions**

**Decision:** The backend is authoritative for bids, inventory, orders, and payments.

**Reason:**

* Prevent client manipulation.  
* Handle concurrent requests.  
* Preserve transactional consistency.

**Consequence:** Client-side calculations and timers are informational only.

## **ADR-010: Object Storage for Media**

**Decision:** Store images and documents in object storage, not as database binary records.

**Reason:**

* Better media delivery.  
* Independent storage scaling.  
* CDN integration.

**Consequence:** Store object keys and metadata in PostgreSQL; enforce access control and lifecycle policies.

---

# **18\. Testing Strategy**

## **18.1 Testing Layers**

| Test type | Purpose |
| ----- | ----- |
| Unit testing | Individual business rules |
| Integration testing | Database and module interaction |
| API testing | HTTP contract validation |
| E2E testing | Full user workflows |
| Mobile testing | Android/iOS workflows |
| Load testing | Performance and concurrency |
| Security testing | Authorization and vulnerability testing |
| Recovery testing | Backup and restoration |
| AI evaluation | Model quality and limitations |

## **18.2 Critical Test Scenarios**

### **Authentication**

* Duplicate email registration.  
* Duplicate phone registration.  
* Invalid credentials.  
* Expired session.  
* Revoked refresh token.  
* Unverified account restrictions.

### **Marketplace**

* Farmer creates valid listing.  
* Invalid product rejected.  
* Negative quantity rejected.  
* Unavailable listing cannot be purchased.  
* Unauthorized user cannot edit another farmer's listing.

### **Auctions**

* Valid bid accepted.  
* Bid below minimum rejected.  
* Expired auction rejects bid.  
* Concurrent bids preserve correct ordering.  
* Seller cannot bid on own auction.  
* Duplicate idempotency key does not create duplicate bid.

### **Orders**

* Buyer can create valid order.  
* Inventory cannot be oversold.  
* Two concurrent orders cannot reserve the same remaining quantity.  
* Unauthorized users cannot view private orders.  
* Invalid state transitions are rejected.

### **Payments**

* Valid webhook updates payment.  
* Invalid signature is rejected.  
* Duplicate webhook is idempotent.  
* Amount mismatch is flagged.  
* Provider timeout does not falsely mark payment successful.  
* Refund is reconciled.

### **Logistics**

* Unauthorized transporter cannot update shipment.  
* Shipment cannot be delivered before pickup.  
* Invalid status transitions are rejected.  
* Delivery events are auditable.

### **AI**

* Missing data produces an appropriate insufficient-data response.  
* Prediction output includes model version.  
* AI service outage does not corrupt orders.  
* AI cannot bypass backend authorization.  
* Anomaly alerts do not automatically punish users.

---

# **19\. Observability and Monitoring**

## **19.1 Application Metrics**

Monitor:

* API request rate  
* API error rate  
* p50, p95, and p99 latency  
* Database query latency  
* Connection pool utilization  
* Redis availability  
* Queue depth  
* Failed job count  
* Payment verification failures  
* Webhook processing delays  
* Auction bid conflicts  
* Inventory reservation conflicts  
* AI inference latency  
* AI model errors

## **19.2 Business Metrics**

Monitor:

* Active farmers  
* Active buyers  
* Listings created  
* Listings sold  
* Order completion rate  
* Average time to sell  
* Transaction volume  
* Farmer net proceeds  
* Buyer procurement cost  
* Shipment completion rate  
* Dispute rate  
* Payment failure rate  
* Market concentration indicators

Metrics should be defined consistently and reported with their calculation methodology.

## **19.3 Audit Logging**

Audit events should include:

* Actor ID  
* Action  
* Entity type  
* Entity ID  
* Timestamp  
* Request ID  
* Relevant metadata  
* Reason for privileged changes, where required

Do not log passwords, access tokens, full payment credentials, or unnecessary personal data.

---

# **20\. Critical Engineering Risks and Mitigations**

| Risk | Impact | Mitigation |
| ----- | ----- | ----- |
| Concurrent bidding | Incorrect auction result | Transactional locking and concurrency tests |
| Inventory overselling | Financial and trust damage | Atomic reservation and database constraints |
| Duplicate payment webhook | Duplicate ledger posting | Idempotent event processing |
| False payment confirmation | Financial loss | Provider-side verification |
| AI inaccurate forecast | Misleading decisions | Uncertainty, validation, and clear limitations |
| False anomaly alert | Unfair treatment | Human review and appeal |
| Data leakage | Privacy harm | RBAC, ownership checks, encryption |
| Fake listings | Market manipulation | Verification and moderation |
| Low-quality market data | Poor AI results | Provenance and data-quality monitoring |
| Network instability | Failed workflows | Retry-safe operations and clear status |
| Provider outage | Service interruption | Timeouts, retries, circuit breakers |
| Rapid system growth | Maintenance difficulty | Module boundaries and architectural reviews |

---

# **21\. Implementation Roadmap**

The following is a proposed sequence, not a fixed delivery commitment.

## **Phase 1 — Architecture and Foundation**

Deliverables:

* Finalized requirements  
* Repository structure  
* Development environments  
* PostgreSQL schema baseline  
* Authentication  
* RBAC  
* API conventions  
* Logging and error handling  
* CI pipeline

## **Phase 2 — User and Farmer Management**

Deliverables:

* Registration and login  
* Farmer profile  
* Buyer profile  
* Verification workflows  
* Location management  
* Admin user management

## **Phase 3 — Product and Marketplace**

Deliverables:

* Product catalog  
* Categories and units  
* Listing creation  
* Listing management  
* Search and filtering  
* Image upload  
* Price observations

## **Phase 4 — Trading**

Deliverables:

* Buyer offers  
* Counteroffers  
* Offer acceptance  
* Auction creation  
* Bidding  
* Auction closure  
* Concurrency testing

## **Phase 5 — Orders and Finance**

Deliverables:

* Order creation  
* Inventory reservation  
* Order history  
* Payment adapter  
* Provider integration  
* Webhook verification  
* Financial ledger  
* Refund workflow

## **Phase 6 — Logistics and Quality**

Deliverables:

* Transporter profiles  
* Vehicle management  
* Shipment assignment  
* Delivery tracking  
* Quality inspection  
* Warehouse management  
* QR traceability

## **Phase 7 — Communication and Administration**

Deliverables:

* Buyer-farmer chat  
* Notifications  
* Dispute management  
* Admin dashboards  
* Audit logs  
* Operational reports

## **Phase 8 — AI Intelligence**

Deliverables:

* Data collection pipelines  
* Price comparison  
* Rule-based matching  
* Forecast evaluation  
* Anomaly detection  
* Computer vision prototype  
* Bangla assistant prototype

## **Phase 9 — Testing and Production**

Deliverables:

* Security testing  
* Load testing  
* E2E testing  
* Mobile testing  
* Backup and restore validation  
* Production deployment  
* Monitoring and incident response

---

# **22\. Minimum Viable Product (MVP)**

The first production-oriented MVP should prioritize a complete and reliable transaction workflow.

## **MVP Modules**

1. Authentication and authorization  
2. Farmer and buyer profiles  
3. Farmer verification  
4. Product catalog  
5. Marketplace listings  
6. Listing search and filtering  
7. Buyer offers  
8. Basic auction functionality, if operational rules are finalized  
9. Order management  
10. One approved payment-provider integration  
11. Basic financial ledger  
12. Admin dashboard  
13. Basic notifications  
14. Web application  
15. Android and iOS applications using the shared backend

## **Defer Until Later**

* Advanced GraphRAG  
* Large-scale autonomous agents  
* Advanced computer vision  
* Complex route optimization  
* Predictive spoilage analytics  
* Automated market manipulation classification  
* Microservices migration

These features should be implemented only after the foundational transaction workflows and data collection are reliable.

---

# **23\. Architecture Acceptance Criteria**

The initial architecture is ready for implementation when:

* All major modules have defined responsibilities.  
* No circular module dependencies exist.  
* The database ERD has been reviewed.  
* All critical foreign keys and constraints are defined.  
* API request and response schemas are documented.  
* Authentication and authorization rules are documented.  
* Order and payment state machines are approved.  
* Auction concurrency rules are documented.  
* Inventory reservation rules are documented.  
* Payment webhook idempotency is designed.  
* Financial ledger rules are reviewed.  
* AI service boundaries are documented.  
* Audit logging requirements are defined.  
* Backup and recovery objectives are approved.  
* Deployment responsibilities are assigned.  
* Critical test cases are defined.

---

# **24\. Open Design Decisions Requiring Business Confirmation**

The following decisions should not be silently hardcoded during development.

| Decision | Why it matters | Required confirmation |
| ----- | ----- | ----- |
| Payment provider | Integration and settlement design | Select approved provider |
| Platform commission | Financial calculations | Fixed, percentage, tiered, or configurable |
| Auction model | Bid validation and closure | English auction or another model |
| Reserve price | Auction acceptance | Optional or mandatory |
| Auction extension | Last-second bid handling | Whether closing time extends |
| Buyer payment timing | Order workflow | Before shipment, after delivery, or other |
| Farmer settlement | Financial workflow | Settlement and payout rules |
| Cancellation policy | Inventory and refund handling | Role-specific conditions |
| Delivery responsibility | Logistics workflow | Buyer, farmer, or platform |
| Quality grading | Inspection model | Product-specific grading rules |
| Verification policy | Trust and compliance | Required evidence by role |
| Geographic hierarchy | Search and reporting | District/upazila/union coverage |
| AI data sources | Forecast reliability | Permitted sources and licensing |
| Data retention | Privacy and operations | Retention and deletion policy |
| Hosting provider | Deployment and cost | Confirm provider and budget |

---

# **25\. Final Architecture Recommendation**

CROPSY should be built as a cross-platform agricultural marketplace supported by a modular backend, a transactional relational database, and an independent AI intelligence layer.

The recommended technical foundation is:

```
Frontend:
    Next.js + React + JavaScript

Mobile:
    React Native + Expo + JavaScript

Backend:
    Node.js + Fastify + JavaScript

Architecture:
    Modular Monolith
    Clean Architecture
    Domain-Driven Design principles

Database:
    PostgreSQL + PostGIS

ORM:
    Prisma

Cache:
    Redis

Background Jobs:
    BullMQ

Real-Time:
    Socket.IO

AI:
    Python + FastAPI
    Scikit-learn
    XGBoost / LightGBM
    PyTorch
    OpenCV

Storage:
    S3-compatible object storage

Testing:
    Jest / Vitest
    Playwright
    Maestro
    k6

Monitoring:
    OpenTelemetry
    Grafana
    Sentry
```

The most important architectural principle is to protect the integrity of the marketplace's core transactions.

Listings, bids, orders, inventory, payments, refunds, and financial records must be controlled by the backend and persisted transactionally. AI should improve information quality and decision-making without replacing user consent, financial controls, or human review.

**CROPSY's implementation priority should be: reliable marketplace → trustworthy transactions → logistics and traceability → data collection → validated AI intelligence → incremental scaling.**

---

**End of Software Design Document — Version 1.0**

**Document status:** Proposed baseline. Database migrations, complete OpenAPI specifications, provider-specific payment contracts, and production infrastructure configurations should be generated and reviewed during implementation.

