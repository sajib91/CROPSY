# Entity-relationship diagram

Entity names are the `@@map` table names from [`schema.prisma`](../../apps/api/prisma/schema.prisma). Attribute lists are abbreviated to primary keys, foreign keys, and representative business columns; the complete column list is in the schema.

Cardinality notation follows Mermaid: `||` = exactly one, `o|` / `|o` = zero or one, `o{` / `}o` = zero or more. The marker beside an entity describes how many rows of **that** entity relate to one row on the other side. Optional FKs are drawn as `|o--o{`; required FKs as `||--o{`. Relationship labels use the Prisma relation/FK names.

## Geography

```mermaid
erDiagram
  countries {
    uuid id PK
    varchar code UK
    varchar name
    varchar name_bn
    boolean is_active
  }
  divisions {
    uuid id PK
    uuid country_id FK
    varchar code UK
    varchar name
    varchar name_bn
  }
  districts {
    uuid id PK
    uuid division_id FK
    varchar code UK
    varchar name
    varchar name_bn
  }
  upazilas {
    uuid id PK
    uuid district_id FK
    varchar code UK
    varchar name
    varchar name_bn
  }
  unions {
    uuid id PK
    uuid upazila_id FK
    varchar code UK
    varchar name
    varchar name_bn
  }

  countries ||--o{ divisions : country
  divisions ||--o{ districts : division
  districts ||--o{ upazilas : district
  upazilas ||--o{ unions : upazila
```

## Identity and organization

```mermaid
erDiagram
  users {
    uuid id PK
    varchar email
    varchar phone UK
    text password_hash
    AccountStatus account_status
    boolean is_email_verified
    boolean is_phone_verified
    int failed_login_attempts
  }
  user_profiles {
    uuid id PK
    uuid user_id FK
    varchar first_name
    varchar last_name
    varchar name_bn
    varchar avatar_url
    date date_of_birth
    Gender gender
    varchar national_id_hash UK
    PreferredLanguage preferred_language
    char default_currency
  }
  roles {
    uuid id PK
    varchar code UK
    RoleScope scope
    boolean is_system
  }
  permissions {
    uuid id PK
    varchar code UK
    varchar resource
    varchar action
  }
  user_roles {
    uuid id PK
    uuid user_id FK
    uuid role_id FK
    uuid organization_id FK
    varchar scope_key
    uuid granted_by_user_id FK
  }
  role_permissions {
    uuid id PK
    uuid role_id FK
    uuid permission_id FK
  }
  sessions {
    uuid id PK
    uuid user_id FK
    varchar session_token_hash UK
    timestamp expires_at
  }
  refresh_tokens {
    uuid id PK
    uuid user_id FK
    uuid session_id FK
    varchar token_hash UK
    uuid rotated_to_id FK
  }
  otp_verifications {
    uuid id PK
    uuid user_id FK
    OtpPurpose purpose
    varchar code_hash
    timestamp expires_at
  }
  organizations {
    uuid id PK
    varchar slug UK
    uuid owner_user_id FK
    OrganizationType organization_type
    VerificationStatus verification_status
    varchar verification_note
    timestamp verified_at
    uuid verified_by_user_id FK
    varchar contact_email
    varchar contact_phone
    text description
    varchar website
    OrganizationStatus status
    char default_currency
    timestamp deleted_at
  }
  organization_members {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    OrganizationMemberStatus status
  }
  organization_invitations {
    uuid id PK
    uuid organization_id FK
    varchar email
    uuid role_id FK
    uuid invited_by_user_id FK
    varchar token_hash UK
    InvitationStatus status
    timestamp expires_at
    timestamp accepted_at
  }
  organization_addresses {
    uuid id PK
    uuid organization_id FK
    varchar label
    uuid division_id FK
    uuid district_id FK
    uuid upazila_id FK
    uuid union_id FK
    geometry location
    boolean is_primary
  }
  organization_documents {
    uuid id PK
    uuid organization_id FK
    uuid uploaded_by_user_id FK
    OrganizationDocumentType document_type
    varchar file_name
    text file_url
    VerificationStatus verification_status
  }
  user_addresses {
    uuid id PK
    uuid user_id FK
    varchar label
    uuid division_id FK
    uuid district_id FK
    uuid upazila_id FK
    uuid union_id FK
    geometry location
    boolean is_primary
  }
  notification_preferences {
    uuid id PK
    uuid user_id FK
    NotificationChannel channel
    varchar event_type
    boolean enabled
  }
  role_profile_extensions {
    uuid id PK
    uuid user_id FK
    varchar role_code
    uuid organization_id FK
    varchar scope_key
    jsonb data
  }

  users ||--o| user_profiles : user
  users ||--o{ user_roles : user
  roles ||--o{ user_roles : role
  organizations |o--o{ user_roles : organization
  users |o--o{ user_roles : granted_by
  roles ||--o{ role_permissions : role
  permissions ||--o{ role_permissions : permission
  users ||--o{ sessions : user
  sessions |o--o{ refresh_tokens : session
  users ||--o{ refresh_tokens : user
  refresh_tokens |o--o{ refresh_tokens : rotated_to
  users |o--o{ otp_verifications : user
  users ||--o{ organizations : owner
  users |o--o{ organizations : verified_by
  organizations ||--o{ organization_members : organization
  users ||--o{ organization_members : user
  organizations ||--o{ organization_invitations : organization
  roles ||--o{ organization_invitations : role
  users ||--o{ organization_invitations : invited_by
  organizations ||--o{ organization_addresses : organization
  divisions |o--o{ organization_addresses : division
  districts |o--o{ organization_addresses : district
  upazilas |o--o{ organization_addresses : upazila
  unions |o--o{ organization_addresses : union
  organizations ||--o{ organization_documents : documents
  users ||--o{ organization_documents : uploaded_by
  users ||--o{ user_addresses : user
  divisions |o--o{ user_addresses : division
  districts |o--o{ user_addresses : district
  upazilas |o--o{ user_addresses : upazila
  unions |o--o{ user_addresses : union
  users ||--o{ notification_preferences : user
  users ||--o{ role_profile_extensions : user
  organizations |o--o{ role_profile_extensions : organization
```

`users.email` is nullable for phone-only accounts; uniqueness is enforced by
`users_email_not_null_key`, a partial index over non-null values. `OtpPurpose`
includes `ACCOUNT_RECOVERY` for locked/deactivated account recovery. Profile
verification status is derived from the `users` email/phone flags;
`user_profiles` has no verification column.

`organization_documents` stores metadata only; file bytes and storage providers
are external. `notification_preferences` is unique per user/channel/event.
`role_profile_extensions` is unique per user/role/scope and its raw check
requires `PLATFORM` with a null organization or the organization UUID repeated
in `scope_key`. Farmer agricultural data remains in `farmer_profiles` rather
than a `FARMER` role extension. Partial unique indexes keep one primary address
per user and per organization.

`refresh_tokens.rotated_to_id` is the single self-FK; Prisma exposes the inverse side as `rotated_from`.

## Agriculture

```mermaid
erDiagram
  farmer_profiles {
    uuid id PK
    uuid user_id FK
    uuid organization_id FK
    varchar farmer_code UK
    VerificationStatus verification_status
    decimal farm_size_hectares
    uuid primary_crop_id FK
  }
  farms {
    uuid id PK
    uuid organization_id FK
    uuid owner_user_id FK
    varchar name
    text description
    varchar code UK
    FarmType farm_type
    FarmStatus status
    AreaUnit area_unit
    decimal area_value
    decimal total_area_hectares
    LandOwnership ownership_type
    varchar ownership_reference
    uuid operator_user_id FK
    varchar operator_name
    varchar operator_phone
    varchar operator_email
    timestamp operating_since
    uuid farmer_profile_id FK
  }
  farm_locations {
    uuid id PK
    uuid farm_id FK
    uuid division_id FK
    uuid district_id FK
    uuid upazila_id FK
    uuid union_id FK
    geometry location
    geometry boundary
  }
  land_parcels {
    uuid id PK
    uuid organization_id FK
    uuid farm_id FK
    varchar code
    AreaUnit area_unit
    decimal area_value
    decimal area_hectares
    LandOwnership ownership_type
    LandParcelStatus status
    geometry boundary
  }
  farm_soil_profiles {
    uuid id PK
    uuid organization_id FK
    uuid farm_id FK UK
    varchar soil_type
    FarmSoilTexture texture
    decimal ph
    decimal organic_matter_percent
    SoilFertility fertility
    varchar drainage
    timestamp tested_at
    varchar testing_lab
    text notes
  }
  farm_irrigations {
    uuid id PK
    uuid organization_id FK
    uuid farm_id FK
    varchar code
    IrrigationSource source
    IrrigationMethod method
    IrrigationStatus status
    decimal capacity_liters_per_minute
    decimal command_area_hectares
    int frequency_per_week
    text notes
  }
  crops {
    uuid id PK
    varchar code UK
    CropCategory category
    boolean is_active
  }
  crop_varieties {
    uuid id PK
    uuid crop_id FK
    varchar code
    int maturity_days
  }
  crop_seasons {
    uuid id PK
    uuid organization_id FK
    varchar code UK
    int start_month
    int end_month
  }
  crop_calendars {
    uuid id PK
    uuid organization_id FK
    varchar scope_key
    uuid crop_id FK
    uuid crop_variety_id FK
    varchar code
    int sowing_start_month
    int sowing_end_month
    int harvest_days_min
    int harvest_days_max
    boolean is_active
  }
  agronomic_recommendations {
    uuid id PK
    uuid organization_id FK
    varchar scope_key
    uuid crop_id FK
    uuid crop_variety_id FK
    uuid calendar_id FK
    varchar code
    RecommendationSource source
    decimal confidence
    varchar rule_key
    timestamp valid_from
    timestamp valid_until
    boolean is_active
  }
  cultivations {
    uuid id PK
    uuid organization_id FK
    uuid farm_id FK
    uuid land_parcel_id FK
    uuid crop_variety_id FK
    uuid crop_season_id FK
    uuid crop_calendar_id FK
    uuid crop_id FK
    varchar code
    CultivationStatus status
    timestamp sown_at
    timestamp planted_at
    timestamp expected_harvest_at
    timestamp harvested_at
    GrowthStage growth_stage
    decimal area_hectares
    decimal expected_yield_kg
  }
  farm_activities {
    uuid id PK
    uuid organization_id FK
    uuid farm_id FK
    uuid cultivation_id FK
    uuid land_parcel_id FK
    uuid input_id FK
    uuid performed_by_user_id FK
    FarmActivityType activity_type
    timestamp activity_date
    GrowthStage growth_stage
    ObservationSeverity observation_severity
    decimal quantity
    varchar unit_code
    decimal cost_amount
    char currency
  }
  harvests {
    uuid id PK
    uuid organization_id FK
    uuid cultivation_id FK
    uuid farm_id FK
    decimal quantity_kg
    HarvestStatus status
  }
  farm_expenses {
    uuid id PK
    uuid organization_id FK
    uuid farm_id FK
    uuid cultivation_id FK
    ExpenseCategory category
    ExpenseSource source
    timestamp expense_date
    decimal amount
    char currency
    varchar receipt_url
    varchar estimate_rule_key
    decimal confidence
  }
  agricultural_inputs {
    uuid id PK
    uuid organization_id FK
    varchar code UK
    AgriculturalInputCategory category
    varchar unit_code
    boolean is_active
  }

  users ||--o| farmer_profiles : user
  organizations |o--o{ farmer_profiles : organization
  crops |o--o{ farmer_profiles : primary_crop
  users ||--o{ farms : owner
  users |o--o{ farms : operator
  organizations |o--o{ farms : organization
  farmer_profiles |o--o{ farms : farmer_profile
  farms ||--o| farm_locations : farm
  divisions |o--o{ farm_locations : division
  districts |o--o{ farm_locations : district
  upazilas |o--o{ farm_locations : upazila
  unions |o--o{ farm_locations : union
  organizations |o--o{ land_parcels : organization
  farms ||--o{ land_parcels : farm
  organizations |o--o{ farm_soil_profiles : organization
  farms ||--o| farm_soil_profiles : soil_profile
  organizations |o--o{ farm_irrigations : organization
  farms ||--o{ farm_irrigations : irrigation
  crops ||--o{ crop_varieties : crop
  organizations |o--o{ crop_seasons : organization
  organizations |o--o{ crop_calendars : organization
  crops ||--o{ crop_calendars : crop
  crop_varieties |o--o{ crop_calendars : crop_variety
  organizations |o--o{ agronomic_recommendations : organization
  crops ||--o{ agronomic_recommendations : crop
  crop_varieties |o--o{ agronomic_recommendations : crop_variety
  crop_calendars |o--o{ agronomic_recommendations : calendar
  organizations |o--o{ cultivations : organization
  farms ||--o{ cultivations : farm
  land_parcels |o--o{ cultivations : land_parcel
  crop_varieties ||--o{ cultivations : crop_variety
  crop_seasons |o--o{ cultivations : crop_season
  crop_calendars |o--o{ cultivations : crop_calendar
  crops |o--o{ cultivations : crop
  organizations |o--o{ farm_activities : organization
  farms ||--o{ farm_activities : farm
  cultivations |o--o{ farm_activities : cultivation
  land_parcels |o--o{ farm_activities : land_parcel
  agricultural_inputs |o--o{ farm_activities : input
  users |o--o{ farm_activities : performed_by
  organizations |o--o{ harvests : organization
  cultivations ||--o{ harvests : cultivation
  farms ||--o{ harvests : farm
  organizations |o--o{ farm_expenses : organization
  farms ||--o{ farm_expenses : farm
  cultivations |o--o{ farm_expenses : cultivation
  organizations |o--o{ agricultural_inputs : organization
```

`farm_locations.farm_id` is also `UNIQUE` (one location per farm), and all foreign-key columns use `snake_case`. Farm and parcel areas store both the submitted `area_unit`/`area_value` and a canonical `area_hectares` (`total_area_hectares` on farms); allowed units are `HECTARE`, `ACRE`, and `SQUARE_METER`. `farm_soil_profiles.farm_id` is unique (one profile per farm), while `farm_irrigations` is unique on `(farm_id, code)` and holds multiple records per farm. Soil and irrigation rows repeat `organization_id` and are covered by the same tenant-match and farm tenant-immutability triggers as parcels.

`crop_calendars` and `agronomic_recommendations` are unique on `(scope_key, code)`, and cultivations are unique on `(farm_id, code)`. `scope_key` is `GLOBAL` only when `organization_id` is null; tenant rows use the organization UUID as both values. Cultivations and expenses carry `organization_id` from their farm, and constraint triggers reject mixed crop/variety pairs, mismatched recommendation calendars, and tenant reassignment while expenses still reference the old tenant. `farm_expenses.source` separates `RECORDED` actual costs from `AI_ESTIMATED` values; estimates require `estimate_rule_key`, while recorded rows must not carry estimate metadata. A cultivation may omit `cultivation_id` on an expense, in which case the farm-level cost remains unallocated in per-cultivation reports.

## Marketplace

```mermaid
erDiagram
  product_categories {
    uuid id PK
    uuid organization_id FK
    uuid parent_id FK
    varchar code UK
    varchar name
    boolean is_active
  }
  products {
    uuid id PK
    uuid organization_id FK
    uuid category_id FK
    uuid farmer_profile_id FK
    varchar sku UK
    varchar name
    timestamp deleted_at
  }
  product_images {
    uuid id PK
    uuid product_id FK
    text url
    int sort_order
  }
  product_inventories {
    uuid id PK
    uuid organization_id FK
    uuid product_id FK
    uuid warehouse_id FK
    varchar scope_key
    decimal quantity_on_hand
    decimal quantity_reserved
    decimal available_quantity
  }
  product_listings {
    uuid id PK
    uuid organization_id FK
    uuid product_id FK
    uuid seller_user_id FK
    uuid inventory_id FK
    ListingStatus status
    decimal unit_price
    char currency
    decimal quantity_available
    decimal min_order_quantity
  }
  listing_locations {
    uuid id PK
    uuid listing_id FK
    uuid division_id FK
    uuid district_id FK
    uuid upazila_id FK
    uuid union_id FK
    geometry location
    int radius_meters
  }
  price_history {
    uuid id PK
    uuid organization_id FK
    uuid product_id FK
    uuid listing_id FK
    decimal price
    PriceSource source
    timestamp observed_at
  }

  organizations |o--o{ product_categories : organization
  product_categories |o--o{ product_categories : parent
  organizations |o--o{ products : organization
  product_categories ||--o{ products : category
  farmer_profiles |o--o{ products : farmer_profile
  products ||--o{ product_images : product
  organizations |o--o{ product_inventories : organization
  products ||--o{ product_inventories : product
  warehouses |o--o{ product_inventories : warehouse
  organizations |o--o{ product_listings : organization
  products ||--o{ product_listings : product
  users ||--o{ product_listings : seller
  product_inventories |o--o{ product_listings : inventory
  product_listings ||--o{ listing_locations : listing
  divisions |o--o{ listing_locations : division
  districts |o--o{ listing_locations : district
  upazilas |o--o{ listing_locations : upazila
  unions |o--o{ listing_locations : union
  organizations |o--o{ price_history : organization
  products ||--o{ price_history : product
  product_listings |o--o{ price_history : listing
```

`product_categories.parent_id` is the self-FK; Prisma exposes the inverse side as `children`.

## Commerce

```mermaid
erDiagram
  carts {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    CartStatus status
    char currency
  }
  cart_items {
    uuid id PK
    uuid cart_id FK
    uuid listing_id FK
    decimal quantity
    decimal unit_price_snapshot
    char currency
  }
  orders {
    uuid id PK
    uuid organization_id FK
    uuid cart_id FK
    uuid buyer_user_id FK
    uuid seller_user_id FK
    OrderStatus status
    decimal subtotal_amount
    decimal discount_amount
    decimal delivery_fee_amount
    decimal tax_amount
    decimal total_amount
    char currency
  }
  order_items {
    uuid id PK
    uuid order_id FK
    uuid product_id FK
    uuid listing_id FK
    decimal quantity
    decimal unit_price
    decimal line_total
    char currency
  }
  payments {
    uuid id PK
    uuid organization_id FK
    uuid order_id FK
    uuid user_id FK
    varchar provider_code
    varchar idempotency_key UK
    PaymentMethod method
    PaymentStatus status
    decimal amount
    decimal captured_amount
    decimal refunded_amount
  }
  refunds {
    uuid id PK
    uuid organization_id FK
    uuid payment_id FK
    uuid order_id FK
    decimal amount
    RefundReason reason
    RefundStatus status
  }
  transactions {
    uuid id PK
    uuid organization_id FK
    uuid payment_id FK
    uuid refund_id FK
    uuid order_id FK
    TransactionType transaction_type
    TransactionDirection direction
    decimal amount
    TransactionStatus status
  }
  ledger_accounts {
    uuid id PK
    uuid organization_id FK
    varchar code UK
    LedgerAccountType account_type
    NormalBalance normal_balance
  }
  ledger_entries {
    uuid id PK
    uuid organization_id FK
    uuid transaction_id FK
    uuid account_id FK
    uuid order_id FK
    uuid settlement_id FK
    uuid reversal_of_id FK
    TransactionDirection direction
    decimal amount
    timestamp posted_at
  }
  commissions {
    uuid id PK
    uuid organization_id FK
    uuid order_id FK
    uuid seller_user_id FK
    uuid settlement_id FK
    varchar rule_key
    CommissionBasis basis
    decimal rate
    decimal amount
  }
  settlements {
    uuid id PK
    uuid organization_id FK
    uuid seller_user_id FK
    varchar rule_key
    decimal gross_amount
    decimal deductions_amount
    decimal net_amount
    SettlementStatus status
  }

  organizations |o--o{ carts : organization
  users ||--o{ carts : user
  carts ||--o{ cart_items : cart
  product_listings ||--o{ cart_items : listing
  organizations |o--o{ orders : organization
  carts |o--o{ orders : cart
  users ||--o{ orders : buyer
  users ||--o{ orders : seller
  orders ||--o{ order_items : order
  products ||--o{ order_items : product
  product_listings |o--o{ order_items : listing
  organizations |o--o{ payments : organization
  orders ||--o{ payments : order
  users ||--o{ payments : user
  organizations |o--o{ refunds : organization
  payments ||--o{ refunds : payment
  orders ||--o{ refunds : order
  organizations |o--o{ transactions : organization
  payments |o--o{ transactions : payment
  refunds |o--o{ transactions : refund
  orders |o--o{ transactions : order
  organizations |o--o{ ledger_accounts : organization
  organizations |o--o{ ledger_entries : organization
  transactions |o--o{ ledger_entries : transaction
  ledger_accounts ||--o{ ledger_entries : account
  orders |o--o{ ledger_entries : order
  settlements |o--o{ ledger_entries : settlement
  ledger_entries |o--o{ ledger_entries : reversal_of
  organizations |o--o{ commissions : organization
  orders |o--o{ commissions : order
  users ||--o{ commissions : seller
  settlements |o--o{ commissions : settlement
  organizations |o--o{ settlements : organization
  users ||--o{ settlements : seller
```

`ledger_entries.reversal_of_id` is the self-FK; Prisma exposes the inverse side as `reversals`.

## Logistics

```mermaid
erDiagram
  shipments {
    uuid id PK
    uuid organization_id FK
    uuid order_id FK
    uuid provider_id FK
    uuid pickup_address_id FK
    uuid destination_address_id FK
    varchar tracking_number
    ShipmentStatus status
  }
  deliveries {
    uuid id PK
    uuid shipment_id FK
    int attempt_number
    DeliveryStatus status
  }
  logistics_providers {
    uuid id PK
    varchar code UK
    varchar name
    boolean is_active
  }
  warehouses {
    uuid id PK
    uuid organization_id FK
    varchar code UK
    uuid manager_user_id FK
    uuid address_id FK
    uuid division_id FK
    uuid district_id FK
    uuid upazila_id FK
    uuid union_id FK
    geometry location
    WarehouseStatus status
  }
  warehouse_inventories {
    uuid id PK
    uuid warehouse_id FK
    uuid product_id FK
    varchar batch_code
    decimal quantity_on_hand
    decimal quantity_reserved
    decimal available_quantity
  }
  quality_inspections {
    uuid id PK
    uuid organization_id FK
    uuid shipment_id FK
    uuid warehouse_inventory_id FK
    uuid product_id FK
    uuid inspector_user_id FK
    InspectionResult result
  }
  traceability_records {
    uuid id PK
    uuid organization_id FK
    uuid product_id FK
    uuid harvest_id FK
    uuid cultivation_id FK
    uuid shipment_id FK
    varchar batch_code
    TraceabilityEventType event_type
    geometry location
    jsonb metadata
  }

  organizations |o--o{ shipments : organization
  orders ||--o{ shipments : order
  logistics_providers |o--o{ shipments : provider
  organization_addresses |o--o{ shipments : pickup_address
  organization_addresses |o--o{ shipments : destination_address
  shipments ||--o{ deliveries : shipment
  organizations ||--o{ warehouses : organization
  users |o--o{ warehouses : manager
  organization_addresses |o--o{ warehouses : address
  divisions |o--o{ warehouses : division
  districts |o--o{ warehouses : district
  upazilas |o--o{ warehouses : upazila
  unions |o--o{ warehouses : union
  warehouses ||--o{ warehouse_inventories : warehouse
  products ||--o{ warehouse_inventories : product
  organizations |o--o{ quality_inspections : organization
  shipments |o--o{ quality_inspections : shipment
  warehouse_inventories |o--o{ quality_inspections : warehouse_inventory
  products |o--o{ quality_inspections : product
  users ||--o{ quality_inspections : inspector
  organizations |o--o{ traceability_records : organization
  products |o--o{ traceability_records : product
  harvests |o--o{ traceability_records : harvest
  cultivations |o--o{ traceability_records : cultivation
  shipments |o--o{ traceability_records : shipment
```

## AI

```mermaid
erDiagram
  knowledge_sources {
    uuid id PK
    uuid organization_id FK
    varchar code UK
    KnowledgeSourceType source_type
    boolean is_active
  }
  knowledge_documents {
    uuid id PK
    uuid organization_id FK
    uuid source_id FK
    varchar title
    LanguageCode language
    DocumentStatus status
    jsonb metadata
  }
  knowledge_chunks {
    uuid id PK
    uuid document_id FK
    int chunk_index
    text content
    int token_count
  }
  embedding_references {
    uuid id PK
    uuid organization_id FK
    uuid chunk_id FK
    varchar vector_collection
    varchar vector_id
    varchar embedding_model
    int dimensions
  }
  conversations {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    varchar title
    varchar status
  }
  chat_messages {
    uuid id PK
    uuid conversation_id FK
    ChatRole role
    text content
  }
  ai_recommendations {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    uuid conversation_id FK
    varchar entity_type
    varchar entity_id
    RecommendationType recommendation_type
    jsonb payload
    decimal confidence_score
    RecommendationStatus status
  }
  agent_executions {
    uuid id PK
    uuid organization_id FK
    uuid initiated_by_user_id FK
    uuid conversation_id FK
    varchar agent_name
    AgentStatus status
    jsonb input
    jsonb output
  }
  ai_feedback {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    uuid recommendation_id FK
    uuid agent_execution_id FK
    int rating
  }

  organizations |o--o{ knowledge_sources : organization
  organizations |o--o{ knowledge_documents : organization
  knowledge_sources |o--o{ knowledge_documents : source
  knowledge_documents ||--o{ knowledge_chunks : document
  organizations |o--o{ embedding_references : organization
  knowledge_chunks |o--o{ embedding_references : chunk
  organizations |o--o{ conversations : organization
  users ||--o{ conversations : user
  conversations ||--o{ chat_messages : conversation
  organizations |o--o{ ai_recommendations : organization
  users |o--o{ ai_recommendations : user
  conversations |o--o{ ai_recommendations : conversation
  organizations |o--o{ agent_executions : organization
  users |o--o{ agent_executions : initiated_by
  conversations |o--o{ agent_executions : conversation
  organizations |o--o{ ai_feedback : organization
  users ||--o{ ai_feedback : user
  ai_recommendations |o--o{ ai_feedback : recommendation
  agent_executions |o--o{ ai_feedback : agent_execution
```

## SaaS

```mermaid
erDiagram
  subscription_plans {
    uuid id PK
    varchar code UK
    BillingInterval billing_interval
    char currency
    decimal price_amount
    int trial_days
    boolean is_active
  }
  subscriptions {
    uuid id PK
    uuid organization_id FK
    uuid plan_id FK
    SubscriptionStatus status
    timestamp starts_at
    timestamp ends_at
  }
  subscription_invoices {
    uuid id PK
    uuid organization_id FK
    uuid subscription_id FK
    varchar invoice_number UK
    decimal amount
    InvoiceStatus status
  }
  usage_records {
    uuid id PK
    uuid organization_id FK
    uuid subscription_id FK
    varchar metric_code
    decimal quantity
    timestamp period_start
    timestamp period_end
  }

  subscription_plans ||--o{ subscriptions : plan
  organizations ||--o{ subscriptions : organization
  subscriptions ||--o{ subscription_invoices : subscription
  organizations |o--o{ subscription_invoices : organization
  subscriptions |o--o{ usage_records : subscription
  organizations |o--o{ usage_records : organization
```

## System and reliability

```mermaid
erDiagram
  notifications {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    NotificationChannel channel
    varchar type
    NotificationStatus status
  }
  audit_logs {
    uuid id PK
    uuid organization_id FK
    uuid actor_user_id FK
    varchar action
    varchar entity_type
    varchar entity_id
    AuditSeverity severity
  }
  outbox_events {
    uuid id PK
    uuid organization_id FK
    varchar aggregate_type
    varchar aggregate_id
    varchar event_type
    jsonb payload
    OutboxStatus status
    int attempts
  }
  feature_flags {
    uuid id PK
    uuid organization_id FK
    varchar key
    varchar scope_key
    jsonb conditions
    boolean is_enabled
  }
  platform_settings {
    uuid id PK
    uuid organization_id FK
    varchar key
    varchar scope_key
    jsonb value
    boolean is_active
  }

  organizations |o--o{ notifications : organization
  users ||--o{ notifications : user
  organizations |o--o{ audit_logs : organization
  users |o--o{ audit_logs : actor
  organizations |o--o{ outbox_events : organization
  organizations |o--o{ feature_flags : organization
  organizations |o--o{ platform_settings : organization
```

`platform_settings` has no relations other than its optional organization scope; business policies that are not yet decided are addressed by `key` + `scope_key` rather than hardcoded tables or values.
